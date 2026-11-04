import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/authenticate.js';

export function createUserRouter(service, tokens) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res) => res.status(429).json({
      error: 'too_many_requests', message: 'Muitas tentativas. Tente novamente mais tarde.', requestId: req.requestId,
    }),
  });
  router.post('/auth/register', limit, async (req, res) => res.status(201).json({ user: await service.register(req.body) }));
  router.post('/auth/login', limit, async (req, res) => res.json(await service.login(req.body)));
  router.get('/auth/session', authenticate(tokens), (req, res) => res.json({ identity: req.identity }));
  router.post('/auth/logout', authenticate(tokens), async (req, res) => {
    await tokens.revoke(req.accessToken, req.identity);
    res.sendStatus(204);
  });
  router.get('/users/me', authenticate(tokens), async (req, res) => res.json({ user: await service.profile(req.identity.sub) }));
  router.patch('/users/me', authenticate(tokens), async (req, res) => res.json({ user: await service.updateProfile(req.identity.sub, req.body) }));
  router.post('/users/me/password', authenticate(tokens), limit, async (req, res) => { await service.changePassword(req.identity.sub, req.body); res.json({ message: 'Senha atualizada. Entre novamente.' }); });
  return router;
}

