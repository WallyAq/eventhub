import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('gateway forwards bounded context and returns the durable domain correlation', async t => {
  const calls = [], verifications = [];
  const server = createApp({ payments: 'http://payments' }, async (url, init) => {
    calls.push(init.headers);
    return Response.json({ payment: { correlationId: 'original-registration' } }, { headers: { 'x-correlation-id': 'original-registration' } });
  }, async (_token, context) => verifications.push(context)).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/payments/registration', { method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': 'payment-operation', 'x-correlation-id': 'incoming-operation' }, body: '{"outcome":"APPROVED"}' });
  assert.equal(response.status, 200);
  assert.equal(calls[0]['x-request-id'], 'payment-operation');
  assert.equal(calls[0]['x-correlation-id'], 'incoming-operation');
  assert.equal(verifications[0].correlationId, 'incoming-operation');
  assert.equal(response.headers.get('x-request-id'), 'payment-operation');
  assert.equal(response.headers.get('x-correlation-id'), 'original-registration');
});
