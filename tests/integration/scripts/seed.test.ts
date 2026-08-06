import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { verifyPassword } from '../../../src/helpers/password';
import { seedAdmin } from '../../../src/scripts/seed';

const testEnv = { bcryptCostFactor: 4 } as any;

describe('seedAdmin', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a first admin user', async () => {
    await seedAdmin(testEnv, { username: 'admin', password: 'initial-pass' });

    const admin = await User.findOne({ role: 'admin' });
    expect(admin).not.toBeNull();
    expect(await verifyPassword('initial-pass', admin!.passwordHash)).toBe(true);
  });

  it('is idempotent — does not create a second admin if one exists', async () => {
    await seedAdmin(testEnv, { username: 'admin', password: 'initial-pass' });
    await seedAdmin(testEnv, { username: 'admin2', password: 'other-pass' });

    const admins = await User.find({ role: 'admin' });
    expect(admins).toHaveLength(1);
  });
});
