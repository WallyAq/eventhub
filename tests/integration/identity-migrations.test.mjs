import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('identity migration can run again without duplicating its history or changing users', () => {
  const snapshot = () => JSON.parse(execFileSync('docker', [
    'compose', 'exec', '-T', 'identity', 'node', '--input-type=module', '-e',
    "import pg from 'pg'; const p=new pg.Pool(); const r=await p.query(\"SELECT (SELECT count(*)::int FROM schema_migrations WHERE name='001_users.sql') AS migrations, (SELECT count(*)::int FROM users) AS users\"); console.log(JSON.stringify(r.rows[0])); await p.end();",
  ], { encoding: 'utf8' }).trim());
  const before = snapshot();
  assert.equal(before.migrations, 1);
  for (let attempt = 0; attempt < 2; attempt++) {
    execFileSync('docker', ['compose', 'exec', '-T', 'identity', 'node', 'src/database/migrate.js'], { encoding: 'utf8' });
  }
  assert.deepEqual(snapshot(), before);
});
