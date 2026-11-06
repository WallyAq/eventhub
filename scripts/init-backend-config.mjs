import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const path = new URL('../.env', import.meta.url);
let current = await readFile(path, 'utf8');
for (const name of ['POSTGRES_PASSWORD', 'IDENTITY_DB_PASSWORD', 'EVENT_DB_PASSWORD', 'REGISTRATION_DB_PASSWORD', 'PAYMENT_DB_PASSWORD',
  'NOTIFICATION_DB_PASSWORD', 'ATTENDANCE_DB_PASSWORD', 'CERTIFICATE_DB_PASSWORD', 'REPORTING_DB_PASSWORD', 'PROVIDER_DB_PASSWORD',
  'RABBITMQ_PASSWORD', 'PAYMENT_PROVIDER_API_KEY']) {
  if (new RegExp('^' + name + '=.+$', 'm').test(current)) continue;
  const line = name + '=' + randomBytes(32).toString('hex'), pattern = new RegExp('^' + name + '=.*$', 'm');
  current = pattern.test(current) ? current.replace(pattern, line) : current.trimEnd() + '\n' + line + '\n';
}
await writeFile(path, current, { mode: 0o600 });
console.log('Configuração dos novos bancos preparada sem exibir credenciais.');
