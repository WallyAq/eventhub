import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';

const base = process.env.EVENTHUB_URL || 'http://127.0.0.1:8080';
async function call(path, method = 'GET', body, token) {
  const response = await fetch(base + '/api' + path, { method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return { status: response.status, data: await response.json() };
}

test('Figma profile fields persist and password change verifies the old password', async () => {
  const email = 'qa-figma-' + randomUUID() + '@example.test';
  const registration = await call('/auth/register','POST',{ name:'Perfil QA',email,password:'Figma123',cpf:'529.982.247-25',phone:'(85) 91234-5678',termsAccepted:true,marketingOptIn:true });
  assert.equal(registration.status,201,JSON.stringify(registration.data));
  const login = await call('/auth/login','POST',{email,password:'Figma123'});
  const token = login.data.accessToken;
  const profile = await call('/users/me','GET',undefined,token);
  assert.equal(profile.data.user.cpf,'52998224725');
  assert.equal(profile.data.user.phone,'85912345678');
  assert.equal(profile.data.user.marketingOptIn,true);
  assert.equal((await call('/users/me','PATCH',{ name:'Novo Nome QA',phone:'(85) 99999-1111' },token)).status,200);
  assert.equal((await call('/users/me/password','POST',{currentPassword:'Errada12',newPassword:'Nova1234'},token)).status,400);
  assert.equal((await call('/users/me/password','POST',{currentPassword:'Figma123',newPassword:'Nova1234'},token)).status,200);
  assert.equal((await call('/auth/login','POST',{email,password:'Figma123'})).status,401);
  assert.equal((await call('/auth/login','POST',{email,password:'Nova1234'})).status,200);
});

test('institution registration is atomic and duplicate CNPJ does not leave an orphan account', async () => {
  const suffix = randomUUID(), email = 'qa-figma-org-' + suffix + '@example.test';
  const cnpj = '999999' + randomInt(10000000,99999999);
  const body = { name:'Instituição QA',email,password:'Figma123',termsAccepted:true,
    organization:{ cnpj,legalName:'Instituição de Teste QA',tradeName:'Equipe QA',entityType:'Universidade',phone:'(85) 91234-5678' } };
  const created = await call('/auth/register','POST',body);
  assert.equal(created.status,201,JSON.stringify(created.data));
  const login = await call('/auth/login','POST',{email,password:'Figma123'});
  const token = login.data.accessToken;
  const list = await call('/organizations','GET',undefined,token);
  assert.equal(list.data.organizations.length,1);
  const organization = list.data.organizations[0];
  assert.equal(organization.cnpj,cnpj);
  assert.equal(organization.legalName,'Instituição de Teste QA');
  assert.equal(organization.membershipRole,'OWNER');
  const updated = await call('/organizations/' + organization.id,'PATCH',{legalName:'Razão Social Atualizada QA',phone:'(85) 99999-1111',email:'contato@example.test'},token);
  assert.equal(updated.status,200,JSON.stringify(updated.data));
  assert.equal(updated.data.organization.phone,'85999991111');
  const otherEmail = 'qa-figma-rollback-' + suffix + '@example.test';
  const duplicate = await call('/auth/register','POST',{...body,email:otherEmail});
  assert.equal(duplicate.status,409);
  assert.equal(duplicate.data.error,'organization_in_use');
  assert.equal((await call('/auth/login','POST',{email:otherEmail,password:'Figma123'})).status,401);
});
