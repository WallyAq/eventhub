import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { createTokens } from '../src/security/tokens.js';
import { hashPassword, verifyPassword } from '../src/security/passwords.js';
import { createUserService } from '../src/users/service.js';
import { createApp } from '../src/app.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const tokens = await createTokens(Buffer.from(keys.privateKey).toString('base64'), Buffer.from(keys.publicKey).toString('base64'));

function repository() {
  const users = new Map();
  const publicUser = row => { if (!row) return; const { passwordHash, ...user } = row; return user; };
  return {
    users,
    async create(data) {
      if ([...users.values()].some(row => row.email === data.email)) throw Object.assign(new Error('duplicate'), { code: '23505' });
      const user = { ...data, id: randomUUID(), role: 'PARTICIPANT', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      users.set(user.id, user); return publicUser(user);
    },
    async findCredentials(email) { return [...users.values()].find(row => row.email === email); },
    async findById(id) { return publicUser(users.get(id)); },
    async updateName(id, name) {
      const row = users.get(id);
      if (!row) return;
      row.name = name; return publicUser(row);
    },
  };
}

test('passwords use independent salts and reject wrong or malformed hashes', async () => {
  const password = 'Senha de teste 123!';
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('Senha errada 123!', first), false);
  assert.equal(await verifyPassword(password, 'invalid'), false);
});

test('registration, normalized duplicate email, login and own profile', async () => {
  const repo = repository(), service = createUserService(repo, tokens);
  const first = await service.register({ name: ' Maria Silva ', email: ' Maria@Example.com ', password: 'Senha de teste 123!' });
  assert.equal(first.name, 'Maria Silva');
  assert.equal(first.email, 'maria@example.com');
  assert.equal(first.role, 'PARTICIPANT');
  assert.equal(first.passwordHash, undefined);
  await assert.rejects(service.register({ name: 'Maria', email: 'MARIA@example.com', password: 'Senha de teste 123!' }), { status: 409 });
  await assert.rejects(service.register({ name: 'Maria', email: 'other@example.com', password: 'Senha de teste 123!', role: 'ORGANIZER' }), { status: 400 });
  await assert.rejects(service.register({ name: 'Maria', email: 'other@example.com', password: 'short' }), { status: 400 });
  for (const email of ['maria@example.com', 'missing@example.com'])
    await assert.rejects(service.login({ email, password: 'Senha incorreta 123!' }), { status: 401, code: 'invalid_credentials' });
  const result = await service.login({ email: 'MARIA@example.com', password: 'Senha de teste 123!' });
  assert.equal(result.user.passwordHash, undefined);
  assert.equal((await tokens.verify(result.accessToken)).sub, first.id);
  await assert.rejects(service.updateProfile(first.id, { role: 'ORGANIZER', name: 'Maria' }), { status: 400 });
  assert.equal((await service.updateProfile(first.id, { name: 'Maria Atualizada' })).name, 'Maria Atualizada');
});

test('JWT rejects expiration, wrong audience, wrong signature and algorithm', async () => {
  const key = await importPKCS8(keys.privateKey, 'RS256');
  const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const subject = randomUUID();
  const make = (audience, expiration, signer = key) => new SignJWT({ role: 'PARTICIPANT' })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer('eventhub-identity')
    .setAudience(audience).setSubject(subject).setIssuedAt().setExpirationTime(expiration).sign(signer);
  await assert.rejects(tokens.verify(await make('eventhub-api', '0s')));
  await assert.rejects(tokens.verify(await make('wrong', '15m')));
  await assert.rejects(tokens.verify(await make('eventhub-api', '15m', otherKeys.privateKey)));
  const hmac = await new SignJWT({ role: 'PARTICIPANT' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('eventhub-identity')
    .setAudience('eventhub-api').setSubject(subject).setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode('x'.repeat(64)));
  await assert.rejects(tokens.verify(hmac));
});

test('HTTP rejects missing tokens, malformed JSON and changes to another user', async t => {
  const repo = repository(), service = createUserService(repo, tokens);
  const user = await service.register({ name: 'Pessoa Um', email: 'one@example.com', password: 'Senha de teste 123!' });
  const other = await service.register({ name: 'Pessoa Dois', email: 'two@example.com', password: 'Senha de teste 123!' });
  const server = createApp({ query: async () => ({}) }, { service, tokens }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/users/me')).status, 401);
  assert.equal((await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 400);
  const token = await tokens.issue(user);
  const response = await fetch(base + '/users/me', { headers: { authorization: 'Bearer ' + token } });
  assert.equal((await response.json()).user.id, user.id);
  assert.equal((await fetch(base + '/users/' + other.id, { headers: { authorization: 'Bearer ' + token } })).status, 404);
  assert.equal((await service.profile(other.id)).name, 'Pessoa Dois');
});

