import { Router } from 'express';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { listProjects, getProject, createProject, updateProject, deleteProject } from '../services/projectService';
import { createProjectEpicsRouter } from './epics';
import { createProjectSprintsRouter } from './sprints';

export function createProjectsRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));
  router.use('/:id/epics', createProjectEpicsRouter());
  router.use('/:id/sprints', createProjectSprintsRouter());

  router.get('/', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    try {
      const projects = await listProjects(req.authUser!);
      res.status(200).json({ success: true, data: projects });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.get('/:id', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    try {
      const project = await getProject(req.authUser!, String(req.params.id));
      if (!project) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      res.status(200).json({ success: true, data: project });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    try {
      const project = await createProject(req.body);
      res.status(201).json({ success: true, data: project });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.put('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const project = await updateProject(req.authUser!, String(req.params.id), req.body);
      if (!project) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      res.status(200).json({ success: true, data: project });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      await deleteProject(String(req.params.id));
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
