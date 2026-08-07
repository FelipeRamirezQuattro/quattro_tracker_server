import { Router } from 'express';
import mongoose from 'mongoose';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import {
  listTimeEntries,
  getTimeEntry,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
} from '../services/timeEntryService';

// This router is mounted flat at /api/time-entries (not nested under
// createProjectsRouter/createTasksRouter), so nothing else in the chain has
// authenticated the request yet — requireAuth(env) is required here.
export function createTimeEntriesRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get('/', requireRole('admin', 'user'), async (req, res) => {
    try {
      const { userId, taskId, projectId, clientId, from, to } = req.query;
      const entries = await listTimeEntries(req.authUser!, {
        userId: userId ? String(userId) : undefined,
        taskId: taskId ? String(taskId) : undefined,
        projectId: projectId ? String(projectId) : undefined,
        clientId: clientId ? String(clientId) : undefined,
        from: from ? String(from) : undefined,
        to: to ? String(to) : undefined,
      });
      res.status(200).json({ success: true, data: entries });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/', requireRole('admin', 'user'), async (req, res) => {
    try {
      const entry = await createTimeEntry(req.authUser!, req.body);
      if (!entry) {
        res.status(404).json({ success: false, message: 'Task not found' });
        return;
      }
      res.status(201).json({ success: true, data: entry });
    } catch (err) {
      if (err instanceof mongoose.Error.ValidationError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.get('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const entry = await getTimeEntry(req.authUser!, String(req.params.id));
      if (!entry) {
        res.status(404).json({ success: false, message: 'Time entry not found' });
        return;
      }
      res.status(200).json({ success: true, data: entry });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.put('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const entry = await updateTimeEntry(req.authUser!, String(req.params.id), req.body);
      if (!entry) {
        res.status(404).json({ success: false, message: 'Time entry not found' });
        return;
      }
      res.status(200).json({ success: true, data: entry });
    } catch (err) {
      if (err instanceof mongoose.Error.ValidationError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.delete('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const entry = await deleteTimeEntry(req.authUser!, String(req.params.id));
      if (!entry) {
        res.status(404).json({ success: false, message: 'Time entry not found' });
        return;
      }
      res.status(200).json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
