import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { createEmailService } from '../src/users/email.js';
import { hashPassword } from '../src/security/passwords.js';
import { createTokens } from '../src/security/tokens.js';
import { createApp } from '../src/app.js';

const password = 'Senha de email 123!', passwordHash = await hashPassword(password);
const digest = value => createHash('sha256').update(value).digest('hex');

function fixture() {
  const state = { user: { id: randomUUID(), email: 'old@example.test', password_hash: passwordHash, credentials_version: 0, email_verified_at: null },
    pending: null, occupied: false, resets: 1, now: Date.now() };
  const messages = [], statements = []; let snapshot;
  const pool = {
    async query(sql) {
      assert.match(sql, /SELECT password_hash,credentials_version,email FROM users/);
      return { rows: [{ ...state.user }] };
    },
    async connect() { return {
      release() {},
      async query(sql, values = []) {
        statements.push(sql);
        const rows = value => ({ rows: value ? [value] : [] });
        if (sql === 'BEGIN') { snapshot = structuredClone(state); return rows(); }
        if (sql === 'COMMIT') { snapshot = null; return rows(); }
        if (sql === 'ROLLBACK') { Object.assign(state, snapshot); snapshot = null; return rows(); }
        if (sql.startsWith('SELECT credentials_version,password_hash')) return rows(state.user);
        if (sql.startsWith('SELECT id FROM users WHERE email=')) return rows(state.occupied ? { id: randomUUID() } : null);
        if (sql.startsWith('DELETE FROM email_changes WHERE expires_at')) {
          if (state.pending?.expires <= state.now) state.pending = null;
          return rows();
        }
        if (sql.includes('INSERT INTO email_changes')) {
          const [token_hash, user_id, new_email, credentials_version] = values;
          state.pending = { token_hash, user_id, new_email, credentials_version, expires: state.now + 30*60*1000 };
          return rows();
        }
        if (sql.startsWith('SELECT id,credentials_version'))
          return rows(state.pending?.token_hash === values[0] && state.pending.expires > state.now ? state.user : null);
        if (sql.startsWith('DELETE FROM email_changes WHERE token_hash')) {
          const pending = state.pending;
          if (!pending || pending.token_hash !== values[0] || pending.credentials_version !== values[1] || pending.expires <= state.now) return rows();
          state.pending = null; return rows({ new_email: pending.new_email });
        }
        if (sql.startsWith('UPDATE users SET email=')) {
          if (state.occupied) throw Object.assign(new Error('unique email'), { code: '23505' });
          state.user.email = values[1]; state.user.credentials_version++; state.user.email_verified_at = new Date(state.now).toISOString();
          return rows();
        }
        if (sql.startsWith('DELETE FROM password_resets')) { state.resets = 0; return rows(); }
        if (sql.startsWith('DELETE FROM email_changes WHERE user_id')) { state.pending = null; return rows(); }
        throw new Error('Unexpected SQL: ' + sql);
      },
    }; },
  };
  const mailOutbox = { async enqueue(_client, message) { messages.push(message); }, async flush() {} };
  const service = createEmailService(pool, { mailOutbox, env: {} });
  return { state, messages, statements, pool, mailOutbox, service, token: () => messages.at(-1).path.split('#token=')[1] };
}

test('email verification keeps original address until one-time confirmation and revokes sessions', async () => {
  const f = fixture(), keys = generateKeyPairSync('rsa', { modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const tokens = await createTokens(Buffer.from(keys.privateKey).toString('base64'), Buffer.from(keys.publicKey).toString('base64'), {
    async isValid(_token, claims) { return claims.sv === f.state.user.credentials_version; },
  });
  const before = await tokens.issue({ id: f.state.user.id, role: 'PARTICIPANT', credentialsVersion: 0 });
  await f.service.request(f.state.user.id, { email: ' NEW@Example.test ', currentPassword: password });
  assert.equal(f.state.user.email, 'old@example.test');
  assert.equal(f.messages[0].to, 'new@example.test');
  assert.equal(f.state.pending.token_hash, digest(f.token()));
  assert.notEqual(f.state.pending.token_hash, f.token());
  await tokens.verify(before);
  await f.service.confirm({ token: f.token() });
  assert.equal(f.state.user.email, 'new@example.test');
  assert.ok(f.state.user.email_verified_at);
  assert.equal(f.state.resets, 0);
  assert.equal(f.state.pending, null);
  await assert.rejects(tokens.verify(before), /Revoked/);
  await assert.rejects(f.service.confirm({ token: f.token() }), { status: 400, code: 'invalid_email_token' });
});

test('email request rejects wrong password and occupied target without issuing a link', async () => {
  const f = fixture();
  await assert.rejects(f.service.request(f.state.user.id, { email: 'new@example.test', currentPassword: 'Senha incorreta' }), { status: 400, code: 'invalid_password' });
  f.state.occupied = true;
  await assert.rejects(f.service.request(f.state.user.id, { email: 'new@example.test', currentPassword: password }), { status: 409, code: 'email_in_use' });
  assert.equal(f.messages.length, 0);
  assert.equal(f.state.user.email, 'old@example.test');
});

test('expired, superseded or credential-invalidated email links cannot confirm', async () => {
  const f = fixture();
  await f.service.request(f.state.user.id, { email: 'first@example.test', currentPassword: password });
  const first = f.token();
  await f.service.request(f.state.user.id, { email: 'second@example.test', currentPassword: password });
  await assert.rejects(f.service.confirm({ token: first }), { status: 400 });
  f.state.now += 31*60*1000;
  await assert.rejects(f.service.confirm({ token: f.token() }), { status: 400 });
  await f.service.request(f.state.user.id, { email: 'third@example.test', currentPassword: password });
  f.state.user.credentials_version++;
  await assert.rejects(f.service.confirm({ token: f.token() }), { status: 400 });
  assert.equal(f.state.user.email, 'old@example.test');
});

test('concurrent occupation of target rolls back confirmation without changing credentials', async () => {
  const f = fixture();
  await f.service.request(f.state.user.id, { email: 'new@example.test', currentPassword: password });
  f.state.occupied = true;
  await assert.rejects(f.service.confirm({ token: f.token() }), { status: 409, code: 'email_in_use' });
  assert.equal(f.state.user.email, 'old@example.test');
  assert.equal(f.state.user.credentials_version, 0);
  assert.equal(f.state.resets, 1);
});

test('HTTP email endpoints require auth for request, expose no token and accept public confirmation', async t => {
  const f = fixture(), tokens = { async verify(token) { if (token !== 'valid-test') throw new Error('invalid'); return { sub: f.state.user.id }; } };
  const server = createApp(f.pool, { service: {}, tokens, mailOutbox: f.mailOutbox }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = headers => fetch(base + '/users/me/email', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ email: 'new@example.test', currentPassword: password }) });
  assert.equal((await request()).status, 401);
  const pending = await request({ authorization: 'Bearer valid-test' });
  assert.equal(pending.status, 202);
  assert.equal(pending.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(await pending.json()), ['message']);
  const confirm = await fetch(base + '/auth/email/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: f.token() }) });
  assert.equal(confirm.status, 204);
  assert.equal(f.state.user.email, 'new@example.test');
});
