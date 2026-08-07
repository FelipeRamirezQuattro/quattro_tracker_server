import { Router } from 'express';
import mongoose from 'mongoose';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { reportByProject, reportByClient, reportByUser, reportTimeline } from '../services/reportService';

// reportService's exported functions all call `new mongoose.Types.ObjectId(id)`
// and `new Date(...)` directly, outside any try/catch — an invalid id or date
// string would otherwise throw uncaught out of the aggregation and surface as
// a generic 500 via each route's bare catch below. These are query params
// (not path params, where a bad id is conventionally a 404), so validate
// up front and return 400, matching the existing required-param/enum checks.
function isValidDate(value: string): boolean {
  return !isNaN(new Date(value).getTime());
}

// This router is mounted flat at /api/reports (not nested under any other
// router), so nothing else in the chain has authenticated the request yet —
// requireAuth(env) is required here. Every endpoint in this router is
// admin-only, so the role gate is applied once for the whole router rather
// than per-route (unlike time-entries, there's no user-role case here).
export function createReportsRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));
  router.use(requireRole('admin'));

  router.get('/by-project', async (req, res) => {
    try {
      const { projectId, from, to } = req.query;
      if (!projectId || !from || !to) {
        res.status(400).json({ success: false, message: 'projectId, from, and to are required' });
        return;
      }
      if (!mongoose.isValidObjectId(String(projectId))) {
        res.status(400).json({ success: false, message: 'projectId is not a valid id' });
        return;
      }
      if (!isValidDate(String(from)) || !isValidDate(String(to))) {
        res.status(400).json({ success: false, message: 'from and to must be valid dates' });
        return;
      }
      const report = await reportByProject(String(projectId), { from: String(from), to: String(to) });
      res.status(200).json({ success: true, data: report });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.get('/by-client', async (req, res) => {
    try {
      const { clientId, from, to } = req.query;
      if (!clientId || !from || !to) {
        res.status(400).json({ success: false, message: 'clientId, from, and to are required' });
        return;
      }
      if (!mongoose.isValidObjectId(String(clientId))) {
        res.status(400).json({ success: false, message: 'clientId is not a valid id' });
        return;
      }
      if (!isValidDate(String(from)) || !isValidDate(String(to))) {
        res.status(400).json({ success: false, message: 'from and to must be valid dates' });
        return;
      }
      const report = await reportByClient(String(clientId), { from: String(from), to: String(to) });
      res.status(200).json({ success: true, data: report });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.get('/by-user', async (req, res) => {
    try {
      const { userId, from, to } = req.query;
      if (!userId || !from || !to) {
        res.status(400).json({ success: false, message: 'userId, from, and to are required' });
        return;
      }
      if (!mongoose.isValidObjectId(String(userId))) {
        res.status(400).json({ success: false, message: 'userId is not a valid id' });
        return;
      }
      if (!isValidDate(String(from)) || !isValidDate(String(to))) {
        res.status(400).json({ success: false, message: 'from and to must be valid dates' });
        return;
      }
      const report = await reportByUser(String(userId), { from: String(from), to: String(to) });
      res.status(200).json({ success: true, data: report });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.get('/timeline', async (req, res) => {
    try {
      const { scope, scopeId, from, to, granularity } = req.query;
      if (!scope || !scopeId || !from || !to || !granularity) {
        res.status(400).json({ success: false, message: 'scope, scopeId, from, to, and granularity are required' });
        return;
      }
      if (scope !== 'project' && scope !== 'client') {
        res.status(400).json({ success: false, message: 'scope must be "project" or "client"' });
        return;
      }
      if (!['day', 'week', 'month'].includes(String(granularity))) {
        res.status(400).json({ success: false, message: 'granularity must be "day", "week", or "month"' });
        return;
      }
      if (!mongoose.isValidObjectId(String(scopeId))) {
        res.status(400).json({ success: false, message: 'scopeId is not a valid id' });
        return;
      }
      if (!isValidDate(String(from)) || !isValidDate(String(to))) {
        res.status(400).json({ success: false, message: 'from and to must be valid dates' });
        return;
      }
      const timeline = await reportTimeline(
        scope,
        String(scopeId),
        { from: String(from), to: String(to) },
        granularity as 'day' | 'week' | 'month'
      );
      res.status(200).json({ success: true, data: timeline });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
