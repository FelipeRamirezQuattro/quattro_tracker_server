import mongoose from 'mongoose';

export interface AuthUser {
  id: string;
  role: 'admin' | 'user' | 'final_user';
  tokenVersion: number;
  assignedClientIds: string[];
  assignedProjectIds: string[];
}

function toObjectIdIfValid(id: string): mongoose.Types.ObjectId | string {
  // Try to convert to ObjectId if it's a valid hex string, otherwise return as-is
  try {
    if (id.length === 24 && /^[0-9a-f]{24}$/i.test(id)) {
      return new mongoose.Types.ObjectId(id);
    }
  } catch {
    // If conversion fails, return as string
  }
  return id;
}

export function scopeClientFilter(user: AuthUser, baseFilter: Record<string, any> = {}) {
  if (user.role === 'admin') return baseFilter;
  const ids = user.assignedClientIds.map(toObjectIdIfValid);
  return { ...baseFilter, _id: { $in: ids } };
}

export function scopeProjectFilter(user: AuthUser, baseFilter: Record<string, any> = {}) {
  if (user.role === 'admin') return baseFilter;
  const ids = user.assignedProjectIds.map(toObjectIdIfValid);
  return { ...baseFilter, _id: { $in: ids } };
}
