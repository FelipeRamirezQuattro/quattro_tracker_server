import { Router } from 'express';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { listEpics, getEpic, createEpic, updateEpic, deleteEpic } from '../services/epicService';

// No requireAuth() here: this router is only ever mounted inside
// createProjectsRouter (src/routes/projects.ts), which already runs
// requireAuth(env) before delegating to '/:id/epics'. Re-running it here
// would just re-verify the JWT and re-query the User collection for
// every request with no additional benefit.
export function createProjectEpicsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', requireRole('admin', 'user'), async (req, res) => {
    try {
      const epics = await listEpics(req.authUser!, String(req.params.id));
      if (epics === null) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      res.status(200).json({ success: true, data: epics });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/', requireRole('admin', 'user'), async (req, res) => {
    try {
      const epic = await createEpic(req.authUser!, String(req.params.id), req.body);
      if (!epic) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      res.status(201).json({ success: true, data: epic });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}

export function createEpicsRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const epic = await getEpic(req.authUser!, String(req.params.id));
      if (!epic) {
        res.status(404).json({ success: false, message: 'Epic not found' });
        return;
      }
      res.status(200).json({ success: true, data: epic });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.put('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const epic = await updateEpic(req.authUser!, String(req.params.id), req.body);
      if (!epic) {
        res.status(404).json({ success: false, message: 'Epic not found' });
        return;
      }
      res.status(200).json({ success: true, data: epic });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.delete('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const epic = await deleteEpic(req.authUser!, String(req.params.id));
      if (!epic) {
        res.status(404).json({ success: false, message: 'Epic not found' });
        return;
      }
      res.status(200).json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
