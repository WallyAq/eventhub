// Read-only verification of the local deployment recorded by promote-local-validated.mjs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const deployment = JSON.parse(await readFile('tmp/rules-qa/local-deployment.json', 'utf8'));
assert.equal(deployment.target, 'http://127.0.0.1:8080');
assert.equal(deployment.composeProject, 'eventhub');
assert.equal(deployment.status, 'updated_and_ready');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).trim();
const context = JSON.parse(docker(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']));
assert.ok(context.startsWith('npipe://') || context.startsWith('unix://'), 'Local Docker context required');
const services = [...deployment.images.map(image => image.service), 'nginx', 'postgres', 'rabbitmq'];
const containers = JSON.parse(docker(['inspect', ...services.map(service => `eventhub-${service}-1`)]));
const containerChecks = containers.map(container => {
  const service = container.Config.Labels['com.docker.compose.service'];
  assert.equal(container.Config.Labels['com.docker.compose.project'], 'eventhub');
  assert.equal(container.State.Status, 'running', service);
  assert.equal(container.State.Health?.Status, 'healthy', service);
  const image = deployment.images.find(image => image.service === service);
  if (image) assert.equal(container.Image, image.validated, `${service}: expected the validated QA image`);
  return { service, image: container.Image, state: 'running', health: 'healthy' };
});
const httpChecks = [];
for (const [path, expected] of [
  ['/', 200], ['/acesso', 200], ['/participante/login', 200], ['/organizacao/login', 200],
  ['/api/events', 200], ['/api/users/me', 401], ['/api/registrations', 401],
  ['/api/organizations', 401], ['/api/events?managed=true', 401],
]) {
  const response = await fetch(deployment.target + path, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, expected, path);
  if (!path.startsWith('/api/')) assert.match(await response.text(), /<div id="root"><\/div>/);
  else await response.arrayBuffer();
  httpChecks.push({ path, status: response.status });
}
const readinessResponse = await fetch(deployment.target + '/api/status', { signal: AbortSignal.timeout(15000) });
assert.equal(readinessResponse.status, 200);
const readiness = await readinessResponse.json();
assert.equal(readiness.status, 'ready');

const migrationChecks = [];
for (const [database, table, directory, names, normalize] of [
  ['identity_db', 'schema_migrations', 'services/identity/src/database/migrations', ['007_exclusive_profiles_and_institution.sql'], true],
  ['event_db', 'event_schema_migrations', 'services/events/app/migrations', ['001_event_responsibility.sql'], true],
  ['registration_db', 'schema_migrations', 'services/registrations/app/migrations', ['001_registration_integrity.sql', '002_capacity_isolation.sql'], true],
  ['payment_db', 'payment_schema_migrations', 'services/payments/src/database/migrations', ['001_payment_integrity.sql'], false],
]) {
  const applied = JSON.parse(docker(['exec', 'eventhub-postgres-1', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-U', 'eventhub_admin', '-d', database, '-c',
    `BEGIN READ ONLY; SELECT coalesce(json_agg(m),'[]'::json) FROM (SELECT name,checksum FROM ${table}) m; COMMIT;`]));
  for (const name of names) {
    const source = await readFile(`${directory}/${name}`, 'utf8');
    const checksum = createHash('sha256').update(normalize ? source.replaceAll('\r\n', '\n') : source).digest('hex');
    assert.equal(applied.find(row => row.name === name)?.checksum, checksum, `${database}: ${name}`);
    migrationChecks.push({ database, name, checksum });
  }
}
execFileSync(process.execPath, ['scripts/audit-business-data.mjs', '--output', 'tmp/rules-postdeployment-data-audit.json'],
  { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
const audit = JSON.parse(await readFile('tmp/rules-postdeployment-data-audit.json', 'utf8'));
assert.equal(audit.requiresDataDecision, false);
assert.deepEqual(audit.counts, deployment.dataAudit.counts, 'Business record counts changed since the local maintenance preflight');
const result = { verifiedAt: new Date().toISOString(), target: deployment.target, readOnly: true,
  containerChecks, httpChecks, readiness, migrationChecks,
  dataAudit: { counts: audit.counts, conflictCounts: audit.conflictCounts }, status: 'passed' };
const output = 'tmp/rules-postdeployment-verification.json';
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ status: result.status, target: result.target, healthyContainers: containerChecks.length,
  matchingValidatedImages: deployment.images.length, httpChecks: httpChecks.length,
  matchingMigrations: migrationChecks.length, businessCounts: audit.counts, output }, null, 2));
