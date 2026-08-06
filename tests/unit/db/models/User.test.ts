import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { User } from '../../../../src/db/models/User';

describe('User model', () => {
  beforeAll(async () => {
    await connectTestDb();
    await User.init();
  });
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a user with defaults', async () => {
    const user = await User.create({
      name: 'Ada Lovelace',
      username: 'ada',
      passwordHash: 'hashed',
      role: 'admin',
    });

    expect(user.active).toBe(true);
    expect(user.assignedClientIds).toEqual([]);
    expect(user.assignedProjectIds).toEqual([]);
    expect(user.tokenVersion).toBe(0);
    expect(user.deletedAt).toBeNull();
  });

  it('enforces unique username', async () => {
    await User.create({ name: 'A', username: 'dup', passwordHash: 'h', role: 'admin' });
    await expect(
      User.create({ name: 'B', username: 'dup', passwordHash: 'h', role: 'user' })
    ).rejects.toThrow();
  });

  it('rejects an invalid role', async () => {
    await expect(
      User.create({ name: 'A', username: 'x', passwordHash: 'h', role: 'superadmin' as any })
    ).rejects.toThrow();
  });
});
