import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { createTokens } from '../src/security/tokens.js';
import { createSessions, tokenHash } from '../src/security/sessions.js';
import { createApp } from '../src/app.js';
import { createUserService } from '../src/users/service.js';
import { hashPassword } from '../src/security/passwords.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const args = [Buffer.from(keys.privateKey).toString('base64'), Buffer.from(keys.publicKey).toString('base64')];

function sessionPool(user) {
  const revoked = new Set();
  return {
    revoked, offline: false,
    async query(sql, values) {
      if (this.offline) throw new Error('database offline');
      if (sql.startsWith('SELECT credentials_version')) return { rows: user ? [{ version: user.credentialsVersion, revoked: revoked.has(values[1]) }] : [] };
      if (sql.startsWith('INSERT INTO revoked_sessions')) { revoked.add(values[0]); return {}; }
      if (sql.startsWith('DELETE FROM revoked_sessions')) return {};
      return { rows: [] };
    },
  };
}

test('logout revokes only its unique token; credential rotation revokes all sessions and legacy JWTs', async () => {
  const user = { id: randomUUID(), role: 'PARTICIPANT', credentialsVersion: 0 };
  const pool = sessionPool(user), tokens = await createTokens(...args, createSessions(pool));
  const first = await tokens.issue(user), second = await tokens.issue(user);
  assert.notEqual(first, second, 'same-second logins are separate sessions');
  const claims = await tokens.verify(first);
  await tokens.revoke(first, claims);
  assert.ok(pool.revoked.has(tokenHash(first)));
  await assert.rejects(tokens.verify(first), /Revoked/);
  await tokens.verify(second);
  const legacy = await new SignJWT({ role: user.role }).setProtectedHeader({ alg: 'RS256' })
    .setIssuer('eventhub-identity').setAudience('eventhub-api').setSubject(user.id).setIssuedAt().setExpirationTime('1h')
    .sign(await importPKCS8(keys.privateKey, 'RS256'));
  await tokens.verify(legacy);
  user.credentialsVersion++;
  await assert.rejects(tokens.verify(second), /Revoked/);
  await assert.rejects(tokens.verify(legacy), /Revoked/);
  await tokens.verify(await tokens.issue(user));
});

test('verification fails closed on unavailable session store and HTTP preserves 503', async t => {
  const user = { id: randomUUID(), role: 'PARTICIPANT', credentialsVersion: 0 };
  const pool = sessionPool(user), tokens = await createTokens(...args, createSessions(pool)), token = await tokens.issue(user);
  const server = createApp(pool, { tokens, service: { profile: async () => user }, internalKey: 'internal-test' }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/internal/users/' + user.id)).status, 401);
  const internal = await fetch(base + '/internal/auth/verify', { method: 'POST', headers: { 'x-internal-key': 'internal-test', 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  assert.equal(internal.status, 200);
  assert.equal((await internal.json()).identity.sub, user.id);
  const logout = await fetch(base + '/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + token } });
  assert.equal(logout.status, 204);
  assert.equal((await fetch(base + '/auth/session', { headers: { authorization: 'Bearer ' + token } })).status, 401);
  pool.offline = true;
  assert.equal((await fetch(base + '/auth/session', { headers: { authorization: 'Bearer ' + token } })).status, 503);
});

test('password service uses atomic credential rotation and does not expose version in login', async () => {
  const user = { id: randomUUID(), name: 'Pessoa', email: 'pessoa@example.test', role: 'PARTICIPANT', credentialsVersion: 0, passwordHash: await hashPassword('Senha atual 123!') };
  const pool = sessionPool(user), tokens = await createTokens(...args, createSessions(pool));
  const repository = {
    async findCredentials() { return { ...user }; },
    async findById() { return { id: user.id, email: user.email }; },
    async changePassword(id, oldHash, newHash) {
      assert.equal(id, user.id); assert.equal(oldHash, user.passwordHash);
      user.passwordHash = newHash; user.credentialsVersion++; return true;
    },
  };
  const service = createUserService(repository, tokens), first = await service.login({ email: user.email, password: 'Senha atual 123!' });
  assert.equal(first.user.credentialsVersion, undefined);
  await assert.rejects(service.changePassword(user.id, { currentPassword: 'Senha incorreta', newPassword: 'Senha nova 123!' }), { code: 'invalid_password' });
  await tokens.verify(first.accessToken);
  await service.changePassword(user.id, { currentPassword: 'Senha atual 123!', newPassword: 'Senha nova 123!' });
  await assert.rejects(tokens.verify(first.accessToken), /Revoked/);
  const next = await service.login({ email: user.email, password: 'Senha nova 123!' });
  assert.equal((await tokens.verify(next.accessToken)).sv, 1);
});
