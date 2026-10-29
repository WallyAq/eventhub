import express from 'express';
import { randomUUID } from 'node:crypto';

export function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const id = req.get('x-request-id');
    req.requestId = id && /^[a-zA-Z0-9-]{1,64}$/.test(id) ? id : randomUUID();
    res.set('x-request-id', req.requestId);
    const start = Date.now();
    res.on('finish', () => console.log(JSON.stringify({
      service: 'identity', requestId: req.requestId, method: req.method,
      path: req.path, status: res.statusCode, durationMs: Date.now() - start,
    })));
    next();
  });
  app.get('/health', (_req, res) => res.json({ service: 'identity', status: 'ok' }));
  app.get('/ready', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ service: 'identity', status: 'ready', database: 'ok' });
    } catch {
      res.status(503).json({ service: 'identity', status: 'unavailable', requestId: req.requestId });
    }
  });
  app.use((req, res) => res.status(404).json({ error: 'not_found', requestId: req.requestId }));
  return app;
}

