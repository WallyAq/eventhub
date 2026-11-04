import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createSessionVerifier } from '../src/security/sessions.js';

test('session verification rejects revoked credentials and fails closed on Identity outages', async () => {
  let calls = 0;
  const claims = { sub: 'participant-id', role: 'PARTICIPANT' };
  const local = async token => { if (token !== 'valid') throw new Error('signature'); return claims; };
  let status = 200;
  const verify = createSessionVerifier(local, 'http://identity', 'private-key', async (url, init) => {
    calls++;
    assert.equal(url, 'http://identity/internal/auth/verify');
    assert.equal(init.headers['x-internal-key'], 'private-key');
    assert.deepEqual(JSON.parse(init.body), { token: 'valid' });
    return Response.json({ identity: claims }, { status });
  });
  await assert.rejects(verify('bad'));
  assert.equal(calls, 0);
  assert.deepEqual(await verify('valid'), claims);
  status = 401;
  await assert.rejects(verify('valid'), error => error.status === 401);
  status = 503;
  await assert.rejects(verify('valid'), error => error.status === 503);
  const malformed = createSessionVerifier(local, 'http://identity', 'private-key', async () => Response.json({ identity: { ...claims, sub: 'another-user' } }));
  await assert.rejects(malformed('valid'), error => error.status === 503);
});

test('new domain routes protect downloads, preserve PDF/CSV bytes, and hide internal APIs', async t => {
  const services = Object.fromEntries(['identity', 'events', 'registrations', 'payments', 'attendance', 'certificates', 'reporting'].map(name => [name, 'http://' + name]));
  const requests = [];
  const request = async (url, init) => {
    requests.push({ url, init });
    if (url.includes('/download')) return new Response(Buffer.from('%PDF-1.4\nfixture'), { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="certificate.pdf"' } });
    if (url.endsWith('export.csv')) return new Response('atividade,total\nQA,1\n', { headers: { 'content-type': 'text/csv; charset=utf-8' } });
    if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 });
    return Response.json({ ok: true });
  };
  const verify = async token => { if (token !== 'valid') throw new Error('invalid'); };
  const server = createApp(services, request, verify).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/certificates/one/download')).status, 401);
  assert.equal(requests.length, 0);
  const headers = { authorization: 'Bearer valid', 'x-internal-key': 'client-cannot-impersonate' };
  const pdf = await fetch(base + '/certificates/one/download', { headers });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(await pdf.text(), '%PDF-1.4\nfixture');
  assert.equal(requests.at(-1).url, 'http://certificates/certificates/one/download');
  assert.equal(requests.at(-1).init.headers['x-internal-key'], undefined);
  const csv = await fetch(base + '/reports/events/event/export.csv', { headers });
  assert.match(csv.headers.get('content-type'), /^text\/csv/);
  assert.equal(await csv.text(), 'atividade,total\nQA,1\n');
  assert.equal(requests.at(-1).url, 'http://reporting/reports/events/event/export.csv');
  assert.equal((await fetch(base + '/certificates/verify/public-code')).status, 200);
  assert.equal((await fetch(base + '/attendance/check-ins', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' })).status, 200);
  assert.equal(requests.at(-1).url, 'http://attendance/attendance/check-ins');
  assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers })).status, 204);
  const count = requests.length;
  for (const path of ['/internal/auth/verify', '/internal/users/user', '/internal/attendance/registrations/reg', '/internal/events/event/registrations'])
    assert.equal((await fetch(base + path, { headers })).status, 404);
  assert.equal(requests.length, count);
});

test('a failed session lookup is reported as unavailability instead of invalid credentials', async t => {
  const verify = async () => { throw Object.assign(new Error('offline'), { status: 503 }); };
  const request = async () => { assert.fail('A protected request must not be forwarded after session lookup failure'); };
  const server = createApp({ identity: 'http://identity', registrations: 'http://registrations' }, request, verify).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  for (const path of ['/users/me', '/registrations']) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, { headers: { authorization: 'Bearer valid' } });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'identity_unavailable');
  }
});
