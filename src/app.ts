import express from 'express';

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ success: true });
  });

  return app;
}
