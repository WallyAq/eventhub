import { Router } from 'express';

export function createBusinessRouter(services, verify, request = fetch) {
  const router = Router();
  async function forward(req, res) { return proxy(req, res); }
  async function proxy(req, res, target) {
    res.set('Cache-Control', 'no-store');
    const name = target?.service || (req.path.startsWith('/events') ? 'events' : req.path.startsWith('/registrations') ? 'registrations' : 'payments');
    if (!(req.method === 'GET' && (name === 'events' || target?.public))) {
      try { await verify((req.get('authorization') || '').replace(/^Bearer /, '')); }
      catch { return res.status(401).json({ message: 'Faça login para continuar.', error: 'invalid_token', requestId: req.requestId }); }
    }
    try {
      const headers = { 'content-type': 'application/json', 'x-request-id': req.requestId };
      for (const key of ['authorization', 'idempotency-key']) if (req.get(key)) headers[key] = req.get(key);
      const result = await request(services[name] + (target?.path || req.originalUrl), {
        method: req.method, headers, body: ['POST','PUT','PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      res.status(result.status).json(await result.json());
    } catch { res.status(503).json({ error: 'dependency_unavailable', message: 'Serviço indisponível. Tente novamente com a mesma operação.', requestId: req.requestId }); }
  }
  // Internal callbacks are deliberately not exposed by the gateway.
  router.get('/events', forward);
  router.get('/events/:id/availability', (req, res) => proxy(req, res, {
    service: 'registrations', path: '/availability/events/' + encodeURIComponent(req.params.id), public: true,
  }));
  router.get('/events/:id', forward);
  router.post('/events', forward);
  router.put('/events/:id', forward);
  router.post('/events/:id/publish', forward);
  router.post('/events/:id/cancel', forward);
  router.get('/registrations', forward);
  router.post('/registrations', forward);
  router.get('/registrations/:id', forward);
  router.post('/registrations/:id/cancel', forward);
  router.get('/payments/:id', forward);
  router.post('/payments/:id', forward);
  return router;
}
