import { execFileSync } from 'node:child_process';

const [registrationId, ...options] = process.argv.slice(2);
if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(registrationId || '')) throw Error('Informe o UUID da inscrição: node scripts/trace-registration.mjs UUID [--since 30m]');
const sinceIndex = options.indexOf('--since');
const since = sinceIndex < 0 ? '24h' : options[sinceIndex + 1];
if (!/^\d+[smh]$/.test(since || '')) throw Error('Use uma duração como 30m ou 24h.');
const docker = (...args) => execFileSync('docker', ['compose', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 30000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
// Local operator access; read only the Registration database through its own service.
const correlation = docker('exec', '-T', 'registrations', 'python', '-c', 'import sys;from app.domain import db\nwith db() as c:\n r=c.execute("SELECT snapshot FROM registrations WHERE id=%s",(sys.argv[1],)).fetchone()\n if not r: sys.exit("Inscrição não encontrada")\n print(r["snapshot"].get("correlationId",sys.argv[1]))', registrationId).trim();
if (!/^[a-zA-Z0-9-]{1,64}$/.test(correlation)) throw Error('Identificador de correlação inválido.');
console.log(JSON.stringify({ registrationId, correlationId: correlation, since }));
const logs = docker('logs', '--since', since, 'gateway', 'identity', 'events', 'registrations', 'payments', 'payment-provider', 'notifications', 'attendance', 'certificates', 'reporting');
let found = 0;
for (const line of logs.split(/\r?\n/)) {
  const start = line.indexOf('{');
  if (start < 0) continue;
  try { const entry = JSON.parse(line.slice(start)); if (entry.correlationId === correlation || entry.registrationId === registrationId) { console.log(JSON.stringify(entry)); found++; } } catch {}
}
if (!found) console.log('Nenhum registro disponível nesta janela. Os logs podem ter sido removidos ao recriar contêineres.');
