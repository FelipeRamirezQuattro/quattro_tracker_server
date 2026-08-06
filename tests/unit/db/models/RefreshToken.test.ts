import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { RefreshToken } from '../../../../src/db/models/RefreshToken';

describe('RefreshToken model', () => {
  beforeAll(async () => {
    await connectTestDb();
    await RefreshToken.init();
  });
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a refresh token with defaults', async () => {
    const userId = new mongoose.Types.ObjectId();
    const token = await RefreshToken.create({
      userId,
      tokenHash: 'hash123',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    expect(token.revokedAt).toBeNull();
    expect(token.replacedByTokenHash).toBeNull();
  });

  it('enforces unique tokenHash', async () => {
    const userId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
    await RefreshToken.create({ userId, tokenHash: 'dup', expiresAt });
    await expect(RefreshToken.create({ userId, tokenHash: 'dup', expiresAt })).rejects.toThrow();
  });
});
