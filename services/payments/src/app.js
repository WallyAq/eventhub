import express from 'express';
import { requestLogging } from './middleware/request-logging.js';
import { createHealthRouter } from './routes/health.js';

export function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogging);
  app.use(createHealthRouter(pool));
  // Rotas de negócio serão adicionadas com autenticação e autorização.
  app.use((req, res) => res.status(404).json({ error: 'not_found', requestId: req.requestId }));
  return app;
}

