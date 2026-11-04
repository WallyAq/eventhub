import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base = process.env.EVENTHUB_URL || 'http://127.0.0.1:8080';

async function call(path, token, method = 'GET', body, key) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? {authorization: 'Bearer ' + token} : {}),
      ...(key ? {'idempotency-key': key} : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  return {status: response.status, body: await response.json()};
}

test('public activity availability follows reservations, payments, cancellations, expiry and FIFO without exposing people', {timeout: 240000}, async () => {
  const suffix = randomUUID();
  const privateValues = new Set();

  async function account(label) {
    const name = 'Pessoa QA vagas ' + label + ' ' + suffix;
    const email = 'qa-availability-' + label + '-' + suffix + '@example.test';
    const created = await call('/auth/register', null, 'POST', {name, email, password: 'Teste123'});
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const login = await call('/auth/login', null, 'POST', {email, password: 'Teste123'});
    assert.equal(login.status, 200, JSON.stringify(login.body));
    for (const value of [name, email, login.body.user.id]) privateValues.add(value);
    return {token: login.body.accessToken, id: login.body.user.id};
  }

  const owner = await account('owner');
  const a = await account('a');
  const b = await account('b');
  const c = await account('c');
  const organization = await call('/organizations', owner.token, 'POST', {name: 'Instituto QA vagas ' + suffix});
  assert.equal(organization.status, 201, JSON.stringify(organization.body));
  const startsAt = new Date(Date.now() + 86400000).toISOString();
  const endsAt = new Date(Date.now() + 2 * 86400000).toISOString();
  const activity = (title, capacity, priceCents) => ({
    title, startsAt, endsAt, capacity, priceCents,
    location: 'Sala QA', responsible: 'Docente QA', waitlistEnabled: true,
  });
  const created = await call('/events', owner.token, 'POST', {
    organizationId: organization.body.organization.id,
    title: 'Evento QA vagas ' + suffix,
    description: 'Evento com dados sintéticos para validar a disponibilidade pública de vagas.',
    category: 'Simpósio', hours: 8, modality: 'Presencial', location: 'Campus QA',
    streamUrl: '', startsAt, endsAt, sessionTime: 'BRT', featured: false,
    speakers: [{name: 'Docente QA', institution: 'UECE', email: 'qa-speaker-' + suffix + '@example.test'}],
    activities: [activity('Curso pago', 2, 5000), activity('Oficina gratuita', 1, 0)],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const event = created.body.event;
  const paid = event.activities[0];
  const free = event.activities[1];
  const availabilityPath = '/events/' + event.id + '/availability';
  privateValues.add('qa-speaker-' + suffix + '@example.test');

  // This is a public aggregate even if a caller owns the private draft.
  assert.equal((await call(availabilityPath)).status, 404);
  assert.equal((await call(availabilityPath, owner.token)).status, 404);
  const published = await call('/events/' + event.id + '/publish', owner.token, 'POST', {});
  assert.equal(published.status, 200, JSON.stringify(published.body));

  async function available(paidSeats, freeSeats) {
    // Deliberately omit authentication: the user-facing vacancy count is public.
    const result = await call(availabilityPath);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(Object.keys(result.body).sort(), ['activities', 'checkedAt', 'eventId']);
    assert.equal(result.body.eventId, event.id);
    assert.equal(typeof result.body.checkedAt, 'string');
    assert.ok(Number.isFinite(Date.parse(result.body.checkedAt)), 'checkedAt must be a valid timestamp');
    assert.equal(result.body.activities.length, 2);
    const expected = new Map([[paid.id, {capacity: 2, seats: paidSeats}], [free.id, {capacity: 1, seats: freeSeats}]]);
    for (const item of result.body.activities) {
      assert.deepEqual(Object.keys(item).sort(), ['activityId', 'availableSeats', 'capacity']);
      const matching = expected.get(item.activityId);
      assert.ok(matching, 'The response must only contain this event’s activities');
      assert.equal(item.capacity, matching.capacity);
      assert.equal(item.availableSeats, matching.seats);
      assert.ok(Number.isInteger(item.availableSeats) && item.availableSeats >= 0 && item.availableSeats <= item.capacity);
      expected.delete(item.activityId);
    }
    assert.equal(expected.size, 0, 'Each activity must be returned exactly once');
    const serialized = JSON.stringify(result.body);
    for (const value of privateValues) assert.equal(serialized.includes(value), false, 'Availability must not expose private names, e-mails, users or registrations');
  }

  async function reserve(person, selected, expectedStatus) {
    const result = await call('/registrations', person.token, 'POST', {eventId: event.id, activityId: selected.id}, randomUUID());
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.registration.status, expectedStatus);
    privateValues.add(result.body.registration.id);
    return result.body.registration;
  }

  async function cancel(person, registration) {
    const result = await call('/registrations/' + registration.id + '/cancel', person.token, 'POST', {});
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.registration.status, 'CANCELLED');
  }

  async function detail(person, registration, expectedStatus) {
    const result = await call('/registrations/' + registration.id, person.token);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.registration.status, expectedStatus);
  }

  function expireSynthetic(person, registration) {
    // Advance only this test's reservation, through the database role of its owning service.
    // The normal maintenance worker may observe it before the subsequent HTTP request;
    // either state must yield the same aggregate without stopping any service.
    const changed = execFileSync('docker', ['compose', 'exec', '-T', 'registrations', 'python', '-c',
      "import sys;from app.domain import db\nwith db() as c:\n r=c.execute(\"UPDATE registrations SET expires_at=now()-interval '1 second' WHERE id=%s AND user_id=%s AND activity_id=%s AND snapshot->>'eventId'=%s AND status='PENDING_PAYMENT' RETURNING id\",tuple(sys.argv[1:]));print(r.rowcount)",
      registration.id, person.id, paid.id, event.id], {
      encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    assert.equal(changed, '1', 'Only the intended synthetic pending reservation may be expired');
  }

  await available(2, 1);
  const paidRegistration = await reserve(a, paid, 'PENDING_PAYMENT');
  await available(1, 1);
  const approved = await call('/payments/' + paidRegistration.id, a.token, 'POST', {outcome: 'APPROVED'});
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.payment.status, 'APPROVED');
  await detail(a, paidRegistration, 'CONFIRMED');
  await available(1, 1); // Approval changes registration status, not the occupied seat count.
  await cancel(a, paidRegistration);
  await available(2, 1);

  const freeRegistration = await reserve(a, free, 'CONFIRMED');
  await available(2, 0);
  const freeWaiter = await reserve(b, free, 'WAITLISTED');
  await available(2, 0); // A queue must never produce a negative public vacancy count.
  await cancel(a, freeRegistration);
  await detail(b, freeWaiter, 'CONFIRMED');
  await available(2, 0);

  const expiredWithoutQueue = await reserve(a, paid, 'PENDING_PAYMENT');
  await available(1, 0);
  expireSynthetic(a, expiredWithoutQueue);
  await available(2, 0); // Already-expired holds do not occupy public vacancies.
  await detail(a, expiredWithoutQueue, 'EXPIRED');

  const firstHold = await reserve(a, paid, 'PENDING_PAYMENT');
  await reserve(b, paid, 'PENDING_PAYMENT');
  const firstWaiter = await reserve(c, paid, 'WAITLISTED');
  const secondWaiter = await reserve(owner, paid, 'WAITLISTED');
  await available(0, 0);
  expireSynthetic(a, firstHold);
  await available(0, 0); // The released place belongs to the existing FIFO queue.
  await detail(a, firstHold, 'EXPIRED');
  await detail(c, firstWaiter, 'PENDING_PAYMENT');
  await detail(owner, secondWaiter, 'WAITLISTED');
  await available(0, 0);

  const cancelled = await call('/events/' + event.id + '/cancel', owner.token, 'POST', {});
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.event.status, 'CANCELLED');
  assert.equal((await call(availabilityPath)).status, 404);
  assert.equal((await call(availabilityPath, owner.token)).status, 404);
});
