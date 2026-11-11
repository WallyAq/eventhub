import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createApp } from '../../services/identity/src/app.js';
import { createUserService } from '../../services/identity/src/users/service.js';
import { hashPassword } from '../../services/identity/src/security/passwords.js';
import { createOrganizationService } from '../../services/identity/src/organizations/service.js';
import { createOrganizationRepository } from '../../services/identity/src/organizations/repository.js';
import { createTokens } from '../../services/identity/src/security/tokens.js';
import { createSessions } from '../../services/identity/src/security/sessions.js';
import { createVerifier } from '../../gateway/src/security/tokens.js';
import { createSessionVerifier } from '../../gateway/src/security/sessions.js';

const userId = '11111111-1111-4111-8111-111111111111';
const organizationId = '22222222-2222-4222-8222-222222222222';
const otherInstitution = '33333333-3333-4333-8333-333333333333';

async function httpApp(t, options) {
  const app = createApp({ query: async () => ({ rows: [] }) }, options);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return async (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('direct API rejects role/institution injection into registration and own profile', async t => {
  const service = createUserService({}, {});
  const request = await httpApp(t, { service, tokens: { verify: async () => ({ sub: userId, role: 'PARTICIPANT' }) } });
  for (const body of [
    { name: 'Test User', email: 'user@example.test', password: 'testPassword123', role: ['PARTICIPANT','ORGANIZER'] },
    { name: 'Test User', email: 'user@example.test', password: 'testPassword123', organizationId },
  ]) assert.equal((await request('/auth/register', 'POST', body)).status, 400);
  for (const body of [{ name: 'New Name', role: 'ORGANIZER' }, { name: 'New Name', organizationId }])
    assert.equal((await request('/users/me', 'PATCH', body)).status, 400);
});

test('direct login API rejects the wrong area before issuing a token and accepts the persisted profile', async t => {
  const password = 'testPassword123';
  const passwordHash = await hashPassword(password);
  let issued = 0;
  const accounts = new Map([
    ['participant@example.test', { id: userId, role: 'PARTICIPANT', organizationId: null }],
    ['organizer@example.test', { id: userId, role: 'ORGANIZER', organizationId }],
  ]);
  const service = createUserService({
    findCredentials: async email => ({ ...accounts.get(email), email, passwordHash, credentialsVersion: 0 }),
  }, {
    issue: async user => { issued += 1; return `token-${user.role}`; },
    expiresIn: 900,
  });
  const request = await httpApp(t, { service, tokens: {} });
  for (const [email, area, message] of [
    ['participant@example.test', 'organization', 'Esta conta é de participante. Acesse a área do participante.'],
    ['organizer@example.test', 'participant', 'Esta conta é de organizador. Acesse a área do organizador.'],
  ]) {
    const response = await request('/auth/login', 'POST', { email, password, area });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'account_area_mismatch');
    assert.equal(body.message, message);
    assert.equal(body.accessToken, undefined);
  }
  assert.equal(issued, 0);
  for (const [email, area, role] of [
    ['participant@example.test', 'participant', 'PARTICIPANT'],
    ['organizer@example.test', 'organization', 'ORGANIZER'],
    ['participant@example.test', undefined, 'PARTICIPANT'],
    ['organizer@example.test', undefined, 'ORGANIZER'],
  ]) {
    const response = await request('/auth/login', 'POST', { email, password, ...(area ? { area } : {}) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user.role, role);
    assert.equal(body.accessToken, `token-${role}`);
  }
  assert.equal(issued, 4);
});

test('direct login API validates area values and preserves generic credential errors', async t => {
  const passwordHash = await hashPassword('testPassword123');
  let issued = 0;
  const service = createUserService({
    findCredentials: async () => ({ id: userId, role: 'PARTICIPANT', passwordHash }),
  }, { issue: async () => { issued += 1; return 'unexpected'; } });
  const request = await httpApp(t, { service, tokens: {} });
  for (const area of ['ORGANIZER', 'admin', '', null, ['participant']]) {
    const response = await request('/auth/login', 'POST', { email: 'participant@example.test', password: 'testPassword123', area });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_input');
  }
  const response = await request('/auth/login', 'POST', {
    email: 'participant@example.test', password: 'wrongPassword123', area: 'organization',
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).message, 'E-mail ou senha incorretos.');
  assert.equal(issued, 0);
});

test('direct organization API denies participant reads and mutations', async t => {
  const request = await httpApp(t, { organizations: {}, tokens: { verify: async () => ({ sub: userId, role: 'PARTICIPANT' }) } });
  for (const [path, method, body] of [
    ['/organizations', 'GET'], ['/organizations', 'POST', { name: 'Second Institution' }],
    [`/organizations/${organizationId}`, 'GET'], [`/organizations/${organizationId}/members`, 'POST', { email: 'someone@example.test' }],
  ]) assert.equal((await request(path, method, body)).status, 403);
});

test('organizer cannot create another institution or remove the sole link', async t => {
  const organizations = createOrganizationService({ findForUser: async () => ({ membershipRole: 'OWNER' }) });
  const request = await httpApp(t, { organizations, tokens: { verify: async () => ({ sub: userId, role: 'ORGANIZER', organizationId }) } });
  assert.equal((await request('/organizations', 'POST', { name: 'Second Institution' })).status, 409);
  assert.equal((await request(`/organizations/${organizationId}/members/${userId}`, 'DELETE')).status, 409);
});

test('adding members never converts participants or accepts a second institution', async () => {
  for (const [row, code] of [
    [{ id: userId, accountRole: 'PARTICIPANT', organizationId: null }, 'PROFILE_REQUIRED'],
    [{ id: userId, accountRole: 'ORGANIZER', organizationId: otherInstitution }, 'INSTITUTION_FIXED'],
  ]) {
    const repository = createOrganizationRepository({ query: async () => ({ rows: [row] }) });
    await assert.rejects(repository.addMember(organizationId, userId, 'member@example.test'), { code });
  }
  const repository = createOrganizationRepository({ query: async () => ({ rows: [{ id: userId, accountRole: 'ORGANIZER', organizationId, role: 'ORGANIZER' }] }) });
  assert.deepEqual(await repository.addMember(organizationId, userId, 'member@example.test'), { id: userId, role: 'ORGANIZER' });
});

test('signed profile claims are exclusive and organizer claims require an institution', async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = Buffer.from(pair.privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64');
  const publicKey = Buffer.from(pair.publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
  const tokens = await createTokens(privateKey, publicKey);
  const gateway = await createVerifier(publicKey);
  for (const profile of [{ role: 'PARTICIPANT' }, { role: 'ORGANIZER', organizationId }]) {
    const token = await tokens.issue({ id: userId, ...profile });
    assert.equal((await tokens.verify(token)).role, profile.role);
    assert.equal((await gateway(token)).role, profile.role);
  }
  for (const profile of [{ role: ['PARTICIPANT','ORGANIZER'] }, { role: 'ORGANIZER' }, { role: 'PARTICIPANT', organizationId }]) {
    const token = await tokens.issue({ id: userId, ...profile });
    await assert.rejects(tokens.verify(token));
    await assert.rejects(gateway(token));
  }
});

test('session state confronts role and institution with persisted identity', async () => {
  const sessions = createSessions({ query: async () => ({ rows: [{ version: 0, revoked: false, role: 'ORGANIZER', organizationId }] }) });
  assert.equal(await sessions.isValid('test', { sub: userId, role: 'PARTICIPANT' }), false);
  assert.equal(await sessions.isValid('test', { sub: userId, role: 'ORGANIZER', organizationId: otherInstitution }), false);
  assert.equal(await sessions.isValid('test', { sub: userId, role: 'ORGANIZER', organizationId }), true);
  const verify = createSessionVerifier(async () => ({ sub: userId, role: 'ORGANIZER', organizationId }), 'http://identity', 'test-internal',
    async () => ({ ok: true, json: async () => ({ identity: { sub: userId, role: 'ORGANIZER', organizationId: otherInstitution } }) }));
  await assert.rejects(verify('test'), { status: 503 });
});
