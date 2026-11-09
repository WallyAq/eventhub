import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const base = process.env.EVENTHUB_URL || 'http://127.0.0.1:8080';
const docker = (...args) => execFileSync('docker', ['compose', ...args], { encoding: 'utf8', timeout: 120000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
async function call(path, token, method = 'GET', body, headers = {}) {
  const response = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
async function until(predicate) { for (let index = 0; index < 50; index++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 1000)); } assert.fail('Trace did not converge'); }

test('RQ06: one durable registration correlation links HTTP, payment recovery, RabbitMQ and both consumers', { timeout: 240000 }, async () => {
  const suffix = randomUUID(), correlation = 'qa-trace-' + suffix;
  const account = async label => {
    const email = 'qa-trace-' + label + '-' + suffix + '@example.test';
    assert.equal((await call('/auth/register', null, 'POST', { name: 'Pessoa QA ' + label, email, password: 'Teste123' })).status, 201);
    const login = await call('/auth/login', null, 'POST', { email, password: 'Teste123' });
    assert.equal(login.status, 200); return login.body.accessToken;
  };
  const owner = await account('owner'), participant = await account('participant');
  const organization = await call('/organizations', owner, 'POST', { name: 'Instituto Trace QA ' + suffix });
  assert.equal(organization.status, 201);
  const startsAt = new Date(Date.now() + 86400000).toISOString(), endsAt = new Date(Date.now() + 90000000).toISOString();
  const created = await call('/events', owner, 'POST', { organizationId: organization.body.organization.id, title: 'Evento Trace QA ' + suffix, description: 'Evento sintético para correlação de ponta a ponta.', category: 'Congresso', hours: 1, modality: 'Presencial', location: 'Campus QA', streamUrl: '', startsAt, endsAt, sessionTime: 'BRT', featured: false, speakers: [], activities: [{ title: 'Atividade rastreável', startsAt, endsAt, location: 'Sala QA', responsible: 'Docente QA', capacity: 2, priceCents: 2000 }] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const event = created.body.event;
  assert.equal((await call('/events/' + event.id + '/publish', owner, 'POST', {})).status, 200);
  let providerStopped = false;
  try {
    const reserved = await call('/registrations', participant, 'POST', { eventId: event.id, activityId: event.activities[0].id }, { 'x-request-id': 'reserve-' + suffix, 'x-correlation-id': correlation, 'idempotency-key': suffix });
    assert.equal(reserved.status, 201, JSON.stringify(reserved.body));
    assert.equal(reserved.headers.get('x-correlation-id'), correlation);
    const registration = reserved.body.registration;
    assert.equal(registration.correlationId, correlation);
    docker('stop', 'payment-provider'); providerStopped = true;
    const pending = await call('/payments/' + registration.id, participant, 'POST', { outcome: 'APPROVED' }, { 'x-request-id': 'payment-' + suffix });
    assert.equal(pending.status, 202, JSON.stringify(pending.body));
    assert.equal(pending.body.payment.correlationId, correlation);
    docker('up', '-d', '--no-deps', '--wait', '--wait-timeout', '90', 'payment-provider'); providerStopped = false;
    // Read Registration so reconciliation is performed by the background worker, not a Payment GET.
    await until(async () => (await call('/registrations/' + registration.id, participant)).body.registration.status === 'CONFIRMED');
    const delivered = () => Number(docker('exec', '-T', 'notifications', 'python', '-c', 'import sys;from app.consumer import db\nwith db() as c: print(c.execute("SELECT count(*) FROM deliveries WHERE payload->>\'registrationId\'=%s AND payload->>\'correlationId\'=%s AND status=\'SENT\'",(sys.argv[1],sys.argv[2])).fetchone()[0])', registration.id, correlation).trim());
    await until(() => delivered() >= 3);
    const result = await call('/reports/events/' + event.id, owner);
    assert.equal(result.status, 200); assert.equal(result.body.report.total, 1); assert.equal(result.body.report.simulatedRevenueCents, 2000);
    assert.equal(result.body.report.registrationsByDay.reduce((sum, day) => sum + day.count, 0), 1);
    await until(() => docker('logs', '--since', '10m', 'reporting').includes('"correlationId": "' + correlation + '"'));
    for (const service of ['gateway', 'identity', 'events', 'registrations', 'payments', 'payment-provider', 'notifications', 'reporting']) {
      const lines = docker('logs', '--since', '10m', service).split('\n').filter(line => line.includes(correlation));
      assert.ok(lines.length, 'Missing correlation in ' + service);
      assert.ok(lines.every(line => !line.includes('Bearer ') && !line.includes('@example.test') && !line.includes('password')), 'Log contains sensitive data');
    }
    const messages = JSON.parse(docker('exec', '-T', 'registrations', 'python', '-c', 'import sys,json;from app.domain import db\nwith db() as c: print(json.dumps([r["payload"] for r in c.execute("SELECT payload FROM outbox WHERE payload->>\'registrationId\'=%s",(sys.argv[1],)).fetchall()]))', registration.id));
    assert.ok(messages.some(message => message.type === 'payment.approved'));
    assert.ok(messages.every(message => message.correlationId === correlation && message.requestId));
    const payment = await call('/payments/' + registration.id, participant);
    assert.equal(payment.body.payment.correlationId, correlation);
    assert.equal(payment.headers.get('x-correlation-id'), correlation);
  } finally {
    if (providerStopped) docker('up', '-d', '--no-deps', '--wait', '--wait-timeout', '90', 'payment-provider');
    await call('/events/' + event.id + '/cancel', owner, 'POST', {});
  }
});
