import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { PasswordResetToken } from '../../../../src/db/models/PasswordResetToken';

describe('PasswordResetToken model', () => {
  beforeAll(async () => {
    await connectTestDb();
    await PasswordResetToken.init();
  });
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a reset token with defaults', async () => {
    const userId = new mongoose.Types.ObjectId();
    const token = await PasswordResetToken.create({
      userId,
      tokenHash: 'hash123',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    expect(token.used).toBe(false);
  });

  it('enforces unique tokenHash', async () => {
    const userId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
    await PasswordResetToken.create({ userId, tokenHash: 'dup', expiresAt });
    await expect(PasswordResetToken.create({ userId, tokenHash: 'dup', expiresAt })).rejects.toThrow();
  });
});
