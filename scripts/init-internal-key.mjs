import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const path=new URL('../.env',import.meta.url);
const current=await readFile(path,'utf8');
if(!/^INTERNAL_API_KEY=.+$/m.test(current)) {
  const line='INTERNAL_API_KEY='+randomBytes(32).toString('hex');
  await writeFile(path,/^INTERNAL_API_KEY=.*$/m.test(current)?current.replace(/^INTERNAL_API_KEY=.*$/m,line):current.trimEnd()+'\n'+line+'\n',{mode:0o600});
}
console.log('Credencial interna configurada sem exibir seu valor.');
