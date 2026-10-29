import express from 'express';
import { randomUUID } from 'node:crypto';

export function createApp(services, request = fetch) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const incoming = req.get('x-request-id');
    req.requestId = incoming && /^[a-zA-Z0-9-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    res.set('x-request-id', req.requestId);
    const start = Date.now();
    res.on('finish', () => console.log(JSON.stringify({
      service: 'gateway', requestId: req.requestId, method: req.method,
      path: req.path, status: res.statusCode, durationMs: Date.now() - start,
    })));
    next();
  });
  app.get('/health', (_req, res) => res.json({ service: 'gateway', status: 'ok' }));
  app.get('/status', async (req, res) => {
    const results = await Promise.all(Object.entries(services).map(async ([name, url]) => {
      try {
        const response = await request(url + '/ready', {
          signal: AbortSignal.timeout(3000), headers: { 'x-request-id': req.requestId },
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
  // Somente diagnóstico nesta etapa. Rotas de negócio exigirão JWT e autorização.
  app.use((req, res) => res.status(404).json({ error: 'not_found', requestId: req.requestId }));
  return app;
}

