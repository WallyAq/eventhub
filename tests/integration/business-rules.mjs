// Destructive fault injection is confined to this explicit QA project and port.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const project = 'eventhub-rules-qa';
const composeArgs = ['compose', '-p', project, '--env-file', 'tmp/rules-qa/.env'];
const base = 'http://127.0.0.1:18080/api';
const run = (args, input) => execFileSync('docker', [...composeArgs, ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000 });
const sql = (database, query) => run(['exec', '-T', 'postgres', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'eventhub_admin', '-d', database, '-c', query]).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, account, method = 'GET', body, extra = {}) {
  const response = await fetch(base + path, { method, headers: { ...(account ? { authorization: 'Bearer ' + account.accessToken } : {}),
    ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, data: type.includes('json') ? await response.json() : await response.text(), headers: response.headers };
}
async function ok(path, account, method, body, extra) {
  const result = await request(path, account, method, body, extra);
  assert.ok(result.status >= 200 && result.status < 300, `${method || 'GET'} ${path}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
const stamp = Date.now().toString(36);
const password = 'EventHub-QA-strong-2026';
async function account(name, organization = false) {
  const email = `${name}-${stamp}@qa.eventhub.local`;
  const body = { name: `QA ${name}`, email, password, ...(organization ? { organization: {
    cnpj: BigInt('0x' + randomUUID().replaceAll('-', '').slice(0, 12)).toString().padStart(14, '0').slice(-14), legalName: `Instituição ${name}`, tradeName: `Instituição ${name}`, entityType: 'Universidade', phone: '85999999999' } } : {}) };
  await ok('/auth/register', null, 'POST', body);
  return { ...await ok('/auth/login', null, 'POST', { email, password }), email };
}
function eventInput(organizationId, name) {
  const start = new Date(Date.now() + 3600000).toISOString(), end = new Date(Date.now() + 7200000).toISOString();
  return { organizationId, title: `Evento QA ${name}`, description: 'Evento isolado para validar as regras de negócio.', category: 'Tecnologia', hours: 2,
    modality: 'Presencial', location: 'Laboratório QA', streamUrl: '', startsAt: start, endsAt: end, sessionTime: 'QA', featured: false, speakers: [],
    activities: [ ['Livre', 3, 0, true], ['Paga', 2, 1000, true], ['Expiração', 1, 1500, true], ['Resiliência', 4, 0, false] ].map(([title, capacity, priceCents, waitlistEnabled]) =>
      ({ title, startsAt: start, endsAt: end, location: 'Sala QA', responsible: 'Docente QA', capacity, priceCents, waitlistEnabled })) };
}
async function reserve(user, event, activity, key = randomUUID()) {
  return (await ok('/registrations', user, 'POST', { eventId: event.id, activityId: activity.id }, { 'idempotency-key': key })).registration;
}
async function eventually(read, check, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  do { const value = await read(); if (check(value)) return value; await pause(700); } while (Date.now() < deadline);
  assert.fail(message);
}

test('EventHub: APIs, persistence, concurrency and recoverable failures in isolated QA', { timeout: 600000 }, async t => {
  assert.equal(new URL(base).port, '18080');
  await eventually(async () => request('/status').catch(() => ({ status: 0 })), result => result.status === 200,
    'QA dependencies are not ready; start the complete isolated stack first', 120000);
  const organizer = await account('organizador', true), outsider = await account('outra-instituicao', true);
  const participants = [];
  for (let i = 0; i < 8; i++) participants.push(await account(`participante${i}`));
  const institution = organizer.user.organizationId;
  const colleagueId = randomUUID(), colleagueEmail = `colega-${stamp}@qa.eventhub.local`;
  // Provisioning a synthetic colleague is a fixture, not an admission policy/API.
  sql('identity_db', `BEGIN; INSERT INTO users(id,name,email,password_hash,role)
    SELECT '${colleagueId}','QA Colega','${colleagueEmail}',password_hash,'ORGANIZER' FROM users WHERE id='${organizer.user.id}';
    INSERT INTO organization_members(organization_id,user_id,role) VALUES('${institution}','${colleagueId}','ORGANIZER'); COMMIT;`);
  const colleague = await ok('/auth/login', null, 'POST', { email: colleagueEmail, password });
  const event = (await ok('/events', organizer, 'POST', eventInput(institution, 'principal'))).event;
  await ok(`/events/${event.id}/publish`, organizer, 'POST', {});
  const second = (await ok('/events', outsider, 'POST', eventInput(outsider.user.organizationId, 'externo'))).event;
  await ok(`/events/${second.id}/publish`, outsider, 'POST', {});
  const [free, paid, expiry, resilience] = event.activities;
  const fixtures = { base, password, organizer: { email: organizer.email }, participant: { email: participants[0].email }, eventId: event.id, secondEventId: second.id };
  await writeFile('tmp/rules-qa/browser-fixtures.json', JSON.stringify(fixtures, null, 2));

  await t.test('exclusive profiles, immutable institution and multiple organizers per institution', async () => {
    assert.equal(organizer.user.role, 'ORGANIZER');
    assert.equal(participants[0].user.role, 'PARTICIPANT');
    assert.equal(colleague.user.organizationId, institution);
    assert.equal((await request('/users/me', participants[0], 'PATCH', { name: 'Ataque', role: 'ORGANIZER' })).status, 400);
    assert.equal((await request('/users/me', organizer, 'PATCH', { name: 'Ataque', organizationId: outsider.user.organizationId })).status, 400);
    assert.ok([403, 409].includes((await request('/organizations', organizer, 'POST', { name: 'Segunda instituição', description: '' })).status));
    assert.ok([403, 409].includes((await request(`/organizations/${outsider.user.organizationId}/members`, outsider, 'POST', { email: organizer.email })).status));
    assert.throws(() => sql('identity_db', `INSERT INTO organization_members(organization_id,user_id,role) VALUES('${outsider.user.organizationId}','${organizer.user.id}','ORGANIZER');`));
    assert.throws(() => sql('identity_db', `INSERT INTO users(id,name,email,password_hash,role) SELECT gen_random_uuid(),'Sem vínculo','missing-${stamp}@qa.eventhub.local',password_hash,'ORGANIZER' FROM users WHERE id='${organizer.user.id}';`));
    assert.throws(() => sql('identity_db', `INSERT INTO organization_members(organization_id,user_id,role) VALUES('${institution}','${participants[0].user.id}','ORGANIZER');`));
    assert.throws(() => sql('identity_db', `DELETE FROM organization_members WHERE user_id='${colleagueId}';`));
    assert.equal((await request('/registrations', organizer, 'POST', { eventId: event.id, activityId: free.id }, { 'idempotency-key': randomUUID() })).status, 403);
    const segments = participants[0].accessToken.split('.');
    segments[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(segments[1], 'base64url')), role: 'ORGANIZER', organizationId: institution })).toString('base64url');
    assert.equal((await request('/users/me', { accessToken: segments.join('.') })).status, 401);
  });

  await t.test('event responsibility, institution, direct IDs and exports are enforced', async () => {
    for (const unauthorized of [participants[0], colleague, outsider]) {
      for (const path of [`/events/${event.id}?managed=true`, `/organizer/events/${event.id}/registrations`, `/organizer/events/${event.id}/registrations/export.csv`, `/organizer/events/${event.id}/attendance`, `/reports/events/${event.id}`])
        assert.ok([403, 404].includes((await request(path, unauthorized)).status), path);
      assert.ok([403, 404].includes((await request(`/events/${event.id}/cancel`, unauthorized, 'POST', {})).status));
    }
    assert.equal((await ok('/events?managed=true', colleague)).events.length, 0);
    assert.equal((await ok('/events?managed=true', organizer)).events.some(item => item.id === event.id), true);
    const crossInstitution = await reserve(participants[7], second, second.activities[0]);
    assert.equal(crossInstitution.status, 'CONFIRMED');
  });

  let freeRows;
  await t.test('8 simultaneous requests for 3 seats preserve capacity and FIFO cancellation', async () => {
    freeRows = await Promise.all(participants.map(user => reserve(user, event, free)));
    assert.equal(freeRows.filter(r => r.status === 'CONFIRMED').length, 3);
    assert.equal(freeRows.filter(r => r.status === 'WAITLISTED').length, 5);
    assert.equal(sql('registration_db', `SELECT count(*) FROM registrations WHERE activity_id='${free.id}' AND status IN ('CONFIRMED','PENDING_PAYMENT');`), '3');
    assert.throws(() => sql('registration_db', `INSERT INTO registrations(id,activity_id,user_id,request_key,status,price_cents,snapshot)
      SELECT gen_random_uuid(),activity_id,gen_random_uuid(),'direct-write-qa','CONFIRMED',0,snapshot FROM registrations WHERE id='${freeRows[0].id}';`));
    const confirmed = freeRows.find(r => r.status === 'CONFIRMED'), user = participants.find(p => p.user.id === confirmed.userId);
    assert.ok([403, 404].includes((await request(`/registrations/${confirmed.id}`, participants.find(p => p.user.id !== confirmed.userId))).status));
    await ok(`/registrations/${confirmed.id}/cancel`, user, 'POST', {});
    await ok(`/registrations/${confirmed.id}/cancel`, user, 'POST', {});
    const waiting = freeRows.filter(r => r.status === 'WAITLISTED').sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    assert.equal((await ok(`/registrations/${waiting[0].id}`, participants.find(p => p.user.id === waiting[0].userId))).registration.status, 'CONFIRMED');
    assert.equal(sql('registration_db', `SELECT count(*) FROM registrations WHERE activity_id='${free.id}' AND status='CONFIRMED';`), '3');
  });

  await t.test('payment approval/decline/expiry, duplicate replay and conflicting result', async () => {
    for (const [index, outcome, expected] of [[0, 'APPROVED', 'CONFIRMED'], [1, 'DECLINED', 'CANCELLED'], [2, 'EXPIRED', 'EXPIRED']]) {
      const registration = await reserve(participants[index], event, paid);
      assert.equal(registration.status, 'PENDING_PAYMENT');
      if (outcome === 'APPROVED') assert.throws(() => sql('registration_db', `UPDATE registrations SET status='CONFIRMED' WHERE id='${registration.id}';`));
      const result = await ok(`/payments/${registration.id}`, participants[index], 'POST', { outcome });
      assert.equal(result.payment.status, outcome);
      assert.equal((await ok(`/registrations/${registration.id}`, participants[index])).registration.status, expected);
      assert.equal((await ok(`/payments/${registration.id}`, participants[index], 'POST', { outcome })).payment.status, outcome);
      assert.equal((await request(`/payments/${registration.id}`, participants[index], 'POST', { outcome: outcome === 'APPROVED' ? 'DECLINED' : 'APPROVED' })).status, 409);
      assert.equal(sql('registration_db', `SELECT count(*) FROM payment_notification_receipts WHERE registration_id='${registration.id}';`), '1');
      const callbackCode = `import os,json,urllib.request,urllib.error,concurrent.futures
def callback(outcome):
 q=urllib.request.Request('http://registrations:8000/internal/registrations/${registration.id}/payment',data=json.dumps({'outcome':outcome}).encode(),headers={'x-internal-key':os.environ['INTERNAL_API_KEY'],'content-type':'application/json'})
 try:
  with urllib.request.urlopen(q) as r: return r.status
 except urllib.error.HTTPError as e: return e.code
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: print(json.dumps(list(pool.map(callback,['${outcome}','${outcome}','${outcome === 'APPROVED' ? 'DECLINED' : 'APPROVED'}']))))`;
      assert.deepEqual(JSON.parse(run(['exec', '-T', 'registrations', 'python', '-c', callbackCode])), [200, 200, 409]);
    }
  });

  await t.test('automatic expiry releases seats even while Events is unavailable; late payment cannot reactivate', async () => {
    const registration = await reserve(participants[3], event, expiry);
    const queued = await reserve(participants[4], event, expiry);
    assert.equal(queued.status, 'WAITLISTED');
    run(['stop', 'events']);
    try {
      sql('registration_db', `UPDATE registrations SET expires_at=clock_timestamp()-interval '1 second' WHERE id='${registration.id}';`);
      await eventually(async () => sql('registration_db', `SELECT status FROM registrations WHERE id='${registration.id}';`), value => value === 'EXPIRED', 'worker did not expire without Event');
    } finally { run(['start', 'events']); }
    await eventually(async () => request(`/events/${event.id}`), r => r.status === 200, 'Event did not recover');
    const next = (await eventually(async () => ok(`/registrations/${queued.id}`, participants[4]), value => value.registration.status === 'PENDING_PAYMENT', 'paid waitlist was not promoted')).registration;
    assert.equal(next.status, 'PENDING_PAYMENT');
    const late = await request(`/payments/${registration.id}`, participants[3], 'POST', { outcome: 'APPROVED' });
    assert.equal(late.status, 409);
    const internalCode = `import os,json,urllib.request; q=urllib.request.Request('http://registrations:8000/internal/registrations/${registration.id}/payment',data=b'{"outcome":"APPROVED"}',headers={'x-internal-key':os.environ['INTERNAL_API_KEY'],'content-type':'application/json'}); print(json.load(urllib.request.urlopen(q))['registration']['status'])`;
    assert.equal(run(['exec', '-T', 'registrations', 'python', '-c', internalCode]).trim(), 'EXPIRED');
    assert.equal((await ok(`/registrations/${next.id}`, participants[4])).registration.status, 'PENDING_PAYMENT');
  });

  let resilient;
  await t.test('notification/report/broker outage preserves confirmation and idempotency', async () => {
    run(['stop', 'notifications', 'reporting', 'rabbitmq']);
    try {
      const key = randomUUID();
      const results = await Promise.all(Array.from({ length: 4 }, () => reserve(participants[5], event, resilience, key)));
      assert.equal(new Set(results.map(r => r.id)).size, 1);
      resilient = results[0];
      assert.equal(resilient.status, 'CONFIRMED');
      assert.ok(Number(sql('registration_db', `SELECT count(*) FROM outbox WHERE payload->>'registrationId'='${resilient.id}' AND published_at IS NULL;`)) > 0);
      assert.equal((await ok(`/registrations/${resilient.id}`, participants[5])).registration.status, 'CONFIRMED');
    } finally { run(['start', 'rabbitmq', 'notifications', 'reporting']); }
  });

  await t.test('check-in duplicate prevention, certificate eligibility and authorized reports', async () => {
    const date = new Date(Date.now() - 3600000).toISOString(), end = new Date(Date.now() + 60000).toISOString();
    sql('event_db', `UPDATE events SET payload=jsonb_set(jsonb_set(payload,'{startsAt}',to_jsonb('${date}'::text)),'{activities}',
      (SELECT jsonb_agg(a || jsonb_build_object('startsAt','${date}','endsAt','${end}')) FROM jsonb_array_elements(payload->'activities') a)) WHERE id='${event.id}';`);
    assert.equal((await request('/certificates', participants[5], 'POST', { registrationId: resilient.id })).status, 409);
    assert.ok([403, 404].includes((await request('/attendance/check-ins', colleague, 'POST', { registrationId: resilient.id })).status));
    const marks = await Promise.all(Array.from({ length: 3 }, () => ok('/attendance/check-ins', organizer, 'POST', { registrationId: resilient.id })));
    assert.equal(new Set(marks.map(m => m.attendance.id)).size, 1);
    assert.equal(sql('attendance_db', `SELECT count(*) FROM attendance WHERE registration_id='${resilient.id}';`), '1');
    assert.equal((await request('/certificates', participants[5], 'POST', { registrationId: resilient.id })).status, 409);
    const finished = new Date(Date.now() - 1000).toISOString();
    sql('event_db', `UPDATE events SET payload=jsonb_set(payload,'{activities}',
      (SELECT jsonb_agg(a || jsonb_build_object('endsAt','${finished}')) FROM jsonb_array_elements(payload->'activities') a)) WHERE id='${event.id}';`);
    const issued = (await ok('/certificates', participants[5], 'POST', { registrationId: resilient.id })).certificate;
    assert.equal((await ok('/certificates', participants[5], 'POST', { registrationId: resilient.id })).certificate.id, issued.id);
    assert.ok([403, 404].includes((await request(`/certificates/${issued.id}`, participants[6])).status));
    assert.equal((await ok(`/certificates/verify/${issued.verificationCode}`)).valid, true);
    const report = await ok(`/reports/events/${event.id}`, organizer);
    assert.ok(report);
    assert.equal((await request(`/reports/events/${event.id}/export.csv`, outsider)).status, 403);
  });
});
