import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Task } from '../../../src/db/models/Task';
import { User } from '../../../src/db/models/User';
import { TimeEntry } from '../../../src/db/models/TimeEntry';
import { hashPassword } from '../../../src/helpers/password';
import { reportByUser, reportTimeline } from '../../../src/services/reportService';

describe('reportService — byUser / timeline', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('groups a user\'s time by client+project and computes cost from their current rate', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const task = await Task.create({ projectId: project._id, title: 'X', reporterId: client._id, rank: 1000 });
    const alice = await User.create({ name: 'Alice', username: 'alice', passwordHash, role: 'user', hourlyRate: 50 });

    await TimeEntry.create({ userId: alice._id, taskId: task._id, projectId: project._id, clientId: client._id, date: new Date('2026-08-05'), durationMinutes: 120 });

    const report = await reportByUser(String(alice._id), { from: '2026-08-01', to: '2026-08-31' });
    expect(report.totalMinutes).toBe(120);
    expect(report.totalCost).toBeCloseTo(100);
    expect(report.byClientProject).toHaveLength(1);
    expect(report.byClientProject[0].clientName).toBe('Acme');
    expect(report.byClientProject[0].projectName).toBe('Website');
  });

  // Finding 2 (part 2): reportByUser's $unwind: '$client'/'$project' are also
  // inner joins — an orphaned clientId/projectId reference (e.g. the
  // referenced Project was hard-removed) must not silently drop that row's
  // minutes from totalMinutes.
  it('still counts an entry with an orphaned projectId toward totalMinutes', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const task = await Task.create({ projectId: new mongoose.Types.ObjectId(), title: 'X', reporterId: client._id, rank: 1000 });
    const alice = await User.create({ name: 'Alice', username: 'alice-orphanproj', passwordHash, role: 'user', hourlyRate: 50 });
    const orphanProjectId = new mongoose.Types.ObjectId();

    await TimeEntry.create({
      userId: alice._id, taskId: task._id, projectId: orphanProjectId, clientId: client._id,
      date: new Date('2026-08-05'), durationMinutes: 45,
    });

    const report = await reportByUser(String(alice._id), { from: '2026-08-01', to: '2026-08-31' });
    expect(report.totalMinutes).toBe(45);
    expect(report.byClientProject).toHaveLength(1);
    expect(report.byClientProject[0].projectName).toBeNull();
    expect(String(report.byClientProject[0].projectId)).toBe(String(orphanProjectId));
  });

  // Finding 4: reportByUser computed cost via User.findById(userId), which
  // goes through softDeletePlugin's pre(/^find/) hook and returns null for a
  // soft-deleted user (cost falls back to 0) — but userBreakdown's $lookup
  // (used by reportByProject/reportByClient) runs inside .aggregate(), which
  // that plugin does NOT hook, so the same soft-deleted user's real
  // hourlyRate IS applied there. Assert reportByUser now matches.
  it('applies a soft-deleted user\'s real hourlyRate, consistent with reportByProject/reportByClient', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const task = await Task.create({ projectId: project._id, title: 'X', reporterId: client._id, rank: 1000 });
    const alice = await User.create({ name: 'Alice', username: 'alice-softdeleted', passwordHash, role: 'user', hourlyRate: 80 });

    alice.deletedAt = new Date();
    await alice.save();

    await TimeEntry.create({
      userId: alice._id, taskId: task._id, projectId: project._id, clientId: client._id,
      date: new Date('2026-08-05'), durationMinutes: 60,
    });

    const report = await reportByUser(String(alice._id), { from: '2026-08-01', to: '2026-08-31' });
    expect(report.totalMinutes).toBe(60);
    expect(report.totalCost).toBeCloseTo(80);
  });

  it('buckets a project\'s time into a daily timeline, sorted ascending', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const task = await Task.create({ projectId: project._id, title: 'X', reporterId: client._id, rank: 1000 });
    const userId = client._id;

    await TimeEntry.create({ userId, taskId: task._id, projectId: project._id, clientId: client._id, date: new Date('2026-08-02'), durationMinutes: 30 });
    await TimeEntry.create({ userId, taskId: task._id, projectId: project._id, clientId: client._id, date: new Date('2026-08-01'), durationMinutes: 60 });

    const timeline = await reportTimeline('project', String(project._id), { from: '2026-08-01', to: '2026-08-31' }, 'day');
    expect(timeline).toHaveLength(2);
    expect(new Date(timeline[0].bucket).getUTCDate()).toBe(1);
    expect(timeline[0].totalMinutes).toBe(60);
  });
});
