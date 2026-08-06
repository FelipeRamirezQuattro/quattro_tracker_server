jest.mock('../../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { PasswordResetToken } from '../../../src/db/models/PasswordResetToken';
import { hashPassword, verifyPassword } from '../../../src/helpers/password';
import { requestPasswordReset, confirmPasswordReset } from '../../../src/services/authService';
import { sendPasswordResetEmail } from '../../../src/services/emailService';
import { InvalidResetTokenError } from '../../../src/helpers/errors';
import { hashToken } from '../../../src/helpers/tokens';

const testEnv = {
  bcryptCostFactor: 4,
  emailFrom: 'noreply@example.com',
  emailPassword: 'app-password',
} as any;

describe('password reset service', () => {
  beforeAll(connectTestDb);
  afterEach(async () => {
    await clearTestDb();
    jest.clearAllMocks();
  });
  afterAll(closeTestDb);

  it('requestPasswordReset creates a token and sends an email for a real user', async () => {
    const user = await User.create({
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      passwordHash: 'h',
      role: 'admin',
    });

    await requestPasswordReset({ usernameOrEmail: 'ada@example.com', env: testEnv });

    const tokens = await PasswordResetToken.find({ userId: user._id });
    expect(tokens).toHaveLength(1);
    expect(sendPasswordResetEmail).toHaveBeenCalled();
  });

  it('requestPasswordReset does not throw for an unknown user', async () => {
    await expect(
      requestPasswordReset({ usernameOrEmail: 'nobody@example.com', env: testEnv })
    ).resolves.toBeUndefined();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('confirmPasswordReset sets the new password and marks the token used', async () => {
    const passwordHash = await hashPassword('old-password', 4);
    const user = await User.create({
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      passwordHash,
      role: 'admin',
    });

    await requestPasswordReset({ usernameOrEmail: 'ada@example.com', env: testEnv });
    const call = (sendPasswordResetEmail as jest.Mock).mock.calls[0][0];
    const rawToken = new URL(call.resetLink).searchParams.get('token')!;

    await confirmPasswordReset({ rawToken, newPassword: 'new-password', env: testEnv });

    const updated = await User.findById(user._id);
    expect(await verifyPassword('new-password', updated!.passwordHash)).toBe(true);
    expect(updated!.tokenVersion).toBe(1);

    const tokenDoc = await PasswordResetToken.findOne({ userId: user._id });
    expect(tokenDoc!.used).toBe(true);
  });

  it('confirmPasswordReset rejects an already-used token', async () => {
    const passwordHash = await hashPassword('old-password', 4);
    await User.create({
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      passwordHash,
      role: 'admin',
    });
    await requestPasswordReset({ usernameOrEmail: 'ada@example.com', env: testEnv });
    const call = (sendPasswordResetEmail as jest.Mock).mock.calls[0][0];
    const rawToken = new URL(call.resetLink).searchParams.get('token')!;

    await confirmPasswordReset({ rawToken, newPassword: 'first-new', env: testEnv });

    await expect(
      confirmPasswordReset({ rawToken, newPassword: 'second-new', env: testEnv })
    ).rejects.toThrow(InvalidResetTokenError);
  });

  it('confirmPasswordReset atomically prevents concurrent use of the same token', async () => {
    const passwordHash = await hashPassword('old-password', 4);
    const user = await User.create({
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      passwordHash,
      role: 'admin',
    });

    await requestPasswordReset({ usernameOrEmail: 'ada@example.com', env: testEnv });
    const call = (sendPasswordResetEmail as jest.Mock).mock.calls[0][0];
    const rawToken = new URL(call.resetLink).searchParams.get('token')!;

    // Launch two concurrent confirmations with the same token
    const [result1, result2] = await Promise.allSettled([
      confirmPasswordReset({ rawToken, newPassword: 'password-1', env: testEnv }),
      confirmPasswordReset({ rawToken, newPassword: 'password-2', env: testEnv }),
    ]);

    // One should succeed, one should fail (TOCTOU prevention)
    const oneSucceeded = result1.status === 'fulfilled' || result2.status === 'fulfilled';
    const oneFailed = result1.status === 'rejected' || result2.status === 'rejected';
    expect(oneSucceeded && oneFailed).toBe(true);

    // Verify only the successful one's password was applied
    const updated = await User.findById(user._id);
    const passwordMatches1 = await verifyPassword('password-1', updated!.passwordHash);
    const passwordMatches2 = await verifyPassword('password-2', updated!.passwordHash);
    expect(passwordMatches1 || passwordMatches2).toBe(true);
    expect(passwordMatches1 && passwordMatches2).toBe(false);
  });

  it('confirmPasswordReset rejects an expired but unused token', async () => {
    const passwordHash = await hashPassword('old-password', 4);
    const user = await User.create({
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      passwordHash,
      role: 'admin',
    });

    // Create an expired token manually
    const rawToken = 'manually-created-token';
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      used: false,
    });

    await expect(
      confirmPasswordReset({ rawToken, newPassword: 'new-password', env: testEnv })
    ).rejects.toThrow(InvalidResetTokenError);
  });

  it('requestPasswordReset still resolves when email send fails', async () => {
    const user = await User.create({
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      passwordHash: 'h',
      role: 'admin',
    });

    // Mock sendPasswordResetEmail to reject
    (sendPasswordResetEmail as jest.Mock).mockRejectedValueOnce(new Error('SMTP connection failed'));

    // Function should still resolve without throwing
    await expect(
      requestPasswordReset({ usernameOrEmail: 'ada@example.com', env: testEnv })
    ).resolves.toBeUndefined();

    // Token should still be created even though email failed
    const tokens = await PasswordResetToken.find({ userId: user._id });
    expect(tokens).toHaveLength(1);
  });
});
