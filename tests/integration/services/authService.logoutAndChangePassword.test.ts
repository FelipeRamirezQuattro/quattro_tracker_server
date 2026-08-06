import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { RefreshToken } from '../../../src/db/models/RefreshToken';
import { hashPassword, verifyPassword } from '../../../src/helpers/password';
import { login, logout, changePassword } from '../../../src/services/authService';
import { InvalidCredentialsError } from '../../../src/helpers/errors';
import { hashToken } from '../../../src/helpers/tokens';

const testEnv = {
  jwtAccessSecret: 'test-secret',
  jwtAccessExpiresIn: '15m',
  refreshTokenExpiresInDays: 30,
  bcryptCostFactor: 4,
} as any;

describe('authService logout + changePassword', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('logout revokes the matching refresh token', async () => {
    const passwordHash = await hashPassword('correct-horse', 4);
    await User.create({ name: 'Ada', username: 'ada', passwordHash, role: 'admin' });
    const { refreshToken } = await login({ username: 'ada', password: 'correct-horse', env: testEnv });

    await logout({ rawRefreshToken: refreshToken });

    const record = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
    expect(record!.revokedAt).not.toBeNull();
  });

  it('changePassword rehashes, bumps tokenVersion, and revokes all refresh tokens', async () => {
    const passwordHash = await hashPassword('correct-horse', 4);
    const user = await User.create({ name: 'Ada', username: 'ada', passwordHash, role: 'admin' });
    await login({ username: 'ada', password: 'correct-horse', env: testEnv });
    await login({ username: 'ada', password: 'correct-horse', env: testEnv });

    await changePassword({
      userId: String(user._id),
      currentPassword: 'correct-horse',
      newPassword: 'new-password',
      env: testEnv,
    });

    const updated = await User.findById(user._id);
    expect(updated!.tokenVersion).toBe(1);
    expect(await verifyPassword('new-password', updated!.passwordHash)).toBe(true);

    const stillActive = await RefreshToken.find({ userId: user._id, revokedAt: null });
    expect(stillActive).toHaveLength(0);
  });

  it('changePassword rejects a wrong current password', async () => {
    const passwordHash = await hashPassword('correct-horse', 4);
    const user = await User.create({ name: 'Ada', username: 'ada', passwordHash, role: 'admin' });

    await expect(
      changePassword({
        userId: String(user._id),
        currentPassword: 'wrong',
        newPassword: 'new-password',
        env: testEnv,
      })
    ).rejects.toThrow(InvalidCredentialsError);
  });
});
