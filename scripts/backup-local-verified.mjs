// Local deployment backup, with full restoration into independent QA databases.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const source = ['compose', '-p', 'eventhub', '--env-file', '.env', 'exec', '-T', 'postgres'];
const target = ['compose', '-p', 'eventhub-rules-qa', '--env-file', 'tmp/rules-qa/.env', 'exec', '-T', 'postgres'];
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
const path = `tmp/rules-backups/${stamp}`;
const docker = (args, input) => execFileSync('docker', args, { input, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 });
const databases = ['identity_db', 'event_db', 'registration_db', 'payment_db', 'notification_db', 'attendance_db', 'certificate_db', 'reporting_db', 'provider_db'];
await mkdir(path, { recursive: true });
const manifest = { createdAt: new Date().toISOString(), sourceProject: 'eventhub', verificationProject: 'eventhub-rules-qa', databases: [] };
const globals = docker([...source, 'pg_dumpall', '-U', 'eventhub_admin', '--globals-only']);
await writeFile(`${path}/globals.sql`, globals, { mode: 0o600 });
manifest.globalsSha256 = createHash('sha256').update(globals).digest('hex');
for (const [index, database] of databases.entries()) {
  const dump = docker([...source, 'pg_dump', '-U', 'eventhub_admin', '-Fc', database]);
  await writeFile(`${path}/${database}.dump`, dump, { mode: 0o600 });
  const clone = `rules_backup_verify_${stamp}_${index}`;
  if (!/^rules_backup_verify_[0-9]+_[0-9]+$/.test(clone)) throw new Error('Invalid clone name');
  docker([...target, 'createdb', '-U', 'eventhub_admin', clone]);
  try {
    docker([...target, 'pg_restore', '-U', 'eventhub_admin', '--exit-on-error', '--no-owner', '--no-acl', '-d', clone], dump);
    const tableCount = Number(docker([...target, 'psql', '-X', '-qAt', '-U', 'eventhub_admin', '-d', clone, '-c',
      "SELECT count(*) FROM pg_tables WHERE schemaname='public'"]).toString().trim());
    manifest.databases.push({ database, bytes: dump.length, sha256: createHash('sha256').update(dump).digest('hex'), restored: true, tableCount });
    console.log(JSON.stringify({ database, restored: true, tableCount }));
  } finally {
    // Only the newly created verification database in QA is removed.
    docker([...target, 'dropdb', '-U', 'eventhub_admin', clone]);
  }
}
await writeFile(`${path}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ path, verified: manifest.databases.length === databases.length }));
