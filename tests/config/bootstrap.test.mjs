import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('fresh example bootstraps secrets without duplicate variables and preserves them on repetition', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'eventhub-config-'));
  t.after(async () => {
    const checked = await realpath(directory), allowedPrefix = resolve(tmpdir()) + sep + 'eventhub-config-';
    if (!checked.startsWith(allowedPrefix)) throw Error('Unexpected QA directory');
    await rm(checked, { recursive: true });
  });
  await mkdir(join(directory, 'scripts'));
  await copyFile(new URL('../../.env.example', import.meta.url), join(directory, '.env'));
  const scripts = ['init-identity-keys.mjs', 'init-internal-key.mjs', 'init-backend-config.mjs'];
  for (const script of scripts) await copyFile(new URL('../../scripts/' + script, import.meta.url), join(directory, 'scripts', script));
  const run = () => { for (const script of scripts) execFileSync(process.execPath, [join(directory, 'scripts', script)], { stdio: 'pipe' }); };
  run();
  const first = await readFile(join(directory, '.env'), 'utf8');
  const values = Object.fromEntries(first.split(/\r?\n/).filter(line => /^[A-Z_][A-Z0-9_]*=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  for (const key of ['POSTGRES_PASSWORD','IDENTITY_DB_PASSWORD','EVENT_DB_PASSWORD','REGISTRATION_DB_PASSWORD','PAYMENT_DB_PASSWORD',
    'NOTIFICATION_DB_PASSWORD','ATTENDANCE_DB_PASSWORD','CERTIFICATE_DB_PASSWORD','REPORTING_DB_PASSWORD','PROVIDER_DB_PASSWORD',
    'RABBITMQ_PASSWORD','INTERNAL_API_KEY','PAYMENT_PROVIDER_API_KEY']) {
    assert.ok(values[key]?.length >= 32, 'Missing generated value: ' + key);
    assert.equal(first.split(/\r?\n/).filter(line => line.startsWith(key + '=')).length, 1, 'Duplicate variable: ' + key);
  }
  assert.ok(values.JWT_PRIVATE_KEY_BASE64.length > 100); assert.ok(values.JWT_PUBLIC_KEY_BASE64.length > 100);
  assert.equal(values.MAIL_MODE, 'mailbox');
  run();
  const second = await readFile(join(directory, '.env'), 'utf8');
  assert.equal(createHash('sha256').update(first).digest('hex'), createHash('sha256').update(second).digest('hex'));
});
