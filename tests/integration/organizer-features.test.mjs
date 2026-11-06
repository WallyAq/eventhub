import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const base = (process.env.EVENTHUB_URL || 'http://127.0.0.1:8080') + '/api';
async function request(path, token, method = 'GET', body, key, status = 200) {
  const response = await fetch(base + path, { method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}),
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, status, `${method} ${path}: ${bytes.toString().slice(0, 1000)}`);
  if (response.headers.get('content-type')?.startsWith('application/pdf')) { assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert.ok(bytes.length > 1000); return bytes; }
  return JSON.parse(bytes);
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('real services: prices, signed check-in, custom PDF snapshots and automatic speaker issuance', { timeout: 240000 }, async t => {
  await request('/status');
  const suffix = randomUUID(), password = 'QA-features-academic-123';
  async function account(label) {
    const email = `qa-organizer-features-${label}-${suffix}@example.test`;
    await request('/auth/register', null, 'POST', { name: 'Pessoa QA ' + label, email, password }, null, 201);
    return (await request('/auth/login', null, 'POST', { email, password })).accessToken;
  }
  const owner = await account('owner'), participant = await account('participant');
  const organization = (await request('/organizations', owner, 'POST', { name: 'Instituto QA features ' + suffix }, null, 201)).organization;
  const start = new Date(Date.now() + 86400000).toISOString(), end = new Date(Date.now() + 90000000).toISOString();
  const speakerId = randomUUID(), rateId = randomUUID(), otherRateId = randomUUID();
  const event = (await request('/events', owner, 'POST', {
    organizationId: organization.id, title: 'QA organizer features ' + suffix, description: 'Dados sintéticos para validar as funcionalidades do organizador.',
    category: 'Workshop', hours: 1, modality: 'Presencial', location: 'Sala QA', streamUrl: '', startsAt: start, endsAt: end, sessionTime: '',
    autoSpeakerCertificates: true, speakers: [{ id: speakerId, name: 'Docente QA features', institution: 'Instituto QA', email: 'speaker-private@example.test' }],
    activities: [{ title: 'Oficina QA features', description: 'Oficina sintética.', startsAt: start, endsAt: end, location: 'Sala QA', responsible: 'Docente QA features',
      speakerId, capacity: 5, priceCents: 9999, priceOptions: [
        { id: rateId, lotName: 'Primeiro lote', category: 'Graduação', priceCents: 1234, startsAt: new Date(Date.now() - 86400000).toISOString(), endsAt: start },
        { id: otherRateId, lotName: 'Lote futuro', category: 'Geral', priceCents: 2000, startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: start },
      ] }],
  }, null, 201)).event;
  assert.equal(event.activities[0].priceCents, 1234);
  t.after(async () => { await request('/events/' + event.id + '/cancel', owner, 'POST', {}); });
  const activityId = event.activities[0].id, path = '/organizer/events/' + event.id;
  const settings = (await request(path + '/certificate-settings', owner)).settings;
  settings.title = 'CERTIFICADO QA PERSONALIZADO'; settings.accentColor = '#195b76';
  settings.signatories = [{ name: 'Coordenação QA', role: 'Organização acadêmica', image: '' }];
  await request(path + '/certificate-settings', participant, 'PUT', settings, null, 404);
  await request(path + '/certificate-settings', owner, 'PUT', settings);
  await request(path + '/certificate-preview', owner);
  await request('/events/' + event.id + '/publish', owner, 'POST', {});
  const reservation = { eventId: event.id, activityId };
  await request('/registrations', participant, 'POST', reservation, randomUUID(), 409);
  await request('/registrations', participant, 'POST', { ...reservation, priceCents: 1 }, randomUUID(), 422);
  await request('/registrations', participant, 'POST', { ...reservation, priceOptionId: otherRateId }, randomUUID(), 409);
  const key = randomUUID();
  let registration = (await request('/registrations', participant, 'POST', { ...reservation, priceOptionId: rateId }, key, 201)).registration;
  assert.equal(registration.priceCents, 1234); assert.equal(registration.priceOption.id, rateId);
  assert.equal((await request('/registrations', participant, 'POST', { ...reservation, priceOptionId: rateId }, key, 201)).registration.id, registration.id);
  await request('/registrations', participant, 'POST', { ...reservation, priceOptionId: otherRateId }, key, 409);
  await request('/payments/' + registration.id, participant, 'POST', { outcome: 'APPROVED' });
  const deadline = Date.now() + 30000;
  do { registration = (await request('/registrations/' + registration.id, participant)).registration;
    if (registration.status === 'CONFIRMED') break; await pause(500);
  } while (Date.now() < deadline);
  assert.equal(registration.status, 'CONFIRMED');
  assert.match(registration.checkInCredential, /^eventhub:check-in:v1:[a-f0-9-]{36}:[a-f0-9]{64}$/);
  const credential = { ...reservation, credential: registration.checkInCredential };
  await request('/attendance/credentials/resolve', participant, 'POST', credential, null, 404);
  await request('/attendance/credentials/resolve', owner, 'POST', credential, null, 409);
  // Only the UUID and unique title of this synthetic event can be shifted; no real data or host clock changes.
  function move(endOffset) {
    const payload = JSON.stringify({ id: event.id, title: event.title, startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + endOffset).toISOString() });
    const output = execFileSync('docker', ['compose', 'exec', '-T', 'events', 'python', '-c', [
      'import sys,json', 'from app.domain import db', 'p=json.loads(sys.argv[1])',
      'assert p["title"].startswith("QA organizer features ")',
      'with db() as c:',
      ' row=c.execute("SELECT payload FROM events WHERE id=%s AND payload->>\'title\'=%s FOR UPDATE",(p["id"],p["title"])).fetchone()',
      ' assert row is not None,"Synthetic fixture missing"',
      ' e=row["payload"];e["startsAt"]=p["startsAt"];e["endsAt"]=p["endsAt"]',
      ' for a in e["activities"]: a["startsAt"]=p["startsAt"];a["endsAt"]=p["endsAt"]',
      ' print(c.execute("UPDATE events SET payload=%s::jsonb WHERE id=%s AND payload->>\'title\'=%s",(json.dumps(e),p["id"],p["title"])).rowcount)',
    ].join('\n'), payload], { encoding: 'utf8', timeout: 30000 }).trim();
    assert.equal(output, '1');
  }
  move(3600000);
  await request('/attendance/credentials/resolve', owner, 'POST', { ...credential, credential: credential.credential.slice(0, -1) + (credential.credential.endsWith('0') ? '1' : '0') }, null, 404);
  await request('/attendance/credentials/resolve', owner, 'POST', { ...credential, activityId: randomUUID() }, null, 409);
  const resolved = await request('/attendance/credentials/resolve', owner, 'POST', credential);
  assert.equal(resolved.registration.id, registration.id); assert.equal(resolved.attendance, null);
  await request('/attendance/check-ins', owner, 'POST', { registrationId: registration.id });
  assert.ok((await request('/attendance/credentials/resolve', owner, 'POST', credential)).attendance);
  await request('/certificates', participant, 'POST', { registrationId: registration.id }, null, 409);
  move(-60000);
  const certificate = (await request('/certificates', participant, 'POST', { registrationId: registration.id }, null, 201)).certificate;
  assert.equal(certificate.certificateTemplate.title, settings.title);
  await request('/certificates/' + certificate.id + '/download', participant);
  await request(path + '/certificate-settings', owner, 'PUT', { ...settings, title: 'MODELO PARA PRÓXIMAS EMISSÕES' });
  assert.equal((await request('/certificates/' + certificate.id, participant)).certificate.certificateTemplate.title, settings.title);
  // Observe the background worker itself; a manual request must not be needed to issue the document.
  let list = [];
  const workerDeadline = Date.now() + 65000;
  do { list = (await request(path + '/speaker-certificates', owner)).certificates;
    if (list.length) break; await pause(1000);
  } while (Date.now() < workerDeadline);
  assert.equal(list.length, 1); assert.equal(list[0].participantName, 'Docente QA features'); assert.equal(list[0].valid, true);
  assert.equal((await request(path + '/speaker-certificates', owner, 'POST', {})).issued, 0);
  await request('/speaker-certificates/' + list[0].id + '/download', participant, 'GET', undefined, null, 404);
  await request('/speaker-certificates/' + list[0].id + '/download', owner);
  const verification = '/certificates/verify/' + list[0].verificationCode;
  assert.equal((await request(verification)).valid, true);
  assert.equal(JSON.stringify(await request(verification)).includes('speaker-private'), false);
  await request('/events/' + event.id + '/cancel', owner, 'POST', {});
  assert.equal((await request(verification)).valid, false);
  await request('/speaker-certificates/' + list[0].id + '/download', owner, 'GET', undefined, null, 409);
});
