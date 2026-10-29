import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../.env', import.meta.url));
let text;
try { text = await readFile(path, 'utf8'); }
catch { throw new Error('Crie .env a partir de .env.example antes de gerar as chaves.'); }
const privateValue = text.match(/^JWT_PRIVATE_KEY_BASE64=(.*)$/m)?.[1].trim();
const publicValue = text.match(/^JWT_PUBLIC_KEY_BASE64=(.*)$/m)?.[1].trim();
if (privateValue || publicValue) {
  if (!privateValue || !publicValue) throw new Error('Par de chaves incompleto no .env; corrija sem sobrescrever chaves existentes.');
  const derived = createPublicKey(Buffer.from(privateValue, 'base64')).export({ type: 'spki', format: 'pem' });
  if (derived.toString() !== Buffer.from(publicValue, 'base64').toString()) throw new Error('As chaves existentes não formam um par.');
  console.log('Chaves existentes preservadas.');
} else {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  for (const [name, value] of Object.entries({
    JWT_PRIVATE_KEY_BASE64: Buffer.from(keys.privateKey).toString('base64'),
    JWT_PUBLIC_KEY_BASE64: Buffer.from(keys.publicKey).toString('base64'),
  })) {
    const line = name + '=' + value;
    const expression = new RegExp('^' + name + '=.*$', 'm');
    text = expression.test(text) ? text.replace(expression, line) : text.trimEnd() + '\n' + line + '\n';
  }
  await writeFile(path, text, { mode: 0o600 });
  console.log('Par RSA local gerado no .env. Nenhuma chave foi exibida.');
}

