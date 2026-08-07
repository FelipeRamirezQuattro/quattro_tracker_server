import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Task } from '../../../src/db/models/Task';
import { transitionTaskStatus, InvalidTransitionError, DefinitionOfReadyError } from '../../../src/services/taskStatusService';
import { AuthUser } from '../../../src/services/scope';

const admin: AuthUser = { id: 'admin1', role: 'admin', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: [] };

describe('transitionTaskStatus', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('blocks backlog -> ready when description/storyPoints/assignee are missing', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const reporterId = new mongoose.Types.ObjectId();
    const task = await Task.create({ projectId, title: 'X', reporterId, rank: 1000 });

    await expect(transitionTaskStatus(admin, String(task._id), 'ready')).rejects.toThrow(
      DefinitionOfReadyError
    );
  });

  it('allows backlog -> ready once the gate fields are set', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const reporterId = new mongoose.Types.ObjectId();
    const assigneeId = new mongoose.Types.ObjectId();
    const task = await Task.create({
      projectId, title: 'X', reporterId, rank: 1000,
      description: 'Do the thing', storyPoints: 3, assigneeId,
    });

    const updated = await transitionTaskStatus(admin, String(task._id), 'ready');
    expect(updated!.status).toBe('ready');
  });

  it('rejects a transition outside the allowed matrix', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const reporterId = new mongoose.Types.ObjectId();
    const task = await Task.create({ projectId, title: 'X', reporterId, rank: 1000 });

    await expect(transitionTaskStatus(admin, String(task._id), 'done')).rejects.toThrow(
      InvalidTransitionError
    );
  });

  it('allows done -> in_review as a reopen move', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const reporterId = new mongoose.Types.ObjectId();
    const task = await Task.create({ projectId, title: 'X', reporterId, rank: 1000, status: 'done' });

    const updated = await transitionTaskStatus(admin, String(task._id), 'in_review');
    expect(updated!.status).toBe('in_review');
  });
});
