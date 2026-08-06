import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { Env } from './config/env';
import { createAuthRouter } from './routes/auth';
import { createClientsRouter } from './routes/clients';
import { createProjectsRouter } from './routes/projects';
import { createUsersRouter } from './routes/users';
import { createEpicsRouter } from './routes/epics';

export function createApp(env: Env): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.use('/api/auth', createAuthRouter(env));
  app.use('/api/clients', createClientsRouter(env));
  app.use('/api/projects', createProjectsRouter(env));
  app.use('/api/users', createUsersRouter(env));
  app.use('/api/epics', createEpicsRouter(env));

  return app;
}
