import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Task } from '../../../src/db/models/Task';
import { User } from '../../../src/db/models/User';
import { TimeEntry } from '../../../src/db/models/TimeEntry';
import { hashPassword } from '../../../src/helpers/password';
import { reportByProject, reportByClient } from '../../../src/services/reportService';

describe('reportService — byProject / byClient', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('totals minutes/cost by user for a project, using each user\'s current hourlyRate', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const task = await Task.create({ projectId: project._id, title: 'X', reporterId: client._id, rank: 1000 });
    const alice = await User.create({ name: 'Alice', username: 'alice', passwordHash, role: 'user', hourlyRate: 60 });
    const bob = await User.create({ name: 'Bob', username: 'bob', passwordHash, role: 'user', hourlyRate: 30 });

    await TimeEntry.create({
      userId: alice._id, taskId: task._id, projectId: project._id, clientId: client._id,
      date: new Date('2026-08-05'), durationMinutes: 120, billable: true,
    });
    await TimeEntry.create({
      userId: bob._id, taskId: task._id, projectId: project._id, clientId: client._id,
      date: new Date('2026-08-06'), durationMinutes: 60, billable: false,
    });
    // out of range — must not be counted
    await TimeEntry.create({
      userId: alice._id, taskId: task._id, projectId: project._id, clientId: client._id,
      date: new Date('2026-09-01'), durationMinutes: 999,
    });

    const report = await reportByProject(String(project._id), { from: '2026-08-01', to: '2026-08-31' });

    expect(report.totalMinutes).toBe(180);
    expect(report.billableMinutes).toBe(120);
    expect(report.totalCost).toBeCloseTo(120 * (60 / 60) + 60 * (30 / 60));
    expect(report.byUser).toHaveLength(2);
    const aliceRow = report.byUser.find((r) => r.name === 'Alice')!;
    expect(aliceRow.totalMinutes).toBe(120);
    expect(aliceRow.cost).toBeCloseTo(120);
  });

  it('excludes soft-deleted entries', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const task = await Task.create({ projectId: project._id, title: 'X', reporterId: client._id, rank: 1000 });
    const alice = await User.create({ name: 'Alice', username: 'alice', passwordHash, role: 'user', hourlyRate: 60 });

    await TimeEntry.create({
      userId: alice._id, taskId: task._id, projectId: project._id, clientId: client._id,
      date: new Date('2026-08-05'), durationMinutes: 120, deletedAt: new Date(),
    });

    const report = await reportByProject(String(project._id), { from: '2026-08-01', to: '2026-08-31' });
    expect(report.totalMinutes).toBe(0);
  });

  it('rolls up by-project totals for a client', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const projectA = await Project.create({ clientId: client._id, name: 'Website' });
    const projectB = await Project.create({ clientId: client._id, name: 'Mobile' });
    const taskA = await Task.create({ projectId: projectA._id, title: 'X', reporterId: client._id, rank: 1000 });
    const taskB = await Task.create({ projectId: projectB._id, title: 'Y', reporterId: client._id, rank: 1000 });
    const alice = await User.create({ name: 'Alice', username: 'alice', passwordHash, role: 'user', hourlyRate: 60 });

    await TimeEntry.create({ userId: alice._id, taskId: taskA._id, projectId: projectA._id, clientId: client._id, date: new Date('2026-08-05'), durationMinutes: 60 });
    await TimeEntry.create({ userId: alice._id, taskId: taskB._id, projectId: projectB._id, clientId: client._id, date: new Date('2026-08-06'), durationMinutes: 30 });

    const report = await reportByClient(String(client._id), { from: '2026-08-01', to: '2026-08-31' });
    expect(report.totalMinutes).toBe(90);
    expect(report.byProject).toHaveLength(2);
  });

  // Finding 2: userBreakdown's $lookup + default $unwind is an inner join, so
  // a TimeEntry whose userId doesn't match any User document was previously
  // dropped from BOTH the per-user rows and the grand totals reduced over
  // them. Insert the orphaned TimeEntry directly via the model (bypassing
  // createTimeEntry, which now blocks this at creation time per Finding 2
  // part 3) to simulate a pre-existing orphaned record.
  it('still counts an entry with an orphaned userId toward the grand total', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const task = await Task.create({ projectId: project._id, title: 'X', reporterId: client._id, rank: 1000 });
    const orphanUserId = new mongoose.Types.ObjectId();

    await TimeEntry.create({
      userId: orphanUserId, taskId: task._id, projectId: project._id, clientId: client._id,
      date: new Date('2026-08-05'), durationMinutes: 90, billable: true,
    });

    const report = await reportByProject(String(project._id), { from: '2026-08-01', to: '2026-08-31' });
    expect(report.totalMinutes).toBe(90);
    expect(report.billableMinutes).toBe(90);
    expect(report.byUser).toHaveLength(1);
    expect(String(report.byUser[0].userId)).toBe(String(orphanUserId));
    expect(report.byUser[0].name).toBeNull();
  });
});
