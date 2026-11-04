import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';

async function serverFor(t, request) {
  const verify = async () => { throw new Error('no session'); };
  const server = createApp({ events: 'http://events', registrations: 'http://registrations' }, request, verify).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  return 'http://127.0.0.1:' + server.address().port;
}

test('public event availability is one explicit route to Registration, with no caching', async t => {
  const eventId = randomUUID();
  const payload = { eventId, checkedAt: new Date().toISOString(), activities: [{ activityId: randomUUID(), capacity: 10, availableSeats: 3 }] };
  const calls = [];
  const base = await serverFor(t, async (url, options) => {
    calls.push({ url, options });
    return Response.json(payload);
  });
  const response = await fetch(base + '/events/' + eventId + '/availability');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), payload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://registrations/availability/events/' + eventId);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers['x-internal-key'], undefined);
  assert.equal((await fetch(base + '/availability/events/' + eventId)).status, 404);
  assert.equal((await fetch(base + '/internal/registrations/' + randomUUID())).status, 404);
  assert.equal((await fetch(base + '/registrations')).status, 401);
  assert.equal((await fetch(base + '/events/' + eventId + '/availability', { method: 'POST' })).status, 404);
  assert.equal(calls.length, 1);
});

test('availability preserves hidden event errors and reports failed dependency instead of fabricated capacity', async t => {
  let offline = false;
  const base = await serverFor(t, async () => {
    if (offline) throw new Error('offline');
    return Response.json({ detail: 'Evento não encontrado.' }, { status: 404 });
  });
  assert.equal((await fetch(base + '/events/' + randomUUID() + '/availability')).status, 404);
  offline = true;
  const response = await fetch(base + '/events/' + randomUUID() + '/availability');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'dependency_unavailable');
});
