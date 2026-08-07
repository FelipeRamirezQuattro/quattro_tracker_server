import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { listTickets, getTicket, createTicket, updateTicket, deleteTicket } from '../services/ticketService';
import { addComment } from '../services/commentService';
import { promoteTicket, AlreadyPromotedError } from '../services/ticketPromotionService';
import { generateAttachmentKey, uploadAttachment } from '../services/attachmentService';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function createTicketsRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get('/', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    try {
      const { projectId, clientId, solved } = req.query;
      const tickets = await listTickets(req.authUser!, {
        projectId: projectId ? String(projectId) : undefined,
        clientId: clientId ? String(clientId) : undefined,
        solved: solved === undefined ? undefined : solved === 'true',
      });
      res.status(200).json({ success: true, data: tickets });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    try {
      const ticket = await createTicket(req.authUser!, req.body);
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Client or project not found' });
        return;
      }
      res.status(201).json({ success: true, data: ticket });
    } catch (err) {
      if (err instanceof mongoose.Error.ValidationError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.get('/:id', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    try {
      const ticket = await getTicket(req.authUser!, String(req.params.id));
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Ticket not found' });
        return;
      }
      res.status(200).json({ success: true, data: ticket });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  // final_user is allowed here — updateTicket restricts them to toggling
  // `solved` only (reopen/close), scoped to their own client's tickets via
  // scopeTicketFilter. See Global Constraints for the source-plan wording
  // this decision resolves.
  router.put('/:id', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    try {
      const ticket = await updateTicket(req.authUser!, String(req.params.id), req.body);
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Ticket not found' });
        return;
      }
      res.status(200).json({ success: true, data: ticket });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      const ticket = await deleteTicket(String(req.params.id));
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Ticket not found' });
        return;
      }
      res.status(200).json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post(
    '/:id/comments',
    requireRole('admin', 'user', 'final_user'),
    (req, res, next) => {
      // app.ts has no global Express error-handling middleware, so a thrown
      // MulterError (e.g. file too large) must be caught right here or it
      // bypasses this route's own try/catch entirely.
      upload.single('attachment')(req, res, (err) => {
        if (err) {
          res.status(400).json({ success: false, message: err.message });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      try {
        // Check scope BEFORE touching S3: uploading first would let any
        // authenticated caller write an object into the bucket for a ticket
        // they can't even see (or one that doesn't exist), orphaning it on
        // every such rejection. getTicket is already scoped identically to
        // addComment's own internal lookup, so this is a safe pre-check
        // (accepted tradeoff: the ticket is looked up twice).
        const ticket = await getTicket(req.authUser!, String(req.params.id));
        if (!ticket) {
          res.status(404).json({ success: false, message: 'Ticket not found' });
          return;
        }

        let attachmentKey: string | null = null;
        if (req.file) {
          attachmentKey = generateAttachmentKey(req.file.originalname);
          await uploadAttachment(attachmentKey, req.file.buffer, req.file.mimetype);
        }
        const updated = await addComment(req.authUser!, String(req.params.id), {
          comment: req.body.comment,
          attachmentKey,
        });
        if (!updated) {
          res.status(404).json({ success: false, message: 'Ticket not found' });
          return;
        }
        res.status(201).json({ success: true, data: updated });
      } catch (err) {
        if (err instanceof mongoose.Error.ValidationError) {
          res.status(400).json({ success: false, message: err.message });
          return;
        }
        res.status(500).json({ success: false, message: 'Contact the system administrator.' });
      }
    }
  );

  router.post('/:id/promote', requireRole('admin', 'user'), async (req, res) => {
    try {
      const result = await promoteTicket(req.authUser!, String(req.params.id));
      if (!result) {
        res.status(404).json({ success: false, message: 'Ticket not found' });
        return;
      }
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AlreadyPromotedError) {
        res.status(400).json({ success: false, message: (err as Error).message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
