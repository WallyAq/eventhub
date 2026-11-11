// Administrative, explicit legacy classification before migration 007. Never
// chooses/removes a membership, creates an account, or runs at application startup.
import { readFile } from 'node:fs/promises';
import { createPool } from './pool.js';

const file = process.argv[2];
if (!file) throw new Error('Usage: node src/database/resolve-legacy-profiles.js /path/reviewed-plan.json');
const plan = JSON.parse(await readFile(file, 'utf8'));
if (!Array.isArray(plan) || !plan.length || plan.some(x => !x || Object.keys(x).sort().join(',') !== 'organizationId,reason,userId'
  || !/^[a-f0-9-]{36}$/i.test(x.userId) || !/^[a-f0-9-]{36}$/i.test(x.organizationId)
  || typeof x.reason !== 'string' || x.reason.trim().length < 10)
  || new Set(plan.map(x => x.userId)).size !== plan.length) throw new Error('Invalid explicit resolution plan');
const pool = createPool();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(41001)');
  if ((await client.query("SELECT 1 FROM schema_migrations WHERE name='007_exclusive_profiles_and_institution.sql'")).rowCount)
    throw new Error('Legacy classification is only available before migration 007');
  await client.query('LOCK TABLE users,organization_members IN SHARE ROW EXCLUSIVE MODE');
  for (const item of plan) {
    const { rows } = await client.query(`SELECT u.role,array_agg(m.organization_id) AS ids FROM users u
      JOIN organization_members m ON m.user_id=u.id WHERE u.id=$1 GROUP BY u.role`, [item.userId]);
    if (rows.length !== 1 || rows[0].role !== 'PARTICIPANT' || rows[0].ids.length !== 1 || rows[0].ids[0] !== item.organizationId)
      throw new Error('Plan does not match an unambiguous existing administrative link: ' + item.userId);
  }
  await client.query(`CREATE TABLE IF NOT EXISTS legacy_profile_resolutions (
    user_id uuid PRIMARY KEY REFERENCES users(id),organization_id uuid NOT NULL REFERENCES organizations(id),
    previous_role text NOT NULL,new_role text NOT NULL,reason text NOT NULL,resolved_at timestamptz NOT NULL DEFAULT now())`);
  await client.query('ALTER TABLE users DROP CONSTRAINT users_role_check');
  await client.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('PARTICIPANT','ORGANIZER'))");
  for (const item of plan) {
    await client.query("INSERT INTO legacy_profile_resolutions(user_id,organization_id,previous_role,new_role,reason) VALUES($1,$2,'PARTICIPANT','ORGANIZER',$3)", [item.userId,item.organizationId,item.reason.trim()]);
    await client.query("UPDATE users SET role='ORGANIZER',credentials_version=credentials_version+1,updated_at=now() WHERE id=$1", [item.userId]);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ classified: plan.length, dataRemoved: false }));
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
