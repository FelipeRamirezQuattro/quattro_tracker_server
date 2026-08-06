import { Env } from '../config/env';
import { User } from '../db/models/User';
import { RefreshToken } from '../db/models/RefreshToken';
import { verifyPassword } from '../helpers/password';
import { generateOpaqueToken, hashToken } from '../helpers/tokens';
import { signAccessToken } from '../helpers/jwt';
import { InvalidCredentialsError, InvalidRefreshTokenError } from '../helpers/errors';

interface LoginParams {
  username: string;
  password: string;
  env: Env;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export async function login({ username, password, env }: LoginParams): Promise<AuthTokens> {
  const user = await User.findOne({ username, active: true });
  if (!user) throw new InvalidCredentialsError();

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new InvalidCredentialsError();

  const accessToken = signAccessToken(
    { sub: String(user._id), role: user.role, tokenVersion: user.tokenVersion },
    env.jwtAccessSecret,
    env.jwtAccessExpiresIn
  );

  const rawRefreshToken = generateOpaqueToken();
  const refreshExpiresAt = new Date(
    Date.now() + env.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000
  );

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(rawRefreshToken),
    expiresAt: refreshExpiresAt,
  });

  return { accessToken, refreshToken: rawRefreshToken, refreshExpiresAt };
}

interface RefreshParams {
  rawRefreshToken: string;
  env: Env;
}

export async function refresh({ rawRefreshToken, env }: RefreshParams): Promise<AuthTokens> {
  const tokenHash = hashToken(rawRefreshToken);

  // Pre-compute new token before any database operations to minimize race window
  const newRawToken = generateOpaqueToken();
  const newTokenHash = hashToken(newRawToken);
  const now = new Date();
  const refreshExpiresAt = new Date(now.getTime() + env.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000);

  // Atomically claim the token: only succeed if token exists and is not yet revoked.
  // This ensures only one concurrent refresh() call can claim the same token.
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null },
    { revokedAt: now, replacedByTokenHash: newTokenHash },
    { returnDocument: 'before' }
  );

  if (!claimed) {
    // Atomic update found no matching document. Determine why:
    const existing = await RefreshToken.findOne({ tokenHash });
    if (!existing) {
      // Token doesn't exist at all (unknown token)
      throw new InvalidRefreshTokenError();
    }
    // Token exists but revokedAt is already set: either it was already revoked,
    // or a concurrent request just claimed it. Treat as reuse attack and revoke
    // the entire chain for that user.
    await RefreshToken.updateMany(
      { userId: existing.userId, revokedAt: null },
      { revokedAt: now }
    );
    throw new InvalidRefreshTokenError();
  }

  // Token successfully claimed. Validate it meets freshness requirements.
  if (claimed.expiresAt.getTime() < Date.now()) {
    throw new InvalidRefreshTokenError();
  }

  const user = await User.findOne({ _id: claimed.userId, active: true });
  if (!user) throw new InvalidRefreshTokenError();

  // Create the new refresh token record.
  await RefreshToken.create({ userId: user._id, tokenHash: newTokenHash, expiresAt: refreshExpiresAt });

  // Issue new access token.
  const accessToken = signAccessToken(
    { sub: String(user._id), role: user.role, tokenVersion: user.tokenVersion },
    env.jwtAccessSecret,
    env.jwtAccessExpiresIn
  );

  return { accessToken, refreshToken: newRawToken, refreshExpiresAt };
}
