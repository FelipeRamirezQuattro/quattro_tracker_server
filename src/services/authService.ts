import { Env } from '../config/env';
import { User } from '../db/models/User';
import { RefreshToken } from '../db/models/RefreshToken';
import { verifyPassword } from '../helpers/password';
import { generateOpaqueToken, hashToken } from '../helpers/tokens';
import { signAccessToken } from '../helpers/jwt';
import { InvalidCredentialsError } from '../helpers/errors';

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
