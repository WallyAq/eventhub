// Creates an independent environment; never reads or changes the deployed .env.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = new URL('../tmp/rules-qa/', import.meta.url);
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const values = { HTTP_PORT: '18080', PUBLIC_APP_URL: 'http://localhost:18080', RESERVATION_TTL_SECONDS: '120',
  RABBITMQ_USER: 'eventhub_qa', MAIL_MODE: 'mailbox', MAIL_FROM: 'EventHub QA <qa@eventhub.local>',
  JWT_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString('base64'), JWT_PUBLIC_KEY_BASE64: Buffer.from(publicKey).toString('base64') };
for (const name of ['POSTGRES_PASSWORD', 'IDENTITY_DB_PASSWORD', 'EVENT_DB_PASSWORD', 'REGISTRATION_DB_PASSWORD',
  'PAYMENT_DB_PASSWORD', 'NOTIFICATION_DB_PASSWORD', 'ATTENDANCE_DB_PASSWORD', 'CERTIFICATE_DB_PASSWORD',
  'REPORTING_DB_PASSWORD', 'PROVIDER_DB_PASSWORD', 'RABBITMQ_PASSWORD', 'INTERNAL_API_KEY', 'PAYMENT_PROVIDER_API_KEY'])
  values[name] = randomBytes(32).toString('hex');
await mkdir(directory, { recursive: true });
try {
  await writeFile(new URL('.env', directory), Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.log('QA configuration created in tmp/rules-qa/.env. Use compose project eventhub-rules-qa.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('QA configuration already exists; kept its credentials and volumes compatible.');
}
