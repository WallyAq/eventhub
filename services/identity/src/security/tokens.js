import { importPKCS8, importSPKI, SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

export async function createTokens(privateBase64, publicBase64, sessions) {
  if (!privateBase64 || !publicBase64) throw new Error('JWT keys are required');
  const privateKey = await importPKCS8(Buffer.from(privateBase64, 'base64').toString(), 'RS256');
  const publicKey = await importSPKI(Buffer.from(publicBase64, 'base64').toString(), 'RS256');
  return {
    expiresIn: 3600,
    async issue(user) {
      return new SignJWT({ role: user.role, sv: user.credentialsVersion ?? 0 })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer('eventhub-identity').setAudience('eventhub-api')
        .setSubject(user.id).setJti(randomUUID()).setIssuedAt().setExpirationTime('1h').sign(privateKey);
    },
    async verify(token) {
      const { payload } = await jwtVerify(token, publicKey, {
        algorithms: ['RS256'], issuer: 'eventhub-identity', audience: 'eventhub-api',
        requiredClaims: ['sub', 'exp', 'iat', 'role'], maxTokenAge: '1h',
      });
      if (!/^[a-f0-9-]{36}$/i.test(payload.sub) || payload.role !== 'PARTICIPANT') throw new Error('Invalid claims');
      if (payload.sv !== undefined && (!Number.isSafeInteger(payload.sv) || payload.sv < 0)) throw new Error('Invalid session version');
      if (sessions) {
        let valid;
        try { valid = await sessions.isValid(token, payload); }
        catch (cause) { throw Object.assign(new Error('Session store unavailable', { cause }), { code: 'session_store_unavailable' }); }
        if (!valid) throw new Error('Revoked session');
      }
      return payload;
    },
    async revoke(token, claims) {
      if (!sessions) throw new Error('Session store is required for logout');
      await sessions.revoke(token, claims);
    },
  };
}

