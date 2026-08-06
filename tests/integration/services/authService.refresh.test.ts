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

  it('rejects an expired token without mutating it or revoking the chain', async () => {
    const passwordHash = await hashPassword('correct-horse', 4);
    const user = await User.create({ name: 'Ada', username: 'ada', passwordHash, role: 'admin' });

    // Manually create an expired (but not revoked) refresh token for this user
    const expiredRawToken = 'old-expired-token-12345';
    const expiredTokenHash = hashToken(expiredRawToken);
    const expiredAt = new Date(Date.now() - 1000); // 1 second in the past
    await RefreshToken.create({
      userId: user._id,
      tokenHash: expiredTokenHash,
      expiresAt: expiredAt,
    });

    // Also create a valid token for the same user to verify it doesn't get revoked
    const validRawToken = 'still-valid-token-12345';
    const validTokenHash = hashToken(validRawToken);
    const validExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await RefreshToken.create({
      userId: user._id,
      tokenHash: validTokenHash,
      expiresAt: validExpiresAt,
    });

    // First presentation of expired token should be rejected
    await expect(refresh({ rawRefreshToken: expiredRawToken, env: testEnv })).rejects.toThrow(
      InvalidRefreshTokenError
    );

    // Verify the expired token was NOT mutated (still revokedAt: null)
    const expiredRecord = await RefreshToken.findOne({ tokenHash: expiredTokenHash });
    expect(expiredRecord!.revokedAt).toBeNull();
    expect(expiredRecord!.replacedByTokenHash).toBeNull();

    // Verify the valid token was NOT revoked by the expired token presentation
    const validRecord = await RefreshToken.findOne({ tokenHash: validTokenHash });
    expect(validRecord!.revokedAt).toBeNull();

    // Second presentation of same expired token should also be rejected the same way
    // (not as a reuse attack with chain revocation)
    await expect(refresh({ rawRefreshToken: expiredRawToken, env: testEnv })).rejects.toThrow(
      InvalidRefreshTokenError
    );

    // Verify nothing changed (still no mutations or chain revocation)
    const expiredRecord2 = await RefreshToken.findOne({ tokenHash: expiredTokenHash });
    expect(expiredRecord2!.revokedAt).toBeNull();
    const validRecord2 = await RefreshToken.findOne({ tokenHash: validTokenHash });
    expect(validRecord2!.revokedAt).toBeNull();
  });
});
