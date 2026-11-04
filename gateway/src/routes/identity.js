import { Router } from 'express';

export function createIdentityRouter(url, verify, request = fetch) {
  const router = Router();
  const authenticate = async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '');
    try {
      if (!match) throw new Error('Missing token');
      req.identity = await verify(match[1]);
      next();
    } catch {
      res.status(401).set('Cache-Control', 'no-store').json({
        error: 'invalid_token', message: 'Faça login para continuar.', requestId: req.requestId,
      });
    }
  };
  const forward = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const headers = { 'content-type': 'application/json', 'x-request-id': req.requestId, 'x-forwarded-for': req.ip };
      if (req.get('authorization')) headers.authorization = req.get('authorization');
      const upstream = await request(url + req.path, {
        method: req.method, headers,
        body: ['POST', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      const body = await upstream.json();
      for (const header of ['retry-after']) if (upstream.headers.get(header)) res.set(header, upstream.headers.get(header));
      res.status(upstream.status).json(body);
    } catch {
      res.status(503).json({ error: 'identity_unavailable', message: 'Serviço de identidade indisponível. Tente novamente.', requestId: req.requestId });
    }
  };
  router.post('/auth/register', forward);
  router.post('/auth/login', forward);
  router.post('/auth/password/forgot', forward);
  router.post('/auth/password/reset', forward);
  router.get('/users/me', authenticate, forward);
  router.patch('/users/me', authenticate, forward);
  router.post('/users/me/password', authenticate, forward);
  router.get('/organizations', authenticate, forward);
  router.post('/organizations', authenticate, forward);
  router.get('/organizations/:id', authenticate, forward);
  router.patch('/organizations/:id', authenticate, forward);
  router.get('/organizations/:id/members', authenticate, forward);
  router.post('/organizations/:id/members', authenticate, forward);
  return router;
}

