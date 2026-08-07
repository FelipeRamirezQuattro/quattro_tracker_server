import { Router } from 'express';
import mongoose from 'mongoose';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { listSprints, getSprint, createSprint, updateSprint, deleteSprint } from '../services/sprintService';

// No requireAuth() here: this router is only ever mounted inside
// createProjectsRouter (src/routes/projects.ts), which already runs
// requireAuth(env) before delegating to '/:id/sprints'. Re-running it here
// would just re-verify the JWT and re-query the User collection for
// every request with no additional benefit.
export function createProjectSprintsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', requireRole('admin', 'user'), async (req, res) => {
    try {
      const sprints = await listSprints(req.authUser!, String(req.params.id));
      if (sprints === null) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      res.status(200).json({ success: true, data: sprints });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/', requireRole('admin', 'user'), async (req, res) => {
    try {
      const sprint = await createSprint(req.authUser!, String(req.params.id), req.body);
      if (!sprint) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      res.status(201).json({ success: true, data: sprint });
    } catch (err) {
      if (err instanceof mongoose.Error.ValidationError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}

export function createSprintsRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const sprint = await getSprint(req.authUser!, String(req.params.id));
      if (!sprint) {
        res.status(404).json({ success: false, message: 'Sprint not found' });
        return;
      }
      res.status(200).json({ success: true, data: sprint });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.put('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const sprint = await updateSprint(req.authUser!, String(req.params.id), req.body);
      if (!sprint) {
        res.status(404).json({ success: false, message: 'Sprint not found' });
        return;
      }
      res.status(200).json({ success: true, data: sprint });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.delete('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const sprint = await deleteSprint(req.authUser!, String(req.params.id));
      if (!sprint) {
        res.status(404).json({ success: false, message: 'Sprint not found' });
        return;
      }
      res.status(200).json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
