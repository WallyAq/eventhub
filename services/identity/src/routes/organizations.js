import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';

export function createOrganizationRouter(service, tokens) {
  const router = Router();
  router.use('/organizations', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, authenticate(tokens), (req, res, next) => {
    if (req.identity.role !== 'ORGANIZER' || !req.identity.organizationId)
      return res.status(403).json({ error: 'organizer_required', message: 'Esta operação exige uma conta de organizador vinculada a uma instituição.', requestId: req.requestId });
    next();
  });
  router.get('/organizations', async (req, res) => res.json({ organizations: await service.list(req.identity.sub) }));
  router.post('/organizations', async (req, res) => res.status(201).json({ organization: await service.create(req.identity.sub, req.body) }));
  router.get('/organizations/:id', async (req, res) => res.json({ organization: await service.get(req.params.id, req.identity.sub) }));
  router.patch('/organizations/:id', async (req, res) => res.json({ organization: await service.update(req.params.id, req.identity.sub, req.body) }));
  router.get('/organizations/:id/members', async (req, res) => res.json({ members: await service.members(req.params.id, req.identity.sub) }));
  router.post('/organizations/:id/members', async (req, res) => res.status(201).json({ member: await service.addMember(req.params.id, req.identity.sub, req.body) }));
  router.delete('/organizations/:id/members/:userId', async (req, res) => {
    await service.removeMember(req.params.id, req.identity.sub, req.params.userId);
    res.sendStatus(204);
  });
  return router;
}
