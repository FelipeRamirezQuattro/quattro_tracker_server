import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { Task } from '../../../../src/db/models/Task';

describe('Task model', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a task with defaults', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const reporterId = new mongoose.Types.ObjectId();
    const task = await Task.create({ projectId, title: 'Set up CI', reporterId, rank: 1000 });

    expect(task.status).toBe('backlog');
    expect(task.priority).toBe('medium');
    expect(task.isBlocked).toBe(false);
    expect(task.epicId).toBeNull();
    expect(task.sprintId).toBeNull();
    expect(task.assigneeId).toBeNull();
    expect(task.storyPoints).toBeNull();
    expect(task.labels).toEqual([]);
    expect(task.subtasks).toEqual([]);
    expect(task.deletedAt).toBeNull();
  });

  it('rejects an invalid status or priority', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const reporterId = new mongoose.Types.ObjectId();
    await expect(
      Task.create({ projectId, title: 'X', reporterId, rank: 1, status: 'nope' as any })
    ).rejects.toThrow();
    await expect(
      Task.create({ projectId, title: 'X', reporterId, rank: 1, priority: 'nope' as any })
    ).rejects.toThrow();
  });

  it('requires projectId, title, reporterId, and rank', async () => {
    await expect(Task.create({} as any)).rejects.toThrow();
  });

  it('embeds subtasks with their own _id and status default', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const reporterId = new mongoose.Types.ObjectId();
    const task = await Task.create({
      projectId,
      title: 'Parent',
      reporterId,
      rank: 1,
      subtasks: [{ title: 'Child' }],
    });
    expect(task.subtasks[0]._id).toBeDefined();
    expect(task.subtasks[0].status).toBe('backlog');
  });
});
