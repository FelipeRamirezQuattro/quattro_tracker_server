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
  const existing = await RefreshToken.findOne({ tokenHash });
  if (!existing) throw new InvalidRefreshTokenError();

  if (existing.revokedAt) {
    await RefreshToken.updateMany(
      { userId: existing.userId, revokedAt: null },
      { revokedAt: new Date() }
    );
    throw new InvalidRefreshTokenError();
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    throw new InvalidRefreshTokenError();
  }

  const user = await User.findOne({ _id: existing.userId, active: true });
  if (!user) throw new InvalidRefreshTokenError();

  const newRawToken = generateOpaqueToken();
  const newTokenHash = hashToken(newRawToken);
  const refreshExpiresAt = new Date(
    Date.now() + env.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000
  );

  await RefreshToken.create({ userId: user._id, tokenHash: newTokenHash, expiresAt: refreshExpiresAt });

  existing.revokedAt = new Date();
  existing.replacedByTokenHash = newTokenHash;
  await existing.save();

  const accessToken = signAccessToken(
    { sub: String(user._id), role: user.role, tokenVersion: user.tokenVersion },
    env.jwtAccessSecret,
    env.jwtAccessExpiresIn
  );

  return { accessToken, refreshToken: newRawToken, refreshExpiresAt };
}
