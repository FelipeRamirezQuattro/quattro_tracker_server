import { Router } from 'express';
import mongoose from 'mongoose';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { listTasks, getTask, createTask, updateTask, deleteTask } from '../services/taskService';
import { addSubtask, updateSubtask, deleteSubtask } from '../services/subtaskService';
import { transitionTaskStatus, InvalidTransitionError, DefinitionOfReadyError } from '../services/taskStatusService';

// This router is mounted flat at /api/tasks (not nested under
// createProjectsRouter like the epic/sprint sub-routers), so nothing else
// in the chain has authenticated the request yet — requireAuth(env) is
// required here.
export function createTasksRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get('/', requireRole('admin', 'user'), async (req, res) => {
    try {
      const { projectId, status, sprintId, epicId, assigneeId } = req.query;
      if (!projectId) {
        res.status(400).json({ success: false, message: 'projectId is required' });
        return;
      }
      const tasks = await listTasks(req.authUser!, {
        projectId: String(projectId),
        status: status ? String(status) : undefined,
        sprintId: sprintId ? String(sprintId) : undefined,
        epicId: epicId ? String(epicId) : undefined,
        assigneeId: assigneeId ? String(assigneeId) : undefined,
      });
      if (tasks === null) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      res.status(200).json({ success: true, data: tasks });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/', requireRole('admin', 'user'), async (req, res) => {
    try {
      const task = await createTask(req.authUser!, req.body);
      if (!task) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
      res.status(201).json({ success: true, data: task });
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
      const task = await getTask(req.authUser!, String(req.params.id));
      if (!task) {
        res.status(404).json({ success: false, message: 'Task not found' });
        return;
      }
      res.status(200).json({ success: true, data: task });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.put('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const task = await updateTask(req.authUser!, String(req.params.id), req.body);
      if (!task) {
        res.status(404).json({ success: false, message: 'Task not found' });
        return;
      }
      res.status(200).json({ success: true, data: task });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.delete('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const task = await deleteTask(req.authUser!, String(req.params.id));
      if (!task) {
        res.status(404).json({ success: false, message: 'Task not found' });
        return;
      }
      res.status(200).json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/:id/subtasks', requireRole('admin', 'user'), async (req, res) => {
    try {
      const task = await addSubtask(req.authUser!, String(req.params.id), req.body);
      if (!task) {
        res.status(404).json({ success: false, message: 'Task not found' });
        return;
      }
      res.status(201).json({ success: true, data: task });
    } catch (err) {
      if (err instanceof mongoose.Error.ValidationError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.put('/:id/subtasks/:subId', requireRole('admin', 'user'), async (req, res) => {
    try {
      const task = await updateSubtask(req.authUser!, String(req.params.id), String(req.params.subId), req.body);
      if (!task) {
        res.status(404).json({ success: false, message: 'Task or subtask not found' });
        return;
      }
      res.status(200).json({ success: true, data: task });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.delete('/:id/subtasks/:subId', requireRole('admin', 'user'), async (req, res) => {
    try {
      const task = await deleteSubtask(req.authUser!, String(req.params.id), String(req.params.subId));
      if (!task) {
        res.status(404).json({ success: false, message: 'Task or subtask not found' });
        return;
      }
      res.status(200).json({ success: true, data: task });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.put('/:id/status', requireRole('admin', 'user'), async (req, res) => {
    try {
      const task = await transitionTaskStatus(req.authUser!, String(req.params.id), req.body.status);
      if (!task) {
        res.status(404).json({ success: false, message: 'Task not found' });
        return;
      }
      res.status(200).json({ success: true, data: task });
    } catch (err) {
      if (err instanceof InvalidTransitionError || err instanceof DefinitionOfReadyError) {
        res.status(400).json({ success: false, message: (err as Error).message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
