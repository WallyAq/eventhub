import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createMailDelivery, recoveryMessage } from '../src/mail/delivery.js';
import { createMailOutbox } from '../src/mail/outbox.js';

test('mailbox retains the reset fragment locally; SMTP requires a public recovery origin', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eventhub-mail-test-'));
  try {
    const message = recoveryMessage({ id: randomUUID(), email: 'pessoa@example.test', token: 'a'.repeat(64) }, {});
    await createMailDelivery({ MAILBOX_DIRECTORY: directory }).send(message);
    const filename = createHash('sha256').update(message.to).digest('hex') + '.json';
    assert.equal(JSON.parse(await readFile(join(directory, filename), 'utf8')).path, '/redefinir-senha#token=' + 'a'.repeat(64));
    assert.throws(() => recoveryMessage({ id: '', email: '', token: '' }, { MAIL_MODE: 'smtp' }), /PUBLIC_APP_URL/);
  } finally { await rm(directory, { recursive: true }); }
});

test('SMTP rejection fails delivery, successful acceptance uses stable message id', async () => {
  const message = recoveryMessage({ id: randomUUID(), email: 'pessoa@example.test', token: 'a'.repeat(64) });
  const env = { MAIL_MODE: 'smtp', SMTP_HOST: 'smtp.example.test', MAIL_FROM: 'EventHub <no-reply@example.test>' };
  let sent;
  await createMailDelivery(env, { transport: { async sendMail(value) { sent = value; return { accepted: [message.to], rejected: [] }; } } }).send(message);
  assert.equal(sent.messageId, `<${message.id}@eventhub.local>`);
  await assert.rejects(createMailDelivery(env, { transport: { async sendMail() { return { accepted: [], rejected: [message.to] }; } } }).send(message), /did not accept/);
});

test('outbox commits failed attempts and never marks failed SMTP SENT', async () => {
  const statements = [], row = { id: randomUUID(), payload: { to: 'pessoa@example.test' }, attempts: 0 };
  const pool = { async connect() { return { async query(sql) { statements.push(sql); return { rows: sql.startsWith('SELECT') ? [row] : [] }; }, release() {} }; } };
  await createMailOutbox(pool, { async send() { throw new Error('SMTP offline'); } }).flush();
  assert.ok(statements.some(sql => sql.includes("status=CASE WHEN attempts+1>=3 THEN 'FAILED'")));
  assert.ok(!statements.some(sql => sql.includes("SET status='SENT'")));
  assert.equal(statements.at(-1), 'COMMIT');
  statements.length = 0;
  await createMailOutbox(pool, { async send() {} }).flush();
  assert.ok(statements.some(sql => sql.includes("SET status='SENT'")));
  assert.equal(statements.at(-1), 'COMMIT');
});
