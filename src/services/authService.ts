import { Env } from '../config/env';
import { User } from '../db/models/User';
import { RefreshToken } from '../db/models/RefreshToken';
import { PasswordResetToken } from '../db/models/PasswordResetToken';
import { hashPassword, verifyPassword } from '../helpers/password';
import { generateOpaqueToken, hashToken } from '../helpers/tokens';
import { signAccessToken } from '../helpers/jwt';
import { InvalidCredentialsError, InvalidRefreshTokenError, InvalidResetTokenError } from '../helpers/errors';
import { sendPasswordResetEmail } from './emailService';

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

  // Atomically claim the token: only succeed if token exists, is not yet revoked, and has not expired.
  // This ensures only one concurrent refresh() call can claim the same token, and expired tokens
  // are never mutated (preventing DoS where expired tokens could be replayed to revoke all sessions).
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { revokedAt: now, replacedByTokenHash: newTokenHash },
    { returnDocument: 'before' }
  );

  if (!claimed) {
    // Atomic update found no matching document. Determine why:
    const existing = await RefreshToken.findOne({ tokenHash });
    if (!existing) {
      // Case 1: Token doesn't exist at all (unknown token)
      throw new InvalidRefreshTokenError();
    }
    // Token exists. Determine if it's revoked (Case 2) or expired (Case 3):
    if (existing.revokedAt) {
      // Case 2: Token exists but revokedAt is already set (genuine reuse or a race loser).
      // Treat as reuse attack and revoke the entire chain for that user.
      await RefreshToken.updateMany(
        { userId: existing.userId, revokedAt: null },
        { revokedAt: now }
      );
      throw new InvalidRefreshTokenError();
    }
    // Case 3: Token exists, revokedAt is null, but expiresAt is in the past.
    // This is a benign expired token that was never touched. Reject without chain revocation.
    throw new InvalidRefreshTokenError();
  }

  // Token successfully claimed. It passed all atomic checks (not revoked, not expired),
  // so no need to re-check expiry here.
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

export async function logout({ rawRefreshToken }: { rawRefreshToken: string }): Promise<void> {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
    { revokedAt: new Date() }
  );
}

interface ChangePasswordParams {
  userId: string;
  currentPassword: string;
  newPassword: string;
  env: Env;
}

export async function changePassword({
  userId,
  currentPassword,
  newPassword,
  env,
}: ChangePasswordParams): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw new InvalidCredentialsError();

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new InvalidCredentialsError();

  user.passwordHash = await hashPassword(newPassword, env.bcryptCostFactor);
  user.tokenVersion += 1;
  await user.save();

  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
}

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function requestPasswordReset({
  usernameOrEmail,
  env,
}: {
  usernameOrEmail: string;
  env: Env;
}): Promise<void> {
  const user = await User.findOne({
    active: true,
    $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
  });
  if (!user || !user.email) return;

  const rawToken = generateOpaqueToken();
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
  });

  const resetLink = `https://app.example.com/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail({ to: user.email, resetLink, env });
}

export async function confirmPasswordReset({
  rawToken,
  newPassword,
  env,
}: {
  rawToken: string;
  newPassword: string;
  env: Env;
}): Promise<void> {
  const tokenDoc = await PasswordResetToken.findOne({ tokenHash: hashToken(rawToken) });
  if (!tokenDoc || tokenDoc.used || tokenDoc.expiresAt.getTime() < Date.now()) {
    throw new InvalidResetTokenError();
  }

  const user = await User.findById(tokenDoc.userId);
  if (!user) throw new InvalidResetTokenError();

  user.passwordHash = await hashPassword(newPassword, env.bcryptCostFactor);
  user.tokenVersion += 1;
  await user.save();

  tokenDoc.used = true;
  await tokenDoc.save();

  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
}
