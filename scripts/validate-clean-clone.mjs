import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

// Separate clone, secrets, Compose project, port and volumes. Never uses the live .env.
const root = fileURLToPath(new URL('..', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'eventhub-clean-clone-'));
const clone = join(directory, 'checkout');
const project = 'eventhub-rq08-' + randomBytes(5).toString('hex');
const report = { project, source: process.argv.includes('--working-tree') ? 'working-tree-snapshot' : 'HEAD', startedAt: new Date().toISOString(), steps: [], passed: false };
const template = await readFile(join(root, '.env.example'), 'utf8');
const keys = template.split(/\r?\n/).filter(line => /^[A-Z_][A-Z0-9_]*=/.test(line)).map(line => line.slice(0, line.indexOf('=')));
const environment = { ...process.env, COMPOSE_PROJECT_NAME: project };
for (const key of keys) delete environment[key];
delete environment.COMPOSE_FILE;
const git = (args, cwd = root, env = environment, input) => execFileSync('git', args, { cwd, env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }).trim();
await mkdir(join(root, 'tmp'), { recursive: true });
const logfile = join(root, 'tmp', 'rq08-clean-clone.log');
await writeFile(logfile, 'Clean clone installation validation\n');

async function run(command, args, cwd = clone) {
  console.log('Validando:', command === process.execPath ? 'node' : command, args.join(' '));
  const { appendFile } = await import('node:fs/promises');
  const child = spawn(command, args, { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let writes = Promise.resolve();
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { writes = writes.then(() => appendFile(logfile, chunk)); });
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Error('Command failed: ' + command + ' (see local validation log)'))); });
  await writes;
  report.steps.push([command === process.execPath ? 'node' : command, ...args].join(' '));
}

let composeCreated = false;
try {
  await run('docker', ['info', '--format', '{{.ServerVersion}}'], root);
  let revision = git(['rev-parse', 'HEAD']);
  if (report.source === 'working-tree-snapshot') {
    const gitEnv = { ...environment, GIT_INDEX_FILE: join(directory, 'candidate-index'), GIT_AUTHOR_NAME: 'EventHub local validation', GIT_AUTHOR_EMAIL: 'validation@example.test', GIT_COMMITTER_NAME: 'EventHub local validation', GIT_COMMITTER_EMAIL: 'validation@example.test' };
    git(['read-tree', 'HEAD'], root, gitEnv);
    git(['-c', 'core.safecrlf=false', 'add', '--update'], root, gitEnv);
    const untracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(path => path && !path.startsWith('tmp/') && !path.startsWith('output/'));
    if (untracked.length) git(['-c', 'core.safecrlf=false', 'add', '--pathspec-from-file=-', '--pathspec-file-nul'], root, gitEnv, untracked.join('\0') + '\0');
    const tree = git(['write-tree'], root, gitEnv);
    revision = git(['-c', 'commit.gpgSign=false', 'commit-tree', tree, '-p', revision, '-m', 'Temporary installation validation snapshot'], root, gitEnv);
  }
  git(['clone', '--no-hardlinks', '--no-checkout', root, clone]);
  git(['fetch', '--quiet', root, revision], clone);
  git(['checkout', '--quiet', '--detach', revision], clone);
  report.revision = revision;
  assert.equal(git(['ls-files', '.env'], clone), '');
  assert.equal(git(['ls-files', '--error-unmatch', '.env.example'], clone), '.env.example');
  const example = await readFile(join(clone, '.env.example'), 'utf8');
  for (const line of example.split(/\r?\n/)) if (/^(?:.*PASSWORD|.*PRIVATE_KEY_BASE64|.*PUBLIC_KEY_BASE64|.*API_KEY)=/.test(line)) assert.equal(line.slice(line.indexOf('=') + 1), '', 'Example must not contain generated secrets');
  const port = await new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
  await writeFile(join(clone, '.env'), example.replace(/^HTTP_PORT=.*$/m, 'HTTP_PORT=' + port).replace(/^PUBLIC_APP_URL=.*$/m, 'PUBLIC_APP_URL=http://127.0.0.1:' + port), { mode: 0o600 });
  environment.EVENTHUB_URL = 'http://127.0.0.1:' + port;
  for (const script of ['init-identity-keys', 'init-internal-key', 'init-backend-config']) await run(process.execPath, ['scripts/' + script + '.mjs']);
  const first = await readFile(join(clone, '.env'), 'utf8');
  for (const script of ['init-identity-keys', 'init-internal-key', 'init-backend-config']) await run(process.execPath, ['scripts/' + script + '.mjs']);
  assert.equal(await readFile(join(clone, '.env'), 'utf8'), first, 'Bootstrap must preserve generated configuration');
  await run('docker', ['compose', 'config', '--quiet']);
  await run('docker', ['compose', '--parallel', '1', 'build']);
  composeCreated = true;
  await run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '240', 'postgres', 'rabbitmq']);
  await run(process.execPath, ['scripts/provision-backend-databases.mjs']);
  await run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '240']);
  const status = await fetch(environment.EVENTHUB_URL + '/api/status', { signal: AbortSignal.timeout(20000) });
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.services.length, 8);
  assert.ok(body.services.every(service => service.status === 'ready'));
  report.services = body.services;
  await run(process.execPath, ['--test', 'tests/integration/observability.test.mjs']);
  report.passed = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  if (composeCreated) {
    assert.match(project, /^eventhub-rq08-[a-f0-9]{10}$/);
    // The explicit project contains only disposable resources made above.
    try { await run('docker', ['compose', '-p', project, 'down', '--volumes', '--remove-orphans']); }
    catch { report.cleanupFailed = true; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(join(root, 'tmp', 'rq08-clean-clone.json'), JSON.stringify(report, null, 2));
  if (!report.cleanupFailed) {
    const checked = await realpath(directory), allowed = resolve(tmpdir()) + sep + 'eventhub-clean-clone-';
    if (!checked.startsWith(allowed)) throw Error('Refusing unexpected temporary directory');
    await rm(checked, { recursive: true, force: true });
  }
  console.log(report.passed && !report.cleanupFailed ? 'Instalação em clone limpo validada; recursos de teste removidos.' : 'Validação não concluída. Consulte tmp/rq08-clean-clone.json e o log local.');
}
