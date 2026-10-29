import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, options);
  return ['scrypt', options.N, options.r, options.p, salt, hash.toString('hex')].join('$');
}

export async function verifyPassword(password, encoded) {
  const [algorithm, n, r, p, salt, hex, extra] = encoded.split('$');
  if (extra || algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '3'
      || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hex || '')) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = await scrypt(password, salt, expected.length, options);
  return timingSafeEqual(actual, expected);
}

