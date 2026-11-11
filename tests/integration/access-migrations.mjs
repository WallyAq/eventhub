import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const container = 'eventhub-rules-qa-postgres-1';
function sql(database, text) {
  return execFileSync('docker', ['exec', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'eventhub_admin', '-d', database, '-c', text],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).trim();
}
const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');
async function fixture(database, setup, body) {
  const schema = 'qa_access_' + randomUUID().replaceAll('-', '');
  try {
    sql(database, `CREATE SCHEMA ${schema}; SET search_path TO ${schema}; ${setup}`);
    await body(query => sql(database, `SET search_path TO ${schema}; ${query}`));
  } finally { sql(database, `DROP SCHEMA IF EXISTS ${schema} CASCADE;`); }
}

test('access migrations preserve ambiguous legacy data and enforce account cardinality', { timeout: 240000 }, async t => {
  const project = execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.docker.compose.project" }}', container], { encoding: 'utf8', timeout: 60000 }).trim();
  assert.equal(project, 'eventhub-rules-qa');
  const base = await read('services/identity/src/database/migrations/001_users.sql') + await read('services/identity/src/database/migrations/002_organizations.sql');
  const migration = await read('services/identity/src/database/migrations/007_exclusive_profiles_and_institution.sql');
  const userId = randomUUID(), organizationId = randomUUID();
  await t.test('ambiguous participant plus administrative link blocks activation without changing history', async () => {
    await fixture('identity_db', base + `INSERT INTO users(id,name,email,password_hash) VALUES('${userId}','Legado QA','legacy@example.test','unused');
      INSERT INTO organizations(id,name) VALUES('${organizationId}','Legado QA');
      INSERT INTO organization_members(organization_id,user_id,role) VALUES('${organizationId}','${userId}','OWNER');`, async query => {
      assert.throws(() => query(`BEGIN; ${migration} COMMIT;`), /Profile\/institution preflight failed/);
      assert.equal(query(`SELECT role||':'||(SELECT count(*) FROM organization_members WHERE user_id=users.id)::text FROM users WHERE id='${userId}';`), 'PARTICIPANT:1');
      assert.equal(query("SELECT count(*) FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND conname='organizer_one_institution';"), '0');
    });
  });
  await t.test('exclusive role, exactly one institution and several organizers per institution hold at commit', async () => {
    await fixture('identity_db', base + migration, async query => {
      const first = randomUUID(), second = randomUUID(), participant = randomUUID(), otherInstitution = randomUUID();
      query(`BEGIN; INSERT INTO organizations(id,name) VALUES('${organizationId}','Instituição QA'),('${otherInstitution}','Outra QA');
        INSERT INTO users(id,name,email,password_hash,role) VALUES('${first}','Primeiro QA','first@example.test','unused','ORGANIZER'),('${second}','Segundo QA','second@example.test','unused','ORGANIZER');
        INSERT INTO organization_members(organization_id,user_id,role) VALUES('${organizationId}','${first}','OWNER'),('${organizationId}','${second}','ORGANIZER'); COMMIT;`);
      assert.equal(query(`SELECT count(*) FROM organization_members WHERE organization_id='${organizationId}';`), '2');
      assert.throws(() => query(`INSERT INTO users(id,name,email,password_hash,role) VALUES(gen_random_uuid(),'Sem vínculo','missing@example.test','unused','ORGANIZER');`));
      query(`INSERT INTO users(id,name,email,password_hash) VALUES('${participant}','Participante QA','participant@example.test','unused');`);
      assert.throws(() => query(`INSERT INTO organization_members(organization_id,user_id,role) VALUES('${organizationId}','${participant}','ORGANIZER');`));
      assert.throws(() => query(`INSERT INTO organization_members(organization_id,user_id,role) VALUES('${otherInstitution}','${second}','ORGANIZER');`));
      assert.throws(() => query(`DELETE FROM organization_members WHERE user_id='${second}';`));
      assert.throws(() => query(`UPDATE users SET role='PARTICIPANT' WHERE id='${second}';`));
    });
  });
  await t.test('legacy event without responsible organizer is diagnosed without assigning or deleting it', async () => {
    const eventId = randomUUID(), eventMigration = await read('services/events/app/migrations/001_event_responsibility.sql');
    await fixture('event_db', `CREATE TABLE events(id uuid PRIMARY KEY,organization_id uuid NOT NULL,status text NOT NULL,payload jsonb NOT NULL);
      INSERT INTO events VALUES('${eventId}','${organizationId}','DRAFT','{"id":"${eventId}","organizationId":"${organizationId}","status":"DRAFT","title":"Preservar QA"}');`, async query => {
      assert.throws(() => query(`BEGIN; ${eventMigration} COMMIT;`), /Event responsibility preflight failed/);
      assert.equal(query(`SELECT payload->>'title' FROM events WHERE id='${eventId}';`), 'Preservar QA');
      assert.equal(query("SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='events' AND column_name='owner_user_id';"), '0');
    });
  });
});
