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

  it('combines _id constraint with $and when baseFilter already has _id (client)', () => {
    const result = scopeClientFilter(scopedUser, { _id: 'c1' });
    // Should use $and to combine both conditions
    expect(result).toEqual({
      $and: [{ _id: 'c1' }, { _id: { $in: ['c1', 'c2'] } }],
    });
  });

  it('combines _id constraint with $and when baseFilter already has _id (project)', () => {
    const result = scopeProjectFilter(scopedUser, { _id: 'p1' });
    // Should use $and to combine both conditions
    expect(result).toEqual({
      $and: [{ _id: 'p1' }, { _id: { $in: ['p1'] } }],
    });
  });

  it('admin bypasses scoping even when _id is in baseFilter', () => {
    expect(scopeClientFilter(adminUser, { _id: 'c999' })).toEqual({ _id: 'c999' });
    expect(scopeProjectFilter(adminUser, { _id: 'p999' })).toEqual({ _id: 'p999' });
  });
});
