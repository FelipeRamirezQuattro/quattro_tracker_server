import { Router } from 'express';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { findAttachment } from '../services/commentService';
import { getAttachmentObject } from '../services/attachmentService';

export function createFilesRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get('/:attachmentId', async (req, res) => {
    try {
      const found = await findAttachment(req.authUser!, String(req.params.attachmentId));
      if (!found || !found.comment.attachmentKey) {
        res.status(404).json({ success: false, message: 'File not found' });
        return;
      }
      const { stream, contentType } = await getAttachmentObject(found.comment.attachmentKey);
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${found.comment.attachmentKey.split('/').pop()}"`
      );
      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Contact the system administrator.' });
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
