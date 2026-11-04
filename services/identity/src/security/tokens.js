import { importPKCS8, importSPKI, SignJWT, jwtVerify } from 'jose';

export async function createTokens(privateBase64, publicBase64) {
  if (!privateBase64 || !publicBase64) throw new Error('JWT keys are required');
  const privateKey = await importPKCS8(Buffer.from(privateBase64, 'base64').toString(), 'RS256');
  const publicKey = await importSPKI(Buffer.from(publicBase64, 'base64').toString(), 'RS256');
  return {
    expiresIn: 3600,
    async issue(user) {
      return new SignJWT({ role: user.role })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer('eventhub-identity').setAudience('eventhub-api')
        .setSubject(user.id).setIssuedAt().setExpirationTime('1h').sign(privateKey);
    },
    async verify(token) {
      const { payload } = await jwtVerify(token, publicKey, {
        algorithms: ['RS256'], issuer: 'eventhub-identity', audience: 'eventhub-api',
        requiredClaims: ['sub', 'exp', 'iat', 'role'], maxTokenAge: '1h',
      });
      if (!/^[a-f0-9-]{36}$/i.test(payload.sub) || payload.role !== 'PARTICIPANT') throw new Error('Invalid claims');
      return payload;
    },
  };
}

