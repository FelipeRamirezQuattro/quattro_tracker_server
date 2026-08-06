import { RequestHandler } from 'express';
import { Env } from '../config/env';
import { verifyAccessToken } from '../helpers/jwt';
import { User } from '../db/models/User';

export function requireAuth(env: Env): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('Authorization');
    if (!header) {
      res.status(401).json({ success: false, message: 'Missing Authorization header' });
      return;
    }

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ success: false, message: 'Malformed Authorization header' });
      return;
    }

    try {
      const decoded = verifyAccessToken(token, env.jwtAccessSecret);
      const user = await User.findOne({ _id: decoded.sub, active: true });
      if (!user || user.tokenVersion !== decoded.tokenVersion) {
        res.status(401).json({ success: false, message: 'Invalid token' });
        return;
      }

      req.authUser = {
        id: String(user._id),
        role: user.role,
        tokenVersion: user.tokenVersion,
        assignedClientIds: user.assignedClientIds.map(String),
        assignedProjectIds: user.assignedProjectIds.map(String),
      };
      next();
    } catch {
      res.status(401).json({ success: false, message: 'Invalid token' });
    }
  };
}
