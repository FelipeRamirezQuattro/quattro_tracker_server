import { Router } from 'express';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { listClients, getClient, createClient, updateClient, deleteClient } from '../services/clientService';

export function createClientsRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get('/', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    const clients = await listClients(req.authUser!);
    res.status(200).json({ success: true, data: clients });
  });

  router.get('/:id', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    const client = await getClient(req.authUser!, String(req.params.id));
    if (!client) {
      res.status(404).json({ success: false, message: 'Client not found' });
      return;
    }
    res.status(200).json({ success: true, data: client });
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    const client = await createClient(req.body);
    res.status(201).json({ success: true, data: client });
  });

  router.put('/:id', requireRole('admin', 'user'), async (req, res) => {
    const client = await updateClient(String(req.params.id), req.body);
    res.status(200).json({ success: true, data: client });
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    await deleteClient(String(req.params.id));
    res.status(200).json({ success: true });
  });

  return router;
}
