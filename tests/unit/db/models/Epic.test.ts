import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { Epic } from '../../../../src/db/models/Epic';

describe('Epic model', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates an epic with defaults', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const epic = await Epic.create({ projectId, title: 'Onboarding revamp' });
    expect(epic.status).toBe('open');
    expect(epic.deletedAt).toBeNull();
  });

  it('rejects an invalid status', async () => {
    const projectId = new mongoose.Types.ObjectId();
    await expect(
      Epic.create({ projectId, title: 'X', status: 'not-a-status' as any })
    ).rejects.toThrow();
  });

  it('requires projectId and title', async () => {
    await expect(Epic.create({} as any)).rejects.toThrow();
  });
});
