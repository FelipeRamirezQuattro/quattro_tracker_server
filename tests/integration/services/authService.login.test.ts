import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { RefreshToken } from '../../../src/db/models/RefreshToken';
import { hashPassword } from '../../../src/helpers/password';
import { verifyAccessToken } from '../../../src/helpers/jwt';
import { login } from '../../../src/services/authService';
import { InvalidCredentialsError } from '../../../src/helpers/errors';
import { hashToken } from '../../../src/helpers/tokens';

const testEnv = {
  jwtAccessSecret: 'test-secret',
  jwtAccessExpiresIn: '15m',
  refreshTokenExpiresInDays: 30,
  bcryptCostFactor: 4,
} as any;

describe('authService.login', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('issues an access token and a refresh token for correct credentials', async () => {
    const passwordHash = await hashPassword('correct-horse', 4);
    const user = await User.create({
      name: 'Ada',
      username: 'ada',
      passwordHash,
      role: 'admin',
    });

    const result = await login({ username: 'ada', password: 'correct-horse', env: testEnv });

    const decoded = verifyAccessToken(result.accessToken, testEnv.jwtAccessSecret);
    expect(decoded.sub).toBe(String(user._id));
    expect(decoded.role).toBe('admin');

    const stored = await RefreshToken.findOne({ tokenHash: hashToken(result.refreshToken) });
    expect(stored).not.toBeNull();
    expect(stored!.revokedAt).toBeNull();
  });

  it('rejects a wrong password', async () => {
    const passwordHash = await hashPassword('correct-horse', 4);
    await User.create({ name: 'Ada', username: 'ada', passwordHash, role: 'admin' });

    await expect(
      login({ username: 'ada', password: 'wrong', env: testEnv })
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('rejects an inactive user', async () => {
    const passwordHash = await hashPassword('correct-horse', 4);
    await User.create({
      name: 'Ada',
      username: 'ada',
      passwordHash,
      role: 'admin',
      active: false,
    });

    await expect(
      login({ username: 'ada', password: 'correct-horse', env: testEnv })
    ).rejects.toThrow(InvalidCredentialsError);
  });
});
