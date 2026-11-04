import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createRecoveryRouter } from '../src/routes/recovery.js';

async function serve(t, pool, options) {
  const app = express(); app.use(express.json()); app.use(createRecoveryRouter(pool, options));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  return 'http://127.0.0.1:' + server.address().port;
}

test('SMTP recovery queues atomically and returns the same public response for unknown accounts', async t => {
  const id = randomUUID(), statements = [], messages = [];
  const pool = {
    async query(_sql, values) { return { rows: values[0] === 'known@example.test' ? [{ id }] : [] }; },
    async connect() { return { async query(sql) { statements.push(sql); return {}; }, release() {} }; },
  };
  const base = await serve(t, pool, { env: { MAIL_MODE: 'smtp', PUBLIC_APP_URL: 'https://example.test' },
    mailOutbox: { async enqueue(_client, message) { messages.push(message); }, async flush() { assert.fail('SMTP must run outside the HTTP request'); } } });
  const post = email => fetch(base + '/auth/password/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
  const known = await post('known@example.test'), unknown = await post('unknown@example.test');
  assert.equal(known.status, 202); assert.equal(unknown.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /https:\/\/example.test\/redefinir-senha#token=[a-f0-9]{64}/);
  assert.equal(statements.at(-1), 'COMMIT');
  assert.ok(statements.some(sql => sql.startsWith('INSERT INTO password_resets')));
});

test('reset consumes one-time token, rotates credentials, removes other reset links in one transaction', async t => {
  const id = randomUUID(), statements = []; let used = false;
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.startsWith('SELECT id AS user_id')) return { rows: used ? [] : [{ user_id: id }] };
      if (sql.startsWith('DELETE FROM password_resets WHERE token_hash')) { used = true; return { rows: [{ user_id: id }] }; }
      return { rows: [] };
    }, release() {},
  };
  const base = await serve(t, { async connect() { return client; } }, { mailOutbox: {} });
  const post = () => fetch(base + '/auth/password/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'a'.repeat(64), password: 'Senha redefinida 123!' }) });
  assert.equal((await post()).status, 200);
  assert.ok(statements.some(sql => sql.includes('credentials_version=credentials_version+1')));
  assert.ok(statements.some(sql => sql === 'DELETE FROM password_resets WHERE user_id=$1'));
  assert.equal(statements.at(-1), 'COMMIT');
  assert.equal((await post()).status, 400);
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.filter(sql => sql.startsWith('UPDATE users')).length, 1);
});
