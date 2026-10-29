import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.EVENTHUB_URL || 'http://127.0.0.1:8080';
async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(base + '/api' + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}
test('8-character password and organization ownership are enforced end to end', async () => {
  const suffix = randomUUID().replaceAll('-', '');
  const ownerEmail = 'qa-owner-' + suffix + '@example.test';
  const password = 'Teste123';
  assert.equal((await call('/auth/register', { method: 'POST', body: { name: 'Curta', email: ownerEmail, password: 'Teste12' } })).status, 400);
  async function account(email, name) {
    const created = await call('/auth/register', { method: 'POST', body: { name, email, password } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const login = await call('/auth/login', { method: 'POST', body: { email, password } });
    assert.equal(login.status, 200);
    return { token: login.body.accessToken, user: created.body.user };
  }
  const owner = await account(ownerEmail, 'Responsável QA');
  const memberEmail = 'qa-organizer-' + suffix + '@example.test';
  const member = await account(memberEmail, 'Organizador QA');
  const outsider = await account('qa-outsider-' + suffix + '@example.test', 'Outra Organização QA');
  assert.equal((await call('/organizations')).status, 401);
  assert.deepEqual((await call('/organizations', { token: owner.token })).body.organizations, []);
  const created = await call('/organizations', { method: 'POST', token: owner.token, body: { name: 'Organização QA', description: 'Teste de isolamento' } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const organization = created.body.organization;
  assert.equal(organization.membershipRole, 'OWNER');
  const path = '/organizations/' + organization.id;
  assert.equal((await call(path, { token: outsider.token })).status, 404);
  assert.equal((await call(path + '/members', { token: outsider.token })).status, 404);
  assert.equal((await call(path, { method: 'PATCH', token: outsider.token, body: { name: 'Invadida' } })).status, 404);
  const unknownMember = await call(path + '/members', { method: 'POST', token: owner.token, body: { email: 'missing-' + suffix + '@example.test' } });
  assert.equal(unknownMember.status, 404);
  const added = await call(path + '/members', { method: 'POST', token: owner.token, body: { email: memberEmail.toUpperCase() } });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  assert.equal(added.body.member.role, 'ORGANIZER');
  assert.equal((await call(path + '/members', { method: 'POST', token: owner.token, body: { email: memberEmail } })).status, 409);
  assert.equal((await call(path + '/members', { method: 'POST', token: owner.token, body: { email: memberEmail, role: 'OWNER' } })).status, 400);
  const membership = await call(path, { token: member.token });
  assert.equal(membership.status, 200);
  assert.equal(membership.body.organization.membershipRole, 'ORGANIZER');
  assert.equal((await call('/organizations', { token: member.token })).body.organizations[0].id, organization.id);
  assert.equal((await call(path, { method: 'PATCH', token: member.token, body: { name: 'Invadida' } })).status, 403);
  assert.equal((await call(path + '/members', { method: 'POST', token: member.token, body: { email: ownerEmail } })).status, 403);
  const update = await call(path, { method: 'PATCH', token: owner.token, body: { name: 'Nome Atualizado QA' } });
  assert.equal(update.status, 200, JSON.stringify(update.body));
  assert.equal(update.body.organization.name, 'Nome Atualizado QA');
  const members = await call(path + '/members', { token: member.token });
  assert.equal(members.body.members.length, 2);
  assert.equal(members.body.members.filter(item => item.role === 'OWNER').length, 1);
  assert.deepEqual((await call('/organizations', { token: outsider.token })).body.organizations, []);
  assert.equal((await fetch(base + '/organizacoes')).status, 200);
});

