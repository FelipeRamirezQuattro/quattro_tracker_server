import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { scopeClientFilter, scopeProjectFilter } from '../../../src/services/scope';
import { Types } from 'mongoose';

describe('scope filters with real MongoDB queries', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  describe('scopeClientFilter integration', () => {
    it('returns nothing when querying for an out-of-scope document (proves $and merge)', async () => {
      // Create two clients: one in scope (assigned), one out of scope (not assigned)
      const assignedClient = await Client.create({
        name: 'Assigned Client',
        active: true,
      });
      const outOfScopeClient = await Client.create({
        name: 'Out of Scope Client',
        active: true,
      });

      // Create a scoped user who is assigned to ONLY the first client
      const scopedUser = {
        id: 'u1',
        role: 'user' as const,
        tokenVersion: 0,
        assignedClientIds: [String(assignedClient._id)],
        assignedProjectIds: [],
      };

      // Query for the OUT-OF-SCOPE client using scopeClientFilter
      // The old buggy code would return the assigned client (wrong data leak)
      // The fixed code should return nothing
      const filter = scopeClientFilter(scopedUser, { _id: outOfScopeClient._id });
      const result = await Client.findOne(filter);

      expect(result).toBeNull();
    });

    it('returns the document when querying for an in-scope document', async () => {
      // Create two clients
      const assignedClient = await Client.create({
        name: 'Assigned Client',
        active: true,
      });
      const otherClient = await Client.create({
        name: 'Other Client',
        active: true,
      });

      // Create a scoped user assigned to the first client only
      const scopedUser = {
        id: 'u1',
        role: 'user' as const,
        tokenVersion: 0,
        assignedClientIds: [String(assignedClient._id)],
        assignedProjectIds: [],
      };

      // Query for the IN-SCOPE client
      const filter = scopeClientFilter(scopedUser, { _id: assignedClient._id });
      const result = await Client.findOne(filter);

      expect(result).not.toBeNull();
      expect(String(result!._id)).toBe(String(assignedClient._id));
      expect(result!.name).toBe('Assigned Client');
    });

    it('admin user can query for any document regardless of assigned set', async () => {
      const anyClient = await Client.create({
        name: 'Any Client',
        active: true,
      });

      const adminUser = {
        id: 'admin1',
        role: 'admin' as const,
        tokenVersion: 0,
        assignedClientIds: [], // Empty assigned set
        assignedProjectIds: [],
      };

      // Even with empty assignedClientIds, admin should get the document
      const filter = scopeClientFilter(adminUser, { _id: anyClient._id });
      const result = await Client.findOne(filter);

      expect(result).not.toBeNull();
      expect(String(result!._id)).toBe(String(anyClient._id));
    });

    it('correctly handles a non-_id baseFilter for scoped users', async () => {
      const client1 = await Client.create({
        name: 'Active Client',
        active: true,
      });
      const client2 = await Client.create({
        name: 'Inactive Client',
        active: false,
      });

      const scopedUser = {
        id: 'u1',
        role: 'user' as const,
        tokenVersion: 0,
        assignedClientIds: [String(client1._id), String(client2._id)],
        assignedProjectIds: [],
      };

      // Query for active clients in the user's assigned set
      const filter = scopeClientFilter(scopedUser, { active: true });
      const results = await Client.find(filter);

      // Should return only the active client (client1), not the inactive one
      expect(results.length).toBe(1);
      expect(String(results[0]._id)).toBe(String(client1._id));
    });
  });

  describe('scopeProjectFilter integration', () => {
    it('returns nothing when querying for an out-of-scope project', async () => {
      // We'll use the Client model as a stand-in for testing scope logic
      // (actual Project model has the same query pattern)
      const assignedProject = await Client.create({
        name: 'Assigned Project',
        active: true,
      });
      const outOfScopeProject = await Client.create({
        name: 'Out of Scope Project',
        active: true,
      });

      const scopedUser = {
        id: 'u1',
        role: 'user' as const,
        tokenVersion: 0,
        assignedClientIds: [],
        assignedProjectIds: [String(assignedProject._id)],
      };

      // Use scopeProjectFilter even though we're querying Client
      // (demonstrates the filter logic is symmetric)
      const filter = scopeProjectFilter(scopedUser, { _id: outOfScopeProject._id });
      const result = await Client.findOne(filter);

      expect(result).toBeNull();
    });

    it('returns the document when querying for an in-scope project', async () => {
      const assignedProject = await Client.create({
        name: 'Assigned Project',
        active: true,
      });
      const otherProject = await Client.create({
        name: 'Other Project',
        active: true,
      });

      const scopedUser = {
        id: 'u1',
        role: 'user' as const,
        tokenVersion: 0,
        assignedClientIds: [],
        assignedProjectIds: [String(assignedProject._id)],
      };

      const filter = scopeProjectFilter(scopedUser, { _id: assignedProject._id });
      const result = await Client.findOne(filter);

      expect(result).not.toBeNull();
      expect(String(result!._id)).toBe(String(assignedProject._id));
    });
  });
});
