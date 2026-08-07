import { scopeByClientIdFilter, AuthUser } from '../../../src/services/scope';

const adminUser: AuthUser = {
  id: 'admin1', role: 'admin', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: [],
};
const scopedUser: AuthUser = {
  id: 'contact1', role: 'final_user', tokenVersion: 0, assignedClientIds: ['c1'], assignedProjectIds: [],
};

describe('scopeByClientIdFilter', () => {
  it('returns the base filter unchanged for admin', () => {
    expect(scopeByClientIdFilter(adminUser, { solved: false })).toEqual({ solved: false });
  });

  it('merges a clientId $in filter for a non-admin', () => {
    expect(scopeByClientIdFilter(scopedUser, { solved: false })).toEqual({
      solved: false,
      clientId: { $in: ['c1'] },
    });
  });

  it('wraps in $and when the base filter already has a clientId key', () => {
    expect(scopeByClientIdFilter(scopedUser, { clientId: 'other-client' })).toEqual({
      $and: [{ clientId: 'other-client' }, { clientId: { $in: ['c1'] } }],
    });
  });
});
