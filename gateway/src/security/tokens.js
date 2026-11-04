import { importSPKI, jwtVerify } from 'jose';

export async function createVerifier(publicBase64) {
  if (!publicBase64) throw new Error('JWT_PUBLIC_KEY_BASE64 is required');
  const key = await importSPKI(Buffer.from(publicBase64, 'base64').toString(), 'RS256');
  return async (token) => {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['RS256'], issuer: 'eventhub-identity', audience: 'eventhub-api',
      requiredClaims: ['sub', 'exp', 'iat', 'role'], maxTokenAge: '1h',
    });
    if (!/^[a-f0-9-]{36}$/i.test(payload.sub) || payload.role !== 'PARTICIPANT') throw new Error('Invalid claims');
    return payload;
  };
}

