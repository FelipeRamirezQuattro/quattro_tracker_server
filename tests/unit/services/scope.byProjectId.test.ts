import { scopeByProjectIdFilter, AuthUser } from '../../../src/services/scope';

const adminUser: AuthUser = {
  id: 'admin1', role: 'admin', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: [],
};
const scopedUser: AuthUser = {
  id: 'user1', role: 'user', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: ['p1', 'p2'],
};

describe('scopeByProjectIdFilter', () => {
  it('returns the base filter unchanged for admin', () => {
    expect(scopeByProjectIdFilter(adminUser, { status: 'ready' })).toEqual({ status: 'ready' });
  });

  it('merges a projectId $in filter for a scoped user', () => {
    expect(scopeByProjectIdFilter(scopedUser, { status: 'ready' })).toEqual({
      status: 'ready',
      projectId: { $in: ['p1', 'p2'] },
    });
  });

  it('merges alongside an _id filter without colliding keys', () => {
    expect(scopeByProjectIdFilter(scopedUser, { _id: 'task1' })).toEqual({
      _id: 'task1',
      projectId: { $in: ['p1', 'p2'] },
    });
  });

  it('wraps in $and when the base filter already has a projectId key', () => {
    expect(scopeByProjectIdFilter(scopedUser, { projectId: 'p1' })).toEqual({
      $and: [{ projectId: 'p1' }, { projectId: { $in: ['p1', 'p2'] } }],
    });
  });
});
