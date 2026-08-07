import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { TimeEntry } from '../../../../src/db/models/TimeEntry';

describe('TimeEntry model', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a time entry with defaults', async () => {
    const entry = await TimeEntry.create({
      userId: new mongoose.Types.ObjectId(),
      taskId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      clientId: new mongoose.Types.ObjectId(),
      date: new Date('2026-08-10'),
      durationMinutes: 90,
    });
    expect(entry.billable).toBe(true);
    expect(entry.subtaskId).toBeNull();
    expect(entry.deletedAt).toBeNull();
  });

  it('requires userId, taskId, projectId, clientId, date, and durationMinutes', async () => {
    await expect(TimeEntry.create({} as any)).rejects.toThrow();
  });

  it('rejects a non-positive durationMinutes', async () => {
    await expect(
      TimeEntry.create({
        userId: new mongoose.Types.ObjectId(),
        taskId: new mongoose.Types.ObjectId(),
        projectId: new mongoose.Types.ObjectId(),
        clientId: new mongoose.Types.ObjectId(),
        date: new Date('2026-08-10'),
        durationMinutes: 0,
      })
    ).rejects.toThrow();
  });

  it('is excluded from find() once soft-deleted', async () => {
    const entry = await TimeEntry.create({
      userId: new mongoose.Types.ObjectId(),
      taskId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      clientId: new mongoose.Types.ObjectId(),
      date: new Date('2026-08-10'),
      durationMinutes: 30,
      deletedAt: new Date(),
    });
    const found = await TimeEntry.findById(entry._id);
    expect(found).toBeNull();
  });
});
