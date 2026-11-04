import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';

const base = process.env.EVENTHUB_URL || 'http://127.0.0.1:8080';

async function request(path, token, method = 'GET', body, key) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: {
      ...(body === undefined ? {} : {'content-type': 'application/json'}),
      ...(token ? {authorization: 'Bearer ' + token} : {}),
      ...(key ? {'idempotency-key': key} : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString('utf8');
  let json;
  if (response.headers.get('content-type')?.includes('application/json')) {
    json = JSON.parse(text);
  }
  // A failed dependency must fail this test immediately, never be retried into a false pass.
  assert.notEqual(response.status, 503, `${method} ${path}: backend/dependency unavailable: ${text}`);
  return {status: response.status, headers: response.headers, bytes, text, json};
}

function expectStatus(result, expected, context) {
  assert.equal(result.status, expected, `${context}: ${result.text.slice(0, 2000)}`);
  return result.json;
}

function serviceCommand(service, runtime, code, ...args) {
  return execFileSync('docker', ['compose', 'exec', '-T', service, ...runtime, code, ...args], {
    encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function syntheticMailboxToken(email, expectedPath) {
  // Mail is not exposed through HTTP. Read only a QA recipient's local academic mailbox.
  const token = serviceCommand('identity', ['node', '--input-type=module', '-e'], [
    'import {readFile} from "node:fs/promises";',
    'import {createHash} from "node:crypto";',
    'import {setTimeout as pause} from "node:timers/promises";',
    'const [email,path]=process.argv.slice(1);',
    'if(!email.startsWith("qa-backend-completion-")||!email.endsWith("@example.test"))throw Error("Synthetic mailbox guard failed");',
    'if((process.env.MAIL_MODE||"mailbox")!=="mailbox")throw Error("Integration mail checks require academic MAIL_MODE=mailbox");',
    'const filename=(process.env.MAILBOX_DIRECTORY||"/tmp/eventhub-mail")+"/"+createHash("sha256").update(email).digest("hex")+".json";',
    'const deadline=Date.now()+25000;let message;',
    'while(!message){try{message=JSON.parse(await readFile(filename,"utf8"));}catch(error){if(error.code!=="ENOENT"||Date.now()>deadline)throw error;await pause(300);}}',
    'if(message.to!==email)throw Error("Mailbox recipient differs");',
    'const token=message.path?.split("#token=")[1];',
    'if(!message.path?.startsWith(path+"#token=")||!/^[a-f0-9]{64}$/.test(token||""))throw Error("Message has no expected one-time link");process.stdout.write(token);',
  ].join('\n'), email, expectedPath);
  assert.match(token, /^[a-f0-9]{64}$/);
  return token;
}

test('academic backend completes organizer management, attendance, certificates, reporting and session revocation', {timeout: 420000}, async t => {
  const suffix = randomUUID();
  const originalPassword = 'QA-backend-original-123';

  async function login(person, password = originalPassword) {
    const result = await request('/auth/login', null, 'POST', {email: person.email, password});
    return expectStatus(result, 200, 'synthetic account login').accessToken;
  }

  async function account(label, extra = {}) {
    const person = {
      name: 'Pessoa QA backend ' + label + ' ' + suffix,
      email: 'qa-backend-completion-' + label + '-' + suffix + '@example.test',
      ...extra,
    };
    const created = await request('/auth/register', null, 'POST', {...person, password: originalPassword});
    person.id = expectStatus(created, 201, 'synthetic account registration').user.id;
    person.token = await login(person);
    return person;
  }

  const owner = await account('owner');
  const outsider = await account('outsider');
  const a = await account('a', {cpf: '12345678910'});
  const b = await account('b', {name: '=QA backend formula ' + suffix});
  const c = await account('c');
  const organization = expectStatus(await request('/organizations', owner.token, 'POST', {
    name: 'Instituto QA backend ' + suffix,
  }), 201, 'create synthetic organization').organization;
  // The outsider has a genuine organization, but no membership in this event's organization.
  expectStatus(await request('/organizations', outsider.token, 'POST', {
    name: 'Outro instituto QA backend ' + suffix,
  }), 201, 'create unrelated organization');

  const startsAt = new Date(Date.now() + 86400000).toISOString();
  const endsAt = new Date(Date.now() + 90000000).toISOString();
  const activity = (title, capacity, priceCents) => ({title, capacity, priceCents, startsAt, endsAt,
    location: 'Sala QA backend', responsible: 'Docente QA', waitlistEnabled: true});
  const event = expectStatus(await request('/events', owner.token, 'POST', {
    organizationId: organization.id,
    title: 'Evento QA backend completion ' + suffix,
    description: 'Evento exclusivamente sintético para validar os módulos acadêmicos de backend.',
    category: 'Workshop', hours: 1, modality: 'Presencial', location: 'Campus QA',
    streamUrl: '', startsAt, endsAt, sessionTime: 'BRT', featured: false, speakers: [],
    activities: [activity('Curso pago QA', 2, 5000), activity('Oficina gratuita QA', 3, 0)],
  }), 201, 'create synthetic event').event;
  expectStatus(await request('/events/' + event.id + '/publish', owner.token, 'POST', {}), 200, 'publish event');
  const [paid, free] = event.activities;
  const registrations = [];

  async function reserve(person, selected, expectedStatus) {
    const registration = expectStatus(await request('/registrations', person.token, 'POST', {
      eventId: event.id, activityId: selected.id,
    }, randomUUID()), 201, 'reserve synthetic activity').registration;
    assert.equal(registration.status, expectedStatus);
    registrations.push(registration);
    return registration;
  }

  const paidA = await reserve(a, paid, 'PENDING_PAYMENT');
  const payment = expectStatus(await request('/payments/' + paidA.id, a.token, 'POST', {outcome: 'APPROVED'}), 200, 'approve simulated payment').payment;
  assert.equal(payment.status, 'APPROVED');
  assert.equal(payment.amountCents, 5000);
  assert.equal(expectStatus(await request('/registrations/' + paidA.id, a.token), 200, 'confirmed registration').registration.status, 'CONFIRMED');
  const paidC = await reserve(c, paid, 'PENDING_PAYMENT');
  const paidB = await reserve(b, paid, 'WAITLISTED');
  const freeA = await reserve(a, free, 'CONFIRMED');
  const freeB = await reserve(b, free, 'CONFIRMED');

  await t.test('organizer scope, filters, pagination, safe CSV, cancellation and immediate membership removal', async () => {
    const path = '/organizer/events/' + event.id + '/registrations';
    expectStatus(await request(path, outsider.token), 404, 'unrelated organizer cannot list registrations');
    expectStatus(await request(path, a.token), 404, 'participant cannot list organizer registrations');
    expectStatus(await request(path + '/export.csv', outsider.token), 404, 'unrelated organizer cannot export participants');
    expectStatus(await request('/organizer/registrations/' + freeB.id + '/cancel', outsider.token, 'POST', {}), 404, 'unrelated organizer cannot cancel');
    const page = expectStatus(await request(path + '?page=1&limit=2', owner.token), 200, 'first organizer page');
    assert.equal(page.total, 5);
    assert.equal(page.page, 1);
    assert.equal(page.limit, 2);
    assert.equal(page.registrations.length, 2);
    const second = expectStatus(await request(path + '?page=2&limit=2', owner.token), 200, 'second organizer page');
    assert.equal(second.total, 5);
    assert.equal(second.registrations.length, 2);
    assert.equal(new Set([...page.registrations, ...second.registrations].map(item => item.id)).size, 4);
    const all = expectStatus(await request(path + '?limit=100', owner.token), 200, 'organizer full fixture list');
    assert.deepEqual(new Set(all.registrations.map(item => item.id)), new Set(registrations.map(item => item.id)));
    for (const item of all.registrations) {
      assert.equal(item.eventId, event.id);
      assert.deepEqual(Object.keys(item.participant).sort(), ['email', 'id', 'name']);
      assert.notEqual(item.participant.id, outsider.id);
    }
    assert.equal(expectStatus(await request(path + '?status=CONFIRMED', owner.token), 200, 'status filter').total, 3);
    assert.equal(expectStatus(await request(path + '?activityId=' + paid.id, owner.token), 200, 'activity filter').total, 3);
    expectStatus(await request(path + '?activityId=' + randomUUID(), owner.token), 404, 'foreign activity filter');
    expectStatus(await request(path + '?limit=101', owner.token), 422, 'bounded pagination');
    const exported = await request(path + '/export.csv', owner.token);
    expectStatus(exported, 200, 'organizer CSV');
    assert.match(exported.headers.get('content-type'), /^text\/csv/);
    assert.match(exported.headers.get('content-disposition'), /attachment/);
    assert.match(exported.headers.get('cache-control'), /no-store/);
    for (const registration of registrations) assert.ok(exported.text.includes(registration.id));
    assert.ok(exported.text.includes("'=QA backend formula " + suffix), 'spreadsheet formula names must be escaped');
    assert.equal(exported.text.includes(outsider.email), false);
    assert.equal(exported.text.includes(a.cpf), false);
    const cancelled = expectStatus(await request('/organizer/registrations/' + freeB.id + '/cancel', owner.token, 'POST', {}), 200, 'authorized organizer cancellation').registration;
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(expectStatus(await request('/organizer/registrations/' + freeB.id + '/cancel', owner.token, 'POST', {}), 200, 'idempotent organizer cancellation').registration.id, freeB.id);
    expectStatus(await request('/organizations/' + organization.id + '/members', owner.token, 'POST', {email: b.email}), 201, 'grant temporary organizer membership');
    expectStatus(await request(path, b.token), 200, 'existing JWT gains organization membership dynamically');
    expectStatus(await request('/organizations/' + organization.id + '/members/' + c.id, b.token, 'DELETE'), 403, 'organizer cannot remove members');
    expectStatus(await request('/organizations/' + organization.id + '/members/' + owner.id, owner.token, 'DELETE'), 409, 'owner membership cannot be removed');
    expectStatus(await request('/organizations/' + organization.id + '/members/' + b.id, owner.token, 'DELETE'), 204, 'owner removes organizer');
    expectStatus(await request(path, b.token), 404, 'same JWT loses organization access immediately');
    expectStatus(await request('/organizations/' + organization.id + '/members/' + outsider.id, owner.token, 'DELETE'), 404, 'cannot remove a member of another organization');
  });

  const checkIn = registration => request('/attendance/check-ins', owner.token, 'POST', {registrationId: registration.id});
  const issue = registration => request('/certificates', a.token, 'POST', {registrationId: registration.id});
  await t.test('check-in rejects early, unconfirmed and unauthorized requests', async () => {
    expectStatus(await checkIn(paidA), 409, 'confirmed registration before activity start');
    expectStatus(await checkIn(paidC), 409, 'pending payment cannot check in');
    expectStatus(await checkIn(paidB), 409, 'waitlist cannot check in');
    expectStatus(await checkIn(freeB), 409, 'cancelled registration cannot check in');
    expectStatus(await request('/attendance/check-ins', a.token, 'POST', {registrationId: paidA.id}), 404, 'participant cannot mark own attendance');
    expectStatus(await request('/attendance/check-ins', outsider.token, 'POST', {registrationId: paidA.id}), 404, 'unrelated organizer cannot check in');
    assert.equal(expectStatus(await request('/attendance/registrations/' + paidA.id, a.token), 200, 'owner can query absence').attendance, null);
    expectStatus(await request('/attendance/registrations/' + paidA.id, b.token), 404, 'another participant cannot query attendance');
    const early = expectStatus(await issue(paidA), 409, 'certificate before activity end');
    assert.equal(early.detail.code, 'ACTIVITY_NOT_FINISHED');
  });

  // Only these synthetic records are moved in time, through each owning service's role.
  // Real users, the host clock and other events are never updated.
  const startedAt = new Date(Date.now() - 3600000).toISOString();
  function moveSyntheticWindow(activityEnd) {
    const payload = JSON.stringify({eventId: event.id, title: event.title, startsAt: startedAt,
      endsAt: activityEnd, registrationIds: registrations.map(item => item.id)});
    const eventRows = serviceCommand('events', ['python', '-c'], [
      'import json,sys',
      'from app.domain import db',
      'p=json.loads(sys.argv[1])',
      'with db() as c:',
      ' row=c.execute("SELECT payload FROM events WHERE id=%s AND payload->>\'title\'=%s AND status=\'PUBLISHED\' FOR UPDATE",(p["eventId"],p["title"])).fetchone()',
      ' assert row is not None,"Synthetic event guard failed"',
      ' e=row["payload"];e["startsAt"]=p["startsAt"];e["endsAt"]=p["endsAt"]',
      ' for a in e["activities"]: a["startsAt"]=p["startsAt"];a["endsAt"]=p["endsAt"]',
      ' changed=c.execute("UPDATE events SET payload=%s::jsonb WHERE id=%s AND payload->>\'title\'=%s",(json.dumps(e),p["eventId"],p["title"]))',
      ' print(changed.rowcount)',
    ].join('\n'), payload);
    assert.equal(eventRows, '1', 'only the named synthetic event may be moved');
    const registrationRows = serviceCommand('registrations', ['python', '-c'], [
      'import json,sys',
      'from app.domain import db',
      'p=json.loads(sys.argv[1])',
      'with db() as c:',
      ' rows=c.execute("SELECT r.id,r.snapshot FROM registrations r JOIN inventories i ON i.activity_id=r.activity_id WHERE i.event_id=%s AND r.snapshot->>\'eventId\'=%s AND r.snapshot->>\'eventTitle\'=%s FOR UPDATE OF r",(p["eventId"],p["eventId"],p["title"])).fetchall()',
      ' assert {str(r["id"]) for r in rows}==set(p["registrationIds"]),"Synthetic registration guard failed"',
      ' for r in rows:',
      '  s=r["snapshot"];s["activity"]["startsAt"]=p["startsAt"];s["activity"]["endsAt"]=p["endsAt"]',
      '  c.execute("UPDATE registrations SET snapshot=%s::jsonb WHERE id=%s AND snapshot->>\'eventId\'=%s",(json.dumps(s),r["id"],p["eventId"]))',
      ' print(len(rows))',
    ].join('\n'), payload);
    assert.equal(registrationRows, String(registrations.length), 'only this fixture registration set may be moved');
  }

  moveSyntheticWindow(new Date(Date.now() + 3600000).toISOString());
  let attendance;
  await t.test('organizer records one idempotent presence during the activity', async () => {
    attendance = expectStatus(await checkIn(paidA), 200, 'check in confirmed registration').attendance;
    assert.equal(attendance.registrationId, paidA.id);
    assert.equal(attendance.eventId, event.id);
    assert.equal(attendance.userId, a.id);
    assert.equal(attendance.markedBy, owner.id);
    const repeated = expectStatus(await checkIn(paidA), 200, 'repeat check-in').attendance;
    assert.equal(repeated.id, attendance.id);
    assert.equal(repeated.checkedInAt, attendance.checkedInAt);
    const list = expectStatus(await request('/organizer/events/' + event.id + '/attendance', owner.token), 200, 'organizer attendance list');
    assert.equal(list.total, 1);
    assert.equal(list.attendance[0].id, attendance.id);
    expectStatus(await request('/organizer/events/' + event.id + '/attendance', outsider.token), 404, 'unrelated organizer attendance list');
    expectStatus(await request('/registrations/' + paidA.id + '/cancel', a.token, 'POST', {}), 409, 'participant cannot cancel after start');
    expectStatus(await request('/organizer/registrations/' + paidA.id + '/cancel', owner.token, 'POST', {}), 409, 'organizer cannot cancel after start');
    assert.equal(expectStatus(await issue(paidA), 409, 'presence alone does not finish activity').detail.code, 'ACTIVITY_NOT_FINISHED');
  });

  moveSyntheticWindow(new Date(Date.now() - 60000).toISOString());
  let certificate;
  await t.test('certificates require presence and completion, preserve issuance, generate PDF and verify without private identifiers', async () => {
    assert.equal(expectStatus(await issue(freeA), 409, 'ended activity without attendance').detail.code, 'ATTENDANCE_REQUIRED');
    certificate = expectStatus(await issue(paidA), 201, 'issue completed attendance certificate').certificate;
    assert.equal(certificate.registrationId, paidA.id);
    assert.equal(certificate.participantName, a.name);
    assert.equal(certificate.attendanceId, attendance.id);
    assert.equal(expectStatus(await issue(paidA), 201, 'idempotent certificate issuance').certificate.id, certificate.id);
    const own = expectStatus(await request('/certificates', a.token), 200, 'certificate issuance history');
    assert.equal(own.certificates.filter(item => item.registrationId === paidA.id).length, 1);
    assert.equal(expectStatus(await request('/certificates/' + certificate.id, a.token), 200, 'own certificate detail').valid, true);
    expectStatus(await request('/certificates/' + certificate.id, outsider.token), 404, 'foreign certificate detail');
    expectStatus(await request('/certificates/' + certificate.id + '/download', b.token), 404, 'foreign certificate PDF');
    expectStatus(await request('/certificates', b.token, 'POST', {registrationId: paidA.id}), 404, 'foreign certificate issuance');
    const pdf = await request('/certificates/' + certificate.id + '/download', a.token);
    expectStatus(pdf, 200, 'certificate PDF');
    assert.match(pdf.headers.get('content-type'), /^application\/pdf/);
    assert.match(pdf.headers.get('content-disposition'), /attachment/);
    assert.equal(pdf.bytes.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(pdf.bytes.length > 1000, 'PDF must contain an actual document');
    await mkdir('tmp', {recursive: true});
    await writeFile('tmp/backend-completion-certificate.pdf', pdf.bytes);
    const verified = expectStatus(await request('/certificates/verify/' + certificate.verificationCode), 200, 'public certificate verification');
    assert.equal(verified.valid, true);
    assert.equal(verified.reason, null);
    assert.equal(verified.certificate.id, certificate.id);
    assert.equal(verified.certificate.participantName, a.name);
    const publicText = JSON.stringify(verified);
    for (const privateValue of [a.email, a.cpf, a.id, paidA.id, attendance.id]) {
      assert.equal(publicText.includes(privateValue), false, 'verification must not expose participant private data or internal IDs');
    }
    for (const field of ['email', 'cpf', 'phone', 'userId', 'registrationId', 'attendanceId']) {
      assert.equal(Object.hasOwn(verified.certificate, field), false);
    }
  });

  function assertReport(report) {
    assert.equal(report.eventId, event.id);
    assert.equal(report.complete, true);
    assert.equal(report.paymentMode, 'SIMULATED');
    assert.equal(report.total, 5);
    assert.deepEqual(report.byStatus, {PENDING_PAYMENT: 1, CONFIRMED: 2, CANCELLED: 1, EXPIRED: 0, WAITLISTED: 1});
    assert.equal(report.attendanceCount, 1);
    assert.equal(report.confirmedAttendanceCount, 1);
    assert.equal(report.simulatedRevenueCents, 5000);
    assert.equal(report.activities.length, 2);
    const paidReport = report.activities.find(item => item.activityId === paid.id);
    const freeReport = report.activities.find(item => item.activityId === free.id);
    assert.equal(paidReport.total, 3);
    assert.equal(paidReport.simulatedRevenueCents, 5000);
    assert.equal(paidReport.attendanceCount, 1);
    assert.equal(freeReport.total, 2);
    assert.equal(freeReport.simulatedRevenueCents, 0);
    assert.equal(freeReport.byStatus.CANCELLED, 1);
  }

  await t.test('reports reconcile real domain snapshots and duplicate messages without double counting', async () => {
    const path = '/reports/events/' + event.id;
    expectStatus(await request(path, outsider.token), 404, 'unrelated organizer report');
    expectStatus(await request(path, a.token), 404, 'participant report');
    const before = expectStatus(await request(path, owner.token), 200, 'complete organizer report').report;
    assertReport(before);
    const replayId = randomUUID();
    const message = {id: replayId, type: 'registration.confirmed', version: 1, registrationId: paidA.id, userId: a.id};
    const replay = serviceCommand('registrations', ['python', '-c'], [
      'import json,os,sys,pika',
      'p=json.loads(sys.argv[1])',
      'c=pika.BlockingConnection(pika.ConnectionParameters(host="rabbitmq",credentials=pika.PlainCredentials(os.environ["RABBITMQ_USER"],os.environ["RABBITMQ_PASSWORD"]),socket_timeout=5,blocked_connection_timeout=5))',
      'ch=c.channel();ch.exchange_declare(exchange="eventhub",exchange_type="topic",durable=True);ch.confirm_delivery()',
      'for _ in range(2): ch.basic_publish(exchange="eventhub",routing_key=p["type"],body=json.dumps(p),properties=pika.BasicProperties(delivery_mode=2,message_id=p["id"]),mandatory=True)',
      'c.close();print("published twice")',
    ].join('\n'), JSON.stringify(message));
    assert.equal(replay, 'published twice');
    // Read only Reporting's own deduplication table, as its own application role.
    // Checking the claim proves the worker consumed this replay, beyond GET reconciliation.
    const consumed = serviceCommand('reporting', ['python', '-c'], [
      'import sys,time',
      'from app.domain import db',
      'deadline=time.monotonic()+25',
      'while True:',
      ' with db() as c: n=c.execute("SELECT count(*) AS n FROM processed_messages WHERE id=%s",(sys.argv[1],)).fetchone()["n"]',
      ' if n==1: print(n);break',
      ' if time.monotonic()>deadline: raise RuntimeError("Reporting did not consume synthetic replay")',
      ' time.sleep(0.5)',
    ].join('\n'), replayId);
    assert.equal(consumed, '1');
    await pause(500);
    assertReport(expectStatus(await request(path, owner.token), 200, 'report after duplicate message delivery').report);
    assertReport(expectStatus(await request(path, owner.token), 200, 'repeat report reconciliation').report);
    const csv = await request(path + '/export.csv', owner.token);
    expectStatus(csv, 200, 'report CSV');
    assert.match(csv.headers.get('content-type'), /^text\/csv/);
    assert.ok(csv.text.includes('SIMULATED'));
    assert.equal(csv.text.includes(a.email), false);
  });

  await t.test('waitlisted and unpaid participants can still leave after the activity starts', async () => {
    const unpaid = expectStatus(await request('/registrations/' + paidC.id + '/cancel', c.token, 'POST', {}), 200, 'cancel unpaid reservation after start').registration;
    const waiting = expectStatus(await request('/registrations/' + paidB.id + '/cancel', b.token, 'POST', {}), 200, 'leave waitlist after start').registration;
    assert.equal(unpaid.status, 'CANCELLED');
    assert.equal(waiting.status, 'CANCELLED');
    const report = expectStatus(await request('/reports/events/' + event.id, owner.token), 200, 'report after unconfirmed cancellations').report;
    assert.deepEqual(report.byStatus, { PENDING_PAYMENT: 0, CONFIRMED: 2, CANCELLED: 3, EXPIRED: 0, WAITLISTED: 0 });
    assert.equal(report.simulatedRevenueCents, 5000);
    assert.equal(report.confirmedAttendanceCount, 1);
  });

  await t.test('logout, password change and recovery immediately revoke affected sessions across protected services', async () => {
    const otherSession = await login(a);
    assert.notEqual(otherSession, a.token);
    expectStatus(await request('/auth/logout', a.token, 'POST', {}), 204, 'persist logout revocation');
    expectStatus(await request('/users/me', a.token), 401, 'logged out token denied');
    expectStatus(await request('/registrations', a.token), 401, 'gateway rejects logged out token');
    expectStatus(await request('/certificates/' + certificate.id + '/download', a.token), 401, 'certificate download rejects logged out token');
    expectStatus(await request('/users/me', otherSession), 200, 'logout preserves another session');
    const concurrentSession = await login(a);
    const changedPassword = 'QA-backend-changed-456';
    expectStatus(await request('/users/me/password', otherSession, 'POST', {
      currentPassword: originalPassword, newPassword: changedPassword,
    }), 200, 'change synthetic account password');
    for (const token of [otherSession, concurrentSession]) {
      expectStatus(await request('/users/me', token), 401, 'password change revokes every earlier token');
      expectStatus(await request('/registrations', token), 401, 'password change revocation at gateway');
    }
    expectStatus(await request('/auth/login', null, 'POST', {email: a.email, password: originalPassword}), 401, 'old password no longer logs in');
    const resetSessionA = await login(a, changedPassword);
    const resetSessionB = await login(a, changedPassword);
    const forgot = expectStatus(await request('/auth/password/forgot', null, 'POST', {email: a.email}), 202, 'password recovery request');
    assert.equal(Object.hasOwn(forgot, 'token'), false);
    const resetToken = syntheticMailboxToken(a.email, '/redefinir-senha');
    const resetPassword = 'QA-backend-reset-789';
    expectStatus(await request('/auth/password/reset', null, 'POST', {token: resetToken, password: resetPassword}), 200, 'redeem recovery link');
    for (const token of [resetSessionA, resetSessionB]) {
      expectStatus(await request('/users/me', token), 401, 'password reset revokes all earlier tokens');
      expectStatus(await request('/certificates', token), 401, 'password reset revocation at business gateway');
    }
    expectStatus(await request('/auth/password/reset', null, 'POST', {token: resetToken, password: 'QA-repeat-reset-123'}), 400, 'one-time link cannot be reused');
    expectStatus(await request('/auth/login', null, 'POST', {email: a.email, password: changedPassword}), 401, 'pre-reset password rejected');
    const finalSession = await login(a, resetPassword);
    expectStatus(await request('/users/me', finalSession), 200, 'new recovery password works');
    expectStatus(await request('/certificates/' + certificate.id, finalSession), 200, 'new session can access certificate');
  });

  await t.test('email confirmation preserves the old address until proof and revokes all prior sessions', async () => {
    const newEmail = 'qa-backend-completion-updated-c-' + suffix + '@example.test';
    const secondSession = await login(c);
    expectStatus(await request('/users/me/email', c.token, 'POST', {
      email: newEmail, currentPassword: originalPassword,
    }), 202, 'request synthetic email change');
    assert.equal(expectStatus(await request('/users/me', c.token), 200, 'profile before confirmation').user.email, c.email);
    const confirmationToken = syntheticMailboxToken(newEmail, '/confirmar-email');
    expectStatus(await request('/auth/email/confirm', null, 'POST', {token: confirmationToken}), 204, 'confirm new mailbox ownership');
    for (const token of [c.token, secondSession]) {
      expectStatus(await request('/users/me', token), 401, 'email confirmation revokes previous sessions');
      expectStatus(await request('/registrations', token), 401, 'email confirmation revocation reaches gateway');
    }
    expectStatus(await request('/auth/email/confirm', null, 'POST', {token: confirmationToken}), 400, 'email link is single use');
    expectStatus(await request('/auth/login', null, 'POST', {email: c.email, password: originalPassword}), 401, 'old email stops authenticating');
    const confirmed = expectStatus(await request('/auth/login', null, 'POST', {email: newEmail, password: originalPassword}), 200, 'new email authenticates');
    assert.equal(confirmed.user.id, c.id);
    assert.equal(confirmed.user.email, newEmail);
    assert.ok(Number.isFinite(Date.parse(confirmed.user.emailVerifiedAt)), 'confirmed email records proof time');
  });
});
