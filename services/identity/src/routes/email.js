import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/authenticate.js';
import { createEmailService } from '../users/email.js';
import { createMailDelivery } from '../mail/delivery.js';
import { createMailOutbox } from '../mail/outbox.js';

export function createEmailRouter(pool, tokens, { mailOutbox = createMailOutbox(pool, createMailDelivery()), env = process.env } = {}) {
  const router = Router(), service = createEmailService(pool, { mailOutbox, env });
  const limit = rateLimit({ windowMs: 15*60*1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  router.post('/users/me/email', noStore, authenticate(tokens), limit, async (req, res) => {
    await service.request(req.identity.sub, req.body);
    res.status(202).json({ message: 'Enviamos um link para confirmar o endereço informado. Ele é válido por 30 minutos.' });
  });
  router.post('/auth/email/confirm', noStore, limit, async (req, res) => {
    await service.confirm(req.body);
    res.sendStatus(204);
  });
  return router;
}
