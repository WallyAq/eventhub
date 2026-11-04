import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const path=new URL('../.env',import.meta.url);
const current=await readFile(path,'utf8');
if(!/^INTERNAL_API_KEY=.+$/m.test(current)) await appendFile(path,'\nINTERNAL_API_KEY='+randomBytes(32).toString('hex')+'\n');
console.log('Credencial interna configurada sem exibir seu valor.');
