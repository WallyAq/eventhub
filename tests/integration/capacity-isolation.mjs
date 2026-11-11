// Database regression tests run only in the fixed, isolated QA Compose project.
// Each case owns a disposable schema; no application tables or deployed env are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

const container = 'eventhub-rules-qa-postgres-1';
const psql = ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'eventhub_admin', '-d', 'registration_db'];
const sql = input => execFileSync('docker', [...psql, '-c', input], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const directory = new URL('../../services/registrations/app/migrations/', import.meta.url);
const activityId = '00000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000002';
const tables = `
  CREATE TABLE inventories(activity_id uuid PRIMARY KEY,event_id uuid NOT NULL,capacity int NOT NULL CHECK(capacity>0));
  CREATE TABLE registrations(id uuid PRIMARY KEY,activity_id uuid NOT NULL REFERENCES inventories(activity_id),user_id uuid NOT NULL,
    request_key varchar(100) NOT NULL,status text NOT NULL,price_cents int NOT NULL,expires_at timestamptz,snapshot jsonb NOT NULL);
  CREATE TABLE payment_notification_receipts(registration_id uuid PRIMARY KEY REFERENCES registrations(id),result text NOT NULL);
  CREATE TABLE outbox(id uuid PRIMARY KEY,payload jsonb NOT NULL,published_at timestamptz);
`;

function session() {
  const child = spawn('docker', psql, { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errors += data; });
  const ended = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve({ code, output, errors }));
  });
  return {
    send: command => child.stdin.write(command + '\n'),
    async marker(value) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (output.split(/\r?\n/).includes(value)) return;
        if (child.exitCode !== null) throw new Error(`SQL session exited before ${value}: ${errors}`);
        await delay(50);
      }
      throw new Error(`SQL session did not reach ${value}: ${errors}`);
    },
    finish: async () => { child.stdin.end('\\q\n'); return ended; },
    async stop() {
      if (child.exitCode !== null) return;
      if (!child.stdin.destroyed) child.stdin.end('ROLLBACK;\n\\q\n');
      await Promise.race([ended, delay(1000)]);
      if (child.exitCode === null) child.kill();
    },
  };
}

async function exercise(isolation, migrations) {
  const suffix = randomUUID().replaceAll('-', '');
  const schema = 'qa_capacity_' + suffix;
  const waiterName = 'qa_capacity_waiter_' + suffix;
  const first = session(), second = session();
  try {
    sql(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}; ${tables}
      ${migrations.join('\n')}
      INSERT INTO inventories(activity_id,event_id,capacity) VALUES('${activityId}','${eventId}',1);`);
    const begin = `SET search_path TO ${schema}; SET statement_timeout='15s'; SET idle_in_transaction_session_timeout='20s'; BEGIN ISOLATION LEVEL ${isolation};
      SELECT count(*) FROM registrations; SELECT 'snapshot_ready';`;
    first.send(begin);
    second.send(`SET application_name='${waiterName}'; ${begin}`);
    await Promise.all([first.marker('snapshot_ready'), second.marker('snapshot_ready')]);
    const insert = () => `INSERT INTO registrations(id,activity_id,user_id,request_key,status,price_cents,snapshot)
      VALUES('${randomUUID()}','${activityId}','${randomUUID()}','${randomUUID()}','CONFIRMED',0,
        '{"eventId":"${eventId}","activity":{"id":"${activityId}"}}');`;
    first.send(insert() + " SELECT 'first_inserted';");
    await first.marker('first_inserted');
    second.send(insert() + ' COMMIT;');
    let blocked = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${waiterName}' AND wait_event_type='Lock';`) === '1') {
        blocked = true; break;
      }
      await delay(50);
    }
    assert.ok(blocked, 'second direct write must wait on the inventory transaction');
    first.send('COMMIT;');
    const [winner, contender] = await Promise.all([first.finish(), second.finish()]);
    assert.equal(winner.code, 0, winner.errors);
    const occupied = Number(sql(`SELECT count(*) FROM ${schema}.registrations WHERE status IN ('CONFIRMED','PENDING_PAYMENT');`));
    return { occupied, contender };
  } finally {
    await Promise.all([first.stop(), second.stop()]);
    sql(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
  }
}

test('capacity remains bounded for concurrent direct writes at every PostgreSQL isolation level', { timeout: 180000 }, async t => {
  const project = execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.docker.compose.project" }}', container],
    { encoding: 'utf8', timeout: 60000 }).trim();
  assert.equal(project, 'eventhub-rules-qa', 'refuse to run against a container outside the isolated QA project');
  const names = (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  const migrations = await Promise.all(names.map(name => readFile(new URL(name, directory), 'utf8')));
  assert.ok(names.some(name => name.startsWith('002_')), 'inventory write-conflict migration must be present');

  await t.test('historical migration 001 reproduces the repeatable-read anomaly', async () => {
    const result = await exercise('REPEATABLE READ', [migrations[0]]);
    assert.equal(result.contender.code, 0, result.contender.errors);
    assert.equal(result.occupied, 2, 'the fixture must reproduce the original anomaly for one seat');
  });

  for (const isolation of ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']) {
    await t.test(`all migrations reject overbooking under ${isolation}`, async () => {
      const result = await exercise(isolation, migrations);
      assert.equal(result.occupied, 1, `overbooking under ${isolation}`);
      assert.notEqual(result.contender.code, 0, 'second transaction must be rejected');
      assert.match(result.contender.errors, /activity capacity exceeded|capacity below occupied seats|could not serialize access/);
    });
  }
});
