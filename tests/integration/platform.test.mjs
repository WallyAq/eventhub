import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = process.env.EVENTHUB_URL || 'http://127.0.0.1:8080';

test('Nginx serves React and gateway checks both Node and Python databases', async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /EventHub/);
  const response = await fetch(base + '/api/status');
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.status, 'ready');
  assert.deepEqual(body.services.map(item => item.name).sort(),
    ['attendance', 'certificates', 'events', 'identity', 'notifications', 'payments', 'registrations', 'reporting']);
  assert.ok(body.services.every(item => item.status === 'ready'));
  assert.match(response.headers.get('x-request-id'), /^[a-zA-Z0-9-]{1,64}$/);
});

test('gateway health and missing routes have distinct responses', async () => {
  assert.equal((await fetch(base + '/api/health')).status, 200);
  assert.equal((await fetch(base + '/api/missing')).status, 404);
});

test('each service database permits only its own application role', () => {
  const result = execFileSync('docker', ['compose', 'exec', '-T', 'postgres',
    'psql', '-U', 'eventhub_admin', '-d', 'postgres', '-At', '-c',
    `SELECT r.rolname, d.datname, has_database_privilege(r.oid, d.oid, 'CONNECT')
     FROM pg_roles r CROSS JOIN pg_database d
     WHERE r.rolname IN ('identity_user','event_user','registration_user','payment_user','notification_user','attendance_user','certificate_user','reporting_user')
       AND d.datname IN ('identity_db','event_db','registration_db','payment_db','notification_db','attendance_db','certificate_db','reporting_db')
     ORDER BY r.rolname, d.datname`], { encoding: 'utf8' });
  const rows = result.trim().split(/\r?\n/);
  assert.equal(rows.length, 64);
  for (const row of rows) {
    const [role, db, allowed] = row.split('|');
    assert.equal(allowed, role.replace('_user', '_db') === db ? 't' : 'f', row);
  }
});

