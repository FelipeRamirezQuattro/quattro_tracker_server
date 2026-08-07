import { scopeOwnUserFilter, AuthUser } from '../../../src/services/scope';

const adminUser: AuthUser = {
  id: 'admin1', role: 'admin', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: [],
};
const scopedUser: AuthUser = {
  id: 'user1', role: 'user', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: ['p1'],
};

describe('scopeOwnUserFilter', () => {
  it('returns the base filter unchanged for admin', () => {
    expect(scopeOwnUserFilter(adminUser, { taskId: 't1' })).toEqual({ taskId: 't1' });
  });

  it('merges a userId filter for a non-admin', () => {
    expect(scopeOwnUserFilter(scopedUser, { taskId: 't1' })).toEqual({ taskId: 't1', userId: 'user1' });
  });

  it('wraps in $and when the base filter already has a userId key', () => {
    expect(scopeOwnUserFilter(scopedUser, { userId: 'someone-else' })).toEqual({
      $and: [{ userId: 'someone-else' }, { userId: 'user1' }],
    });
  });
});
