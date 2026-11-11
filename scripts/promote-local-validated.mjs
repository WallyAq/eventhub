// Promote the exact QA images through the existing local Compose deployment.
// Never targets a remote context, regenerates credentials or removes volumes.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes('--backup-manifest') || !args.includes('--ui-evidence'))
  throw new Error('Usage: node scripts/promote-local-validated.mjs --backup-manifest <manifest.json> --ui-evidence <verification.json> [--apply-local]');
const backupPath = resolve(option('--backup-manifest')), uiPath = resolve(option('--ui-evidence'));
const backup = JSON.parse(await readFile(backupPath, 'utf8')), ui = JSON.parse(await readFile(uiPath, 'utf8'));
const results = (await readFile('tmp/rules-qa/integration-results.log', 'utf8')).replaceAll('\u0000', '');
if (!/pass\s+8/.test(results) || !/fail\s+0/.test(results)) throw new Error('Successful business API suite required');
if (backup.sourceProject !== 'eventhub' || backup.verificationProject !== 'eventhub-rules-qa' || backup.databases.length !== 9 || backup.databases.some(db => !db.restored))
  throw new Error('Nine restored local database backups required');
for (const db of backup.databases) {
  if (!/^[a-z_]+_db$/.test(db.database)) throw new Error('Unexpected backup database');
  const hash = createHash('sha256').update(await readFile(join(dirname(backupPath), db.database + '.dump'))).digest('hex');
  if (hash !== db.sha256) throw new Error('Backup checksum mismatch: ' + db.database);
}
if (ui.origin !== 'http://127.0.0.1:18080' || !Array.isArray(ui.checks) || ui.checks.length < 7 || ui.errors?.length !== 0)
  throw new Error('Successful live UI evidence from isolated QA required');
const docker = argv => execFileSync('docker', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000, maxBuffer: 8 * 1024 * 1024 }).trim();
const context = JSON.parse(docker(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']));
if (!context.startsWith('npipe://') && !context.startsWith('unix://')) throw new Error('Refuse remote Docker context');
execFileSync(process.execPath, ['scripts/audit-business-data.mjs', '--project', 'eventhub', '--env-file', '.env',
  '--output', 'tmp/rules-predeployment-data-audit.json'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
const audit = JSON.parse(await readFile('tmp/rules-predeployment-data-audit.json', 'utf8'));
if (audit.requiresDataDecision) throw new Error('Local data conflicts require reviewed decisions before deployment; see tmp/rules-predeployment-data-audit.json');
const services = ['identity', 'events', 'registrations', 'payments', 'payment-provider', 'attendance', 'certificates', 'notifications', 'reporting', 'gateway', 'frontend'];
const images = services.map(service => ({ service,
  previous: docker(['inspect', '--format', '{{.Image}}', `eventhub-${service}-1`]),
  validated: docker(['image', 'inspect', '--format', '{{.Id}}', `eventhub-rules-qa-${service}:latest`]),
}));
const evidence = { target: 'http://127.0.0.1:8080', composeProject: 'eventhub', backupPath, uiPath, dataAudit: { counts: audit.counts, conflictCounts: audit.conflictCounts }, images, status: 'prepared', preparedAt: new Date().toISOString() };
if (!args.includes('--apply-local')) { console.log(JSON.stringify(evidence, null, 2)); process.exit(0); }
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
for (const image of images) {
  image.rollbackTag = `eventhub-${image.service}:before-rules-${stamp}`;
  docker(['tag', image.previous, image.rollbackTag]);
  docker(['tag', image.validated, `eventhub-${image.service}:latest`]);
}
const evidencePath = 'tmp/rules-qa/local-deployment.json';
await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
// Release test resources before resuming the local stack on a limited machine.
docker(['compose', '-p', 'eventhub-rules-qa', '--env-file', 'tmp/rules-qa/.env', 'stop', '-t', '20']);
// Brief local maintenance window: prevent new browser writes during the coordinated migration.
docker(['compose', '-p', 'eventhub', '--env-file', '.env', 'stop', 'nginx']);
for (const group of [['postgres', 'rabbitmq'], ['identity'], ['events'], ['registrations', 'payments'],
  ['payment-provider', 'attendance', 'certificates', 'notifications', 'reporting'], ['gateway', 'frontend', 'nginx']]) {
  docker(['compose', '-p', 'eventhub', '--env-file', '.env', 'up', '-d', '--no-build', '--wait', '--wait-timeout', '120', ...group]);
  console.log(JSON.stringify({ updatedLocalServices: group }));
}
for (let attempt = 0; attempt < 30; attempt++) {
  const response = await fetch(evidence.target + '/api/status', { signal: AbortSignal.timeout(15000) });
  const status = await response.json();
  if (response.ok && status.status === 'ready') {
    evidence.status = 'updated_and_ready'; evidence.verifiedAt = new Date().toISOString(); evidence.readiness = status;
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ localUpdated: true, target: evidence.target, evidencePath }));
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
throw new Error('Local containers updated but complete readiness has not been verified; inspect deployment evidence and logs');
