import express from 'express';
import { requestLogging } from './middleware/request-logging.js';
import { createHealthRouter } from './routes/health.js';
import { createPaymentRouter } from './payments.js';

export function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogging);
  app.use(createHealthRouter(pool));
  app.use(express.json({limit:'16kb'}));
  if (process.env.INTERNAL_API_KEY) app.use(createPaymentRouter(pool));
  app.use((req, res) => res.status(404).json({ error: 'not_found', requestId: req.requestId }));
  app.use((error,req,res,_next)=>res.status(error.status || 503).json({error:'payment_error',message:error.status ? error.message : 'Pagamento indisponível. Tente novamente.',requestId:req.requestId}));
  return app;
}

