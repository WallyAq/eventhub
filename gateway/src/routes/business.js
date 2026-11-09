import { Router } from 'express';

export function createBusinessRouter(services, verify, request = fetch) {
  const router = Router();
  async function forward(req, res) { return proxy(req, res); }
  async function proxy(req, res, target) {
    res.set('Cache-Control', 'no-store');
    const name = target?.service || (req.path.startsWith('/events') ? 'events' : req.path.startsWith('/registrations') ? 'registrations' : 'payments');
    if (!(req.method === 'GET' && (name === 'events' || target?.public))) {
      try { await verify((req.get('authorization') || '').replace(/^Bearer /, ''), { requestId: req.requestId, correlationId: req.correlationId }); }
      catch (error) { return res.status(error?.status === 503 ? 503 : 401).json({ message: error?.status === 503 ? 'Serviço de identidade indisponível. Tente novamente.' : 'Faça login para continuar.', error: error?.status === 503 ? 'identity_unavailable' : 'invalid_token', requestId: req.requestId }); }
    }
    try {
      const headers = { 'content-type': 'application/json', 'x-request-id': req.requestId, 'x-correlation-id': req.correlationId };
      for (const key of ['authorization', 'idempotency-key']) if (req.get(key)) headers[key] = req.get(key);
      const result = await request(services[name] + (target?.path || req.originalUrl), {
        method: req.method, headers, body: ['POST','PUT','PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      const contentType = result.headers.get('content-type') || '';
      const canonicalCorrelation = result.headers.get('x-correlation-id') || '';
      if (/^[a-zA-Z0-9-]{1,64}$/.test(canonicalCorrelation)) {
        req.correlationId = canonicalCorrelation;
        res.set('x-correlation-id', canonicalCorrelation);
      }
      if (target?.download && result.ok && /^(application\/pdf|text\/csv)(;|$)/i.test(contentType)) {
        res.set('Content-Type', contentType);
        const attachment = result.headers.get('content-disposition');
        if (attachment) res.set('Content-Disposition', attachment);
        return res.status(result.status).send(Buffer.from(await result.arrayBuffer()));
      }
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
  router.patch('/events/:id/public-information', forward);
  router.post('/events/:id/publish', forward);
  router.post('/events/:id/cancel', forward);
  router.get('/registrations', forward);
  router.post('/registrations', forward);
  router.get('/registrations/:id', forward);
  router.post('/registrations/:id/cancel', forward);
  router.get('/payments/:id', forward);
  router.post('/payments/:id', forward);
  router.get('/organizer/events/:id/registrations', (req, res) => proxy(req, res, { service: 'registrations' }));
  router.get('/organizer/events/:id/registrations/export.csv', (req, res) => proxy(req, res, { service: 'registrations', download: true }));
  router.post('/organizer/registrations/:id/cancel', (req, res) => proxy(req, res, { service: 'registrations' }));
  router.post('/attendance/check-ins', (req, res) => proxy(req, res, { service: 'attendance' }));
  router.post('/attendance/credentials/resolve', (req, res) => proxy(req, res, { service: 'attendance' }));
  router.get('/attendance/registrations/:id', (req, res) => proxy(req, res, { service: 'attendance' }));
  router.get('/organizer/events/:id/attendance', (req, res) => proxy(req, res, { service: 'attendance' }));
  router.get('/certificates/verify/:code', (req, res) => proxy(req, res, { service: 'certificates', public: true }));
  router.post('/certificates', (req, res) => proxy(req, res, { service: 'certificates' }));
  router.get('/certificates', (req, res) => proxy(req, res, { service: 'certificates' }));
  router.get('/certificates/:id/download', (req, res) => proxy(req, res, { service: 'certificates', download: true }));
  router.get('/certificates/:id', (req, res) => proxy(req, res, { service: 'certificates' }));
  router.get('/organizer/events/:id/certificate-settings', (req, res) => proxy(req, res, { service: 'certificates' }));
  router.put('/organizer/events/:id/certificate-settings', (req, res) => proxy(req, res, { service: 'certificates' }));
  router.get('/organizer/events/:id/certificate-preview', (req, res) => proxy(req, res, { service: 'certificates', download: true }));
  router.get('/organizer/events/:id/speaker-certificates', (req, res) => proxy(req, res, { service: 'certificates' }));
  router.post('/organizer/events/:id/speaker-certificates', (req, res) => proxy(req, res, { service: 'certificates' }));
  router.get('/speaker-certificates/:id/download', (req, res) => proxy(req, res, { service: 'certificates', download: true }));
  router.get('/reports/events/:id', (req, res) => proxy(req, res, { service: 'reporting' }));
  router.get('/reports/events/:id/export.csv', (req, res) => proxy(req, res, { service: 'reporting', download: true }));
  return router;
}
