import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { authenticate } from '../middleware/authenticate.js';

export function createInternalRouter(service, tokens, internalKey = process.env.INTERNAL_API_KEY) {
  const router = Router();
  router.use('/internal', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const provided = Buffer.from(req.get('x-internal-key') || '');
    const expected = Buffer.from(internalKey || '');
    if (!expected.length || expected.length !== provided.length || !timingSafeEqual(provided, expected))
      return res.status(401).json({ error: 'invalid_internal_key', requestId: req.requestId });
    next();
  });
  router.post('/internal/auth/verify', (req, res, next) => {
    if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.token !== 'string' || req.body.token.length > 8192)
      return res.status(400).json({ error: 'invalid_input', requestId: req.requestId });
    req.headers.authorization = 'Bearer ' + req.body.token;
    next();
  }, authenticate(tokens), (req, res) => res.json({ identity: req.identity }));
  router.get('/internal/users/:id', async (req, res) => {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(req.params.id))
      return res.status(404).json({ error: 'not_found', requestId: req.requestId });
    try {
      const user = await service.profile(req.params.id);
      res.json({ user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
      if (error.code === 'invalid_token') return res.status(404).json({ error: 'not_found', requestId: req.requestId });
      throw error;
    }
  });
  return router;
}
