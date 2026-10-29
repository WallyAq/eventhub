import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const base = process.env.EVENTHUB_URL || 'http://127.0.0.1:8080';
async function call(path, { method = 'GET', body, token } = {}) {
  return fetch(base + '/api' + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
}

test('participant flow persists users and isolates profiles through Nginx and gateway', async () => {
  const suffix = randomUUID().replaceAll('-', '');
  const email = 'qa-' + suffix + '@example.test';
  const otherEmail = 'qa-other-' + suffix + '@example.test';
  const password = 'Senha de teste ' + randomUUID();
  const signup = await call('/auth/register', { method: 'POST', body: { name: 'Pessoa de Teste', email: email.toUpperCase(), password } });
  assert.equal(signup.status, 201);
  const user = (await signup.json()).user;
  assert.equal(user.email, email);
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.role, 'PARTICIPANT');
  assert.equal((await call('/auth/register', { method: 'POST', body: { name: 'Duplicada', email, password } })).status, 409);
  assert.equal((await call('/auth/register', { method: 'POST', body: { name: 'Elevada', email: otherEmail, password, role: 'ORGANIZER' } })).status, 400);
  assert.equal((await call('/auth/login', { method: 'POST', body: { email, password: 'Senha incorreta 123!' } })).status, 401);
  const login = await call('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  const { accessToken: token } = await login.json();
  assert.equal((await call('/users/me')).status, 401);
  assert.equal((await call('/users/me', { token: token.slice(0, -3) + 'xxx' })).status, 401);
  const profile = await call('/users/me', { token });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.id, user.id);
  assert.equal((await call('/users/me', { method: 'PATCH', token, body: { email: otherEmail, name: 'Tentativa' } })).status, 400);
  const updated = await call('/users/me', { method: 'PATCH', token, body: { name: 'Nome Atualizado' } });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).user.name, 'Nome Atualizado');
  const otherSignup = await call('/auth/register', { method: 'POST', body: { name: 'Outra Pessoa', email: otherEmail, password } });
  assert.equal(otherSignup.status, 201);
  const other = (await otherSignup.json()).user;
  const otherLogin = await call('/auth/login', { method: 'POST', body: { email: otherEmail, password } });
  assert.equal(otherLogin.status, 200);
  const otherToken = (await otherLogin.json()).accessToken;
  assert.equal((await (await call('/users/me', { token: otherToken })).json()).user.id, other.id);
  assert.equal((await call('/users/' + other.id, { token })).status, 404);

  const result = execFileSync('docker', ['compose', 'exec', '-T', 'identity', 'node', '--input-type=module', '-e',
    `import pg from 'pg'; const p=new pg.Pool(); const r=await p.query('SELECT password_hash,name FROM users WHERE id=$1',[process.argv[1]]); console.log(JSON.stringify({hashed:r.rows[0].password_hash.startsWith('scrypt$'),name:r.rows[0].name})); await p.end();`, user.id], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(result.trim()), { hashed: true, name: 'Nome Atualizado' });
  for (const path of ['/login', '/cadastro', '/perfil', '/diagnostico']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /EventHub/);
  }
  // Mantém apenas contas sintéticas identificadas por qa- para evidência reproduzível.
});

