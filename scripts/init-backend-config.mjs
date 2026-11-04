import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const path = new URL('../.env', import.meta.url);
const current = await readFile(path, 'utf8');
const additions = [];
for (const name of ['ATTENDANCE_DB_PASSWORD', 'CERTIFICATE_DB_PASSWORD', 'REPORTING_DB_PASSWORD']) {
  if (!new RegExp('^' + name + '=.+$', 'm').test(current)) additions.push(name + '=' + randomBytes(32).toString('hex'));
}
if (additions.length) await appendFile(path, '\n' + additions.join('\n') + '\n');
console.log('Configuração dos novos bancos preparada sem exibir credenciais.');
