import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { RefreshToken } from '../../../src/db/models/RefreshToken';
import { hashPassword } from '../../../src/helpers/password';
import { login, refresh } from '../../../src/services/authService';
import { InvalidRefreshTokenError } from '../../../src/helpers/errors';
import { hashToken } from '../../../src/helpers/tokens';

const testEnv = {
  jwtAccessSecret: 'test-secret',
  jwtAccessExpiresIn: '15m',
  refreshTokenExpiresInDays: 30,
  bcryptCostFactor: 4,
} as any;

describe('authService.refresh', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('rotates the refresh token and issues a new access token', async () => {
    const passwordHash = await hashPassword('correct-horse', 4);
    await User.create({ name: 'Ada', username: 'ada', passwordHash, role: 'admin' });
    const { refreshToken: firstToken } = await login({
      username: 'ada',
      password: 'correct-horse',
      env: testEnv,
    });

    const result = await refresh({ rawRefreshToken: firstToken, env: testEnv });

    expect(result.refreshToken).not.toBe(firstToken);

    const oldRecord = await RefreshToken.findOne({ tokenHash: hashToken(firstToken) });
    expect(oldRecord!.revokedAt).not.toBeNull();
    expect(oldRecord!.replacedByTokenHash).toBe(hashToken(result.refreshToken));
  });

  it('rejects an unknown token', async () => {
    await expect(
      refresh({ rawRefreshToken: 'not-a-real-token', env: testEnv })
    ).rejects.toThrow(InvalidRefreshTokenError);
  });

  it('detects reuse of a revoked token and revokes the whole chain', async () => {
    const passwordHash = await hashPassword('correct-horse', 4);
    const user = await User.create({ name: 'Ada', username: 'ada', passwordHash, role: 'admin' });
    const { refreshToken: firstToken } = await login({
      username: 'ada',
      password: 'correct-horse',
      env: testEnv,
    });

    await refresh({ rawRefreshToken: firstToken, env: testEnv });

    await expect(refresh({ rawRefreshToken: firstToken, env: testEnv })).rejects.toThrow(
      InvalidRefreshTokenError
    );

    const remaining = await RefreshToken.find({ userId: user._id, revokedAt: null });
    expect(remaining).toHaveLength(0);
  });
});
