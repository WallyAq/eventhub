import { Router } from 'express';

export function createHealthRouter(services, request = fetch) {
  const router = Router();
  router.get('/health', (_req, res) => res.json({ service: 'gateway', status: 'ok' }));
  router.get('/status', async (req, res) => {
    const results = await Promise.all(Object.entries(services).map(async ([name, url]) => {
      try {
        const response = await request(url + '/ready', {
          signal: AbortSignal.timeout(3000), headers: { 'x-request-id': req.requestId, 'x-correlation-id': req.correlationId },
        });
        const body = await response.json();
        return { name, status: response.ok && body.status === 'ready' ? 'ready' : 'unavailable' };
      } catch {
        return { name, status: 'unavailable' };
      }
    }));
    const ready = results.every(item => item.status === 'ready');
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', services: results });
  });
  return router;
}

