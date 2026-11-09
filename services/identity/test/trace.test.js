import test from 'node:test';
import assert from 'node:assert/strict';
import { traces } from '../src/trace.js';
import { createMailOutbox } from '../src/mail/outbox.js';

test('mail outbox persists HTTP trace and logs background delivery without recipient or link', async t => {
  let stored;
  const logs = [];
  t.mock.method(console, 'log', entry => logs.push(JSON.parse(entry)));
  const client = { release() {}, async query(sql, values) {
    if (sql.startsWith('INSERT INTO mail_outbox')) stored = JSON.parse(values[1]);
    return { rows: sql.startsWith('SELECT id,payload') ? [{ id: stored.id, payload: stored }] : [] };
  } };
  const sent = [];
  const outbox = createMailOutbox({ async connect() { return client; } }, { async send(message) { sent.push(message); } });
  await traces.run({ correlationId: 'mail-origin', requestId: 'mail-operation' }, () => outbox.enqueue(client, { id: 'mail-id', to: 'synthetic@example.test', text: 'Private link content', path: '/secret-token' }));
  assert.equal(stored.correlationId, 'mail-origin');
  assert.equal(stored.requestId, 'mail-operation');
  await outbox.flush();
  assert.equal(sent[0].correlationId, 'mail-origin');
  assert.equal(logs[0].correlationId, 'mail-origin');
  assert.equal(logs[0].messageId, 'mail-id');
  assert.ok(!JSON.stringify(logs).includes('synthetic@'));
  assert.ok(!JSON.stringify(logs).includes('secret-token'));
});
