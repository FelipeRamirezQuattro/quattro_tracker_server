export interface AuthUser {
  id: string;
  role: 'admin' | 'user' | 'final_user';
  tokenVersion: number;
  assignedClientIds: string[];
  assignedProjectIds: string[];
}

export function scopeClientFilter(user: AuthUser, baseFilter: Record<string, any> = {}) {
  if (user.role === 'admin') return baseFilter;
  return { ...baseFilter, _id: { $in: user.assignedClientIds } };
}

export function scopeProjectFilter(user: AuthUser, baseFilter: Record<string, any> = {}) {
  if (user.role === 'admin') return baseFilter;
  return { ...baseFilter, _id: { $in: user.assignedProjectIds } };
}
