import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 32 * 1024 * 1024 }).trim();
assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', 'eventhub-rules-qa-postgres-1']), 'eventhub-rules-qa');
const query = (database, sql) => JSON.parse(docker(['exec', 'eventhub-rules-qa-postgres-1', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
  '-U', 'eventhub_admin', '-d', database, '-c', `BEGIN READ ONLY; SELECT coalesce(json_agg(t),'[]'::json) FROM (${sql}) t; COMMIT;`]));
const [registration] = query('registration_db', `SELECT id,status,snapshot->>'correlationId' AS correlation_id FROM registrations WHERE status='CONFIRMED' AND price_cents>0 ORDER BY created_at DESC LIMIT 1`);
assert.ok(registration);
const [payment] = query('payment_db', `SELECT registration_id,status,correlation_id FROM payments WHERE registration_id='${registration.id}'`);
assert.equal(payment.status, 'APPROVED');
assert.equal(payment.correlation_id, registration.correlation_id);
const messages = query('registration_db', `SELECT id,payload->>'type' AS type,payload->>'correlationId' AS correlation_id,published_at IS NOT NULL AS published FROM outbox WHERE payload->>'registrationId'='${registration.id}'`);
assert.ok(messages.length >= 2);
assert.ok(messages.every(message => message.correlation_id === registration.correlation_id));
const raw = execFileSync(process.execPath, ['scripts/trace-registration.mjs', registration.id, '--since', '48h'], {
  env: { ...process.env, COMPOSE_PROJECT_NAME: 'eventhub-rules-qa', COMPOSE_ENV_FILES: 'tmp/rules-qa/.env' },
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 32 * 1024 * 1024,
});
const lines = raw.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
assert.equal(lines[0].correlationId, registration.correlation_id);
const logs = lines.slice(1).filter(line => line.correlationId === registration.correlation_id).map(line => Object.fromEntries(
  ['service', 'event', 'correlationId', 'registrationId', 'method', 'path', 'status', 'messageId', 'type'].filter(key => line[key] !== undefined).map(key => [key, line[key]])));
const services = [...new Set(logs.map(line => line.service))];
for (const service of ['registrations', 'payments', 'payment-provider-simulator']) assert.ok(services.includes(service), `Missing trace logs: ${service}`);
const result = { capturedAt: new Date().toISOString(), composeProject: 'eventhub-rules-qa', readOnly: true,
  registration, payment, messages, services, logs, status: 'passed' };
await writeFile('tmp/rules-qa/trace-evidence.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ status: 'passed', services, logEntries: logs.length, outboxMessages: messages.length, output: 'tmp/rules-qa/trace-evidence.json' }));
