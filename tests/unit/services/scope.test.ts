import { scopeClientFilter, scopeProjectFilter } from '../../../src/services/scope';

describe('scope filters', () => {
  const scopedUser = {
    id: 'u1',
    role: 'user' as const,
    tokenVersion: 0,
    assignedClientIds: ['c1', 'c2'],
    assignedProjectIds: ['p1'],
  };
  const adminUser = { ...scopedUser, role: 'admin' as const };

  it('leaves the filter unchanged for admin', () => {
    expect(scopeClientFilter(adminUser, { active: true })).toEqual({ active: true });
    expect(scopeProjectFilter(adminUser, {})).toEqual({});
  });

  it('adds an _id $in filter for a scoped user (client)', () => {
    expect(scopeClientFilter(scopedUser, { active: true })).toEqual({
      active: true,
      _id: { $in: ['c1', 'c2'] },
    });
  });

  it('adds an _id $in filter for a scoped user (project)', () => {
    expect(scopeProjectFilter(scopedUser, {})).toEqual({ _id: { $in: ['p1'] } });
  });
});
