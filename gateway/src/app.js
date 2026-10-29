import express from 'express';
import { requestLogging } from './middleware/request-logging.js';
import { createHealthRouter } from './routes/health.js';
import { createIdentityRouter } from './routes/identity.js';

export function createApp(services, request = fetch, verify) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestLogging);
  app.use(createHealthRouter(services, request));
  app.use(express.json({ limit: '16kb' }));
  if (services.identity && verify) app.use(createIdentityRouter(services.identity, verify, request));
  app.use((req, res) => res.status(404).json({ error: 'not_found', requestId: req.requestId }));
  app.use((error, req, res, _next) => {
    const status = error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500;
    res.status(status).json({ error: status === 400 ? 'invalid_json' : status === 413 ? 'payload_too_large' : 'internal_error', requestId: req.requestId });
  });
  return app;
}

