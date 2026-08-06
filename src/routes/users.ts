import { Router } from 'express';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { listUsers, getUser, createUser, updateUser, deleteUser } from '../services/userService';

export function createUsersRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get('/', requireRole('admin'), async (_req, res) => {
    try {
      const users = await listUsers();
      res.status(200).json({ success: true, data: users });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.get('/:id', requireRole('admin'), async (req, res) => {
    try {
      const user = await getUser(String(req.params.id));
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      res.status(200).json({ success: true, data: user });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    try {
      const user = await createUser(req.body, env);
      res.status(201).json({ success: true, data: user });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.put('/:id', requireRole('admin'), async (req, res) => {
    try {
      const user = await updateUser(String(req.params.id), req.body);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      res.status(200).json({ success: true, data: user });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      await deleteUser(String(req.params.id));
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
