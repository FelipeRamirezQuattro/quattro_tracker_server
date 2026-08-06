import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { Sprint } from '../../../../src/db/models/Sprint';

describe('Sprint model', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a sprint with defaults', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const sprint = await Sprint.create({
      projectId,
      name: 'Sprint 1',
      startDate: new Date('2026-08-10'),
      endDate: new Date('2026-08-24'),
    });
    expect(sprint.status).toBe('planned');
    expect(sprint.deletedAt).toBeNull();
  });

  it('requires startDate and endDate', async () => {
    const projectId = new mongoose.Types.ObjectId();
    await expect(Sprint.create({ projectId, name: 'No dates' } as any)).rejects.toThrow();
  });
});
