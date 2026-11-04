export function createSessionVerifier(verifyToken, identityUrl, internalKey, request = fetch) {
  if (!identityUrl || !internalKey) throw new Error('Identity session verification configuration is required');
  return async (token, context = {}) => {
    const claims = await verifyToken(token);
    try {
      const response = await request(identityUrl + '/internal/auth/verify', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': internalKey, ...(context.requestId ? { 'x-request-id': context.requestId } : {}) },
        body: JSON.stringify({ token }), signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      if (response.status === 401) throw Object.assign(new Error('Invalid session'), { status: 401 });
      if (!response.ok) throw new Error('Identity unavailable');
      const data = await response.json();
      if (data.identity?.sub !== claims.sub || data.identity?.role !== claims.role)
        throw new Error('Invalid identity response');
      return claims;
    } catch (error) {
      if (error?.status === 401) throw error;
      throw Object.assign(new Error('Identity unavailable'), { status: 503 });
    }
  };
}
