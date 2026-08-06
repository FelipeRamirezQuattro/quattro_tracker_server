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
});
