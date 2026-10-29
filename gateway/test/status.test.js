import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('dependency failure reports degradation without stopping the gateway', async (t) => {
  const request = async (url) => {
    if (url.startsWith('http://offline')) throw new Error('offline');
    return Response.json({ status: 'ready' });
  };
  const server = createApp({ events: 'http://online', notifications: 'http://offline' }, request).listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(base + '/status', { headers: { 'x-request-id': 'integration-123' } });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-request-id'), 'integration-123');
  assert.deepEqual((await response.json()).services, [
    { name: 'events', status: 'ready' }, { name: 'notifications', status: 'unavailable' },
  ]);
  assert.equal((await fetch(base + '/health')).status, 200);
});

