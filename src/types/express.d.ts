import { Role } from '../db/models/User';

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        role: Role;
        tokenVersion: number;
        assignedClientIds: string[];
        assignedProjectIds: string[];
      };
    }
  }
}

export {};
