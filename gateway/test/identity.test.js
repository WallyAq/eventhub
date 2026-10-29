import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createVerifier } from '../src/security/tokens.js';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

test('gateway fails closed on protected routes and reports identity outage', async t => {
  let calls = 0;
  const request = async () => { calls++; throw new Error('offline'); };
  const verify = async token => { if (token !== 'valid') throw new Error('invalid'); return { sub: 'test' }; };
  const server = createApp({ identity: 'http://identity:3000' }, request, verify).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const authorization of ['', 'Bearer invalid']) {
    assert.equal((await fetch(base + '/users/me', { headers: { authorization } })).status, 401);
  }
  assert.equal(calls, 0);
  assert.equal((await fetch(base + '/users/me', { headers: { authorization: 'Bearer valid' } })).status, 503);
  const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('gateway only verifies RSA tokens with expected claims', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const encoded = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
  const verify = await createVerifier(encoded);
  const sign = (role, expiry, audience = 'eventhub-api') => new SignJWT({ role }).setProtectedHeader({ alg: 'RS256' })
    .setIssuer('eventhub-identity').setAudience(audience).setSubject(randomUUID()).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  assert.equal((await verify(await sign('PARTICIPANT', '15m'))).role, 'PARTICIPANT');
  await assert.rejects(verify(await sign('PARTICIPANT', '0s')));
  await assert.rejects(verify(await sign('ORGANIZER', '15m')));
  await assert.rejects(verify(await sign('PARTICIPANT', '15m', 'wrong')));
});

