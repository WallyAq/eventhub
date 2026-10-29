import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('readiness returns 503 when the database is unavailable', async (t) => {
  const server = createApp({ query: async () => { throw new Error('offline'); } }).listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/health')).status, 200);
  const response = await fetch(base + '/ready');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).status, 'unavailable');
});

