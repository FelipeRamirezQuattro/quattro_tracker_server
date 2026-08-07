// AuthUser.id is always a real Mongoose ObjectId hex string in production —
// it comes straight from the JWT's `sub: String(user._id)` (see
// helpers/jwt.ts / middlewares/requireAuth.ts). TimeEntry.userId is an
// ObjectId ref (Task 1), so every AuthUser fixture below uses a real
// mongoose.Types.ObjectId, not a human-readable placeholder — a plain
// string like 'user1' would fail Mongoose's cast on TimeEntry.create().
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Task } from '../../../src/db/models/Task';
import { TimeEntry } from '../../../src/db/models/TimeEntry';
import { User } from '../../../src/db/models/User';
import { hashPassword } from '../../../src/helpers/password';
import {
  createTimeEntry,
  listTimeEntries,
  updateTimeEntry,
  deleteTimeEntry,
} from '../../../src/services/timeEntryService';
import { AuthUser } from '../../../src/services/scope';

async function seedTask() {
  const client = await Client.create({ name: 'Acme' });
  const project = await Project.create({ clientId: client._id, name: 'Website' });
  const reporterId = new mongoose.Types.ObjectId();
  const task = await Task.create({ projectId: project._id, title: 'Build homepage', reporterId, rank: 1000 });
  return { client, project, task };
}

function authUserFor(id: mongoose.Types.ObjectId, overrides: Partial<AuthUser> = {}): AuthUser {
  return { id: String(id), role: 'user', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: [], ...overrides };
}

describe('timeEntryService', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('denormalizes projectId and clientId from the task at create time', async () => {
    const { client, project, task } = await seedTask();
    const userId = new mongoose.Types.ObjectId();
    const user = authUserFor(userId, { assignedProjectIds: [String(project._id)] });

    const entry = await createTimeEntry(user, {
      taskId: String(task._id), date: '2026-08-10', durationMinutes: 45,
    });

    expect(entry).not.toBeNull();
    expect(String(entry!.projectId)).toBe(String(project._id));
    expect(String(entry!.clientId)).toBe(String(client._id));
    expect(String(entry!.userId)).toBe(String(userId));
  });

  it('refuses to log time against a task outside the user\'s assignedProjectIds', async () => {
    const { task } = await seedTask();
    const outsider = authUserFor(new mongoose.Types.ObjectId(), {
      assignedProjectIds: [String(new mongoose.Types.ObjectId())],
    });

    const entry = await createTimeEntry(outsider, { taskId: String(task._id), date: '2026-08-10', durationMinutes: 30 });
    expect(entry).toBeNull();
  });

  it('lets an admin log time on behalf of another user via userId', async () => {
    const { task } = await seedTask();
    const admin = authUserFor(new mongoose.Types.ObjectId(), { role: 'admin' });
    // Finding 2 (part 3): createTimeEntry now validates an admin-supplied
    // userId against a live User document, so the target must be real.
    const passwordHash = await hashPassword('x', 4);
    const employee = await User.create({ name: 'Employee', username: 'behalf-employee', passwordHash, role: 'user' });

    const entry = await createTimeEntry(admin, {
      taskId: String(task._id), date: '2026-08-10', durationMinutes: 60, userId: String(employee._id),
    });
    expect(String(entry!.userId)).toBe(String(employee._id));
  });

  it('forces userId to self for a non-admin even if userId is passed in the body', async () => {
    const { project, task } = await seedTask();
    const userId = new mongoose.Types.ObjectId();
    const user = authUserFor(userId, { assignedProjectIds: [String(project._id)] });

    const entry = await createTimeEntry(user, {
      taskId: String(task._id), date: '2026-08-10', durationMinutes: 20, userId: String(new mongoose.Types.ObjectId()),
    });
    expect(String(entry!.userId)).toBe(String(userId));
  });

  it('only returns the caller\'s own entries to a non-admin, regardless of a userId filter', async () => {
    const { project, task } = await seedTask();
    const userId = new mongoose.Types.ObjectId();
    const user = authUserFor(userId, { assignedProjectIds: [String(project._id)] });
    const otherUserId = new mongoose.Types.ObjectId();
    await createTimeEntry(user, { taskId: String(task._id), date: '2026-08-10', durationMinutes: 20 });
    await TimeEntry.create({
      userId: otherUserId, taskId: task._id, projectId: project._id, clientId: project.clientId,
      date: new Date('2026-08-10'), durationMinutes: 40,
    });

    const results = await listTimeEntries(user, { userId: String(otherUserId) });
    expect(results).toHaveLength(1);
    expect(String(results[0].userId)).toBe(String(userId));
  });

  it('lets the owner update their own entry but not another user\'s', async () => {
    const { project, task } = await seedTask();
    const userId = new mongoose.Types.ObjectId();
    const user = authUserFor(userId, { assignedProjectIds: [String(project._id)] });
    const entry = await createTimeEntry(user, { taskId: String(task._id), date: '2026-08-10', durationMinutes: 20 });

    const updated = await updateTimeEntry(user, String(entry!._id), { durationMinutes: 25 });
    expect(updated!.durationMinutes).toBe(25);

    const other = authUserFor(new mongoose.Types.ObjectId(), { assignedProjectIds: [String(project._id)] });
    const blocked = await updateTimeEntry(other, String(entry!._id), { durationMinutes: 99 });
    expect(blocked).toBeNull();
  });

  it('soft-deletes rather than removing the document', async () => {
    const { project, task } = await seedTask();
    const userId = new mongoose.Types.ObjectId();
    const user = authUserFor(userId, { assignedProjectIds: [String(project._id)] });
    const entry = await createTimeEntry(user, { taskId: String(task._id), date: '2026-08-10', durationMinutes: 20 });

    const deleted = await deleteTimeEntry(user, String(entry!._id));
    expect(deleted!.deletedAt).not.toBeNull();
    expect(await TimeEntry.findById(entry!._id)).toBeNull();
  });

  // Finding 1: findOneAndUpdate skips schema validators by default, so a PUT
  // with durationMinutes: 0 or negative previously persisted successfully,
  // bypassing TimeEntry.durationMinutes' `min: 1` constraint and silently
  // corrupting every report's $sum. runValidators: true must make this reject.
  it('rejects an update that sets durationMinutes to zero or negative', async () => {
    const { project, task } = await seedTask();
    const userId = new mongoose.Types.ObjectId();
    const user = authUserFor(userId, { assignedProjectIds: [String(project._id)] });
    const entry = await createTimeEntry(user, { taskId: String(task._id), date: '2026-08-10', durationMinutes: 20 });

    await expect(updateTimeEntry(user, String(entry!._id), { durationMinutes: 0 })).rejects.toThrow(
      mongoose.Error.ValidationError
    );
    await expect(updateTimeEntry(user, String(entry!._id), { durationMinutes: -5 })).rejects.toThrow(
      mongoose.Error.ValidationError
    );

    const unchanged = await TimeEntry.findById(entry!._id);
    expect(unchanged!.durationMinutes).toBe(20);
  });

  // Finding 2 (part 3): an admin could previously set data.userId to any
  // castable ObjectId string with zero validation that a User actually
  // exists, which is exactly what let orphaned-userId TimeEntry rows into
  // the report aggregations in the first place.
  it('rejects an admin-supplied userId that does not correspond to a real user', async () => {
    const { task } = await seedTask();
    const admin = authUserFor(new mongoose.Types.ObjectId(), { role: 'admin' });
    const bogusUserId = new mongoose.Types.ObjectId();

    const entry = await createTimeEntry(admin, {
      taskId: String(task._id), date: '2026-08-10', durationMinutes: 30, userId: String(bogusUserId),
    });
    expect(entry).toBeNull();
  });
});
