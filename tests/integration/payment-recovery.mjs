// Additional delayed-payment/recovery checks, confined to existing QA fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const origin = 'http://127.0.0.1:18080';
const provider = 'eventhub-rules-qa-payment-provider-1';
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).trim();
async function request(path, user, method = 'GET', body, headers = {}) {
  const result = await fetch(origin + '/api' + path, { method, headers: { ...(user ? { authorization: 'Bearer ' + user.accessToken } : {}),
    ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return { status: result.status, data: await result.json() };
}
async function ok(...args) {
  const result = await request(...args);
  assert.ok(result.status >= 200 && result.status < 300, `${args[0]}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
function callback(id) {
  const code = `import json,os,urllib.request
q=urllib.request.Request('http://registrations:8000/internal/registrations/${id}/payment',data=b'{"outcome":"APPROVED"}',headers={'x-internal-key':os.environ['INTERNAL_API_KEY'],'content-type':'application/json'})
print(json.load(urllib.request.urlopen(q))['registration']['status'])`;
  return docker(['exec', 'eventhub-rules-qa-registrations-1', 'python', '-c', code]);
}

test('delayed cancellation callback and payment-provider recovery use valid terminal transitions', { timeout: 180000 }, async t => {
  assert.equal(docker(['inspect', '--format', '{{ index .Config.Labels "com.docker.compose.project" }}', provider]), 'eventhub-rules-qa');
  const fixtures = JSON.parse(await readFile(new URL('../../tmp/rules-qa/browser-fixtures.json', import.meta.url), 'utf8'));
  const organizer = await ok('/auth/login', null, 'POST', { email: fixtures.organizer.email, password: fixtures.password });
  const participant = await ok('/auth/login', null, 'POST', { email: fixtures.participant.email, password: fixtures.password });
  const startsAt = new Date(Date.now() + 86400000).toISOString(), endsAt = new Date(Date.now() + 90000000).toISOString();
  const { event } = await ok('/events', organizer, 'POST', { organizationId: organizer.user.organizationId,
    title: 'Recuperação QA ' + randomUUID(), description: 'Dados sintéticos para confirmar recuperação e transições terminais.',
    category: 'Tecnologia', hours: 1, modality: 'Presencial', location: 'Laboratório QA', streamUrl: '', startsAt, endsAt, sessionTime: 'QA',
    speakers: [], activities: ['Cancelamento tardio', 'Provedor temporariamente indisponível'].map(title => ({ title, startsAt, endsAt,
      location: 'Sala QA', responsible: 'Docente QA', capacity: 1, priceCents: 1000, waitlistEnabled: false })) });
  await ok(`/events/${event.id}/publish`, organizer, 'POST', {});
  const reserve = async activity => (await ok('/registrations', participant, 'POST', { eventId: event.id, activityId: activity.id }, { 'idempotency-key': randomUUID() })).registration;
  await t.test('approval arriving after cancellation cannot reclaim the released seat', async () => {
    const registration = await reserve(event.activities[0]);
    assert.equal((await ok(`/registrations/${registration.id}/cancel`, participant, 'POST', {})).registration.status, 'CANCELLED');
    assert.equal(callback(registration.id), 'CANCELLED');
    assert.equal(callback(registration.id), 'CANCELLED');
    assert.equal((await ok(`/registrations/${registration.id}`, participant)).registration.status, 'CANCELLED');
    assert.equal((await request(`/payments/${registration.id}`, participant, 'POST', { outcome: 'APPROVED' })).status, 409);
    const availability = await ok(`/events/${event.id}/availability`);
    assert.equal(availability.activities.find(a => a.activityId === registration.activityId).availableSeats, 1);
  });
  await t.test('provider outage persists one pending transaction and reconciliation confirms after recovery', async () => {
    const registration = await reserve(event.activities[1]);
    docker(['stop', '-t', '10', provider]);
    try {
      const pending = await request(`/payments/${registration.id}`, participant, 'POST', { outcome: 'APPROVED' });
      assert.equal(pending.status, 202);
      assert.equal(pending.data.payment.status, 'PENDING');
      assert.equal((await ok(`/registrations/${registration.id}`, participant)).registration.status, 'PENDING_PAYMENT');
    } finally { docker(['start', provider]); }
    let payment;
    for (let attempt = 0; attempt < 30; attempt++) {
      payment = (await ok(`/payments/${registration.id}`, participant)).payment;
      if (payment.status === 'APPROVED') break;
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    assert.equal(payment.status, 'APPROVED');
    assert.equal((await ok(`/registrations/${registration.id}`, participant)).registration.status, 'CONFIRMED');
    assert.equal(callback(registration.id), 'CONFIRMED');
  });
});
