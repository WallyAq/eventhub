import { Router } from 'express';

export function createHealthRouter(pool) {
  const router = Router();
  router.get('/health', (_req, res) => res.json({ service: 'payments', status: 'ok' }));
  router.get('/ready', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ service: 'payments', status: 'ready', database: 'ok' });
    } catch {
      res.status(503).json({ service: 'payments', status: 'unavailable', requestId: req.requestId });
    }
  });
  return router;
}

