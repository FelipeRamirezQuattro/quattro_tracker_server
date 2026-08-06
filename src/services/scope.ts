export interface AuthUser {
  id: string;
  role: 'admin' | 'user' | 'final_user';
  tokenVersion: number;
  assignedClientIds: string[];
  assignedProjectIds: string[];
}

export function scopeClientFilter(user: AuthUser, baseFilter: Record<string, any> = {}) {
  if (user.role === 'admin') return baseFilter;
  const scopeCondition = { _id: { $in: user.assignedClientIds } };
  if ('_id' in baseFilter) {
    return { $and: [baseFilter, scopeCondition] };
  }
  return { ...baseFilter, ...scopeCondition };
}

export function scopeProjectFilter(user: AuthUser, baseFilter: Record<string, any> = {}) {
  if (user.role === 'admin') return baseFilter;
  const scopeCondition = { _id: { $in: user.assignedProjectIds } };
  if ('_id' in baseFilter) {
    return { $and: [baseFilter, scopeCondition] };
  }
  return { ...baseFilter, ...scopeCondition };
}
