import { RequestHandler } from 'express';
import { Role } from '../db/models/User';

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ success: false, message: 'Access to the resource has been denied' });
      return;
    }
    next();
  };
}
