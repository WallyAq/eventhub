import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('QR resolution and certificate management stay authenticated, previews preserve PDF bytes', async t => {
  const calls = [];
  const services = { attendance: 'http://attendance', certificates: 'http://certificates', events: 'http://events' };
  const server = createApp(services, async (url, init) => {
    calls.push({ url, init });
    return url.includes('preview') || url.includes('download')
      ? new Response('%PDF-1.4\nfixture', { headers: { 'content-type': 'application/pdf' } }) : Response.json({ ok: true });
  }, async token => { if (token !== 'valid') throw new Error('Unauthorized'); }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const [method, path, target] of [
    ['POST', '/attendance/credentials/resolve', 'attendance'],
    ['GET', '/organizer/events/event/certificate-settings', 'certificates'],
    ['PUT', '/organizer/events/event/certificate-settings', 'certificates'],
    ['GET', '/organizer/events/event/certificate-preview?kind=SPEAKER', 'certificates'],
    ['GET', '/organizer/events/event/speaker-certificates', 'certificates'],
    ['POST', '/organizer/events/event/speaker-certificates', 'certificates'],
    ['GET', '/speaker-certificates/cert/download', 'certificates'],
  ]) {
    const init = { method, headers: { 'content-type': 'application/json' }, ...(['POST', 'PUT'].includes(method) ? { body: '{}' } : {}) };
    const before = calls.length;
    assert.equal((await fetch(base + path, init)).status, 401);
    assert.equal(calls.length, before);
    const response = await fetch(base + path, { ...init, headers: { ...init.headers, authorization: 'Bearer valid' } });
    assert.equal(response.status, 200);
    assert.equal(calls.at(-1).url, 'http://' + target + path);
    if (/preview|download/.test(path)) assert.equal(await response.text(), '%PDF-1.4\nfixture');
  }
  for (const path of ['/internal/certificate-events', '/internal/registrations/resolve-credential'])
    assert.equal((await fetch(base + path, { headers: { authorization: 'Bearer valid' } })).status, 404);
});

test('larger image payloads are scoped to certificate settings and event pricing', async t => {
  const server = createApp({ certificates: 'http://certificates', attendance: 'http://attendance', events: 'http://events' },
    async () => Response.json({ ok: true }), async () => {}).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { authorization: 'Bearer valid', 'content-type': 'application/json' };
  const body = JSON.stringify({ background: 'a'.repeat(25000) });
  assert.equal((await fetch(base + '/organizer/events/event/certificate-settings', { method: 'PUT', headers, body })).status, 200);
  assert.equal((await fetch(base + '/events', { method: 'POST', headers, body })).status, 200);
  assert.equal((await fetch(base + '/attendance/credentials/resolve', { method: 'POST', headers, body })).status, 413);
  assert.equal((await fetch(base + '/organizer/events/event/certificate-settings', { method: 'PUT', headers, body: JSON.stringify({ background: 'a'.repeat(2100000) }) })).status, 413);
});
