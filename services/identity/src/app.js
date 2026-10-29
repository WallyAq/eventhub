import express from 'express';
import { requestLogging } from './middleware/request-logging.js';
import { createHealthRouter } from './routes/health.js';
import { createUserRouter } from './routes/users.js';
import { errors } from './middleware/errors.js';
import { createOrganizationRouter } from './routes/organizations.js';

export function createApp(pool, { service, tokens, organizations } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestLogging);
  app.use(createHealthRouter(pool));
  app.use(express.json({ limit: '16kb' }));
  if (service && tokens) app.use(createUserRouter(service, tokens));
  if (organizations && tokens) app.use(createOrganizationRouter(organizations, tokens));
  app.use((req, res) => res.status(404).json({ error: 'not_found', requestId: req.requestId }));
  app.use(errors);
  return app;
}

