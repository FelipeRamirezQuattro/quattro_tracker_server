import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Sprint } from '../../../src/db/models/Sprint';
import { Task } from '../../../src/db/models/Task';
import { User } from '../../../src/db/models/User';
import { hashPassword } from '../../../src/helpers/password';
import { reportVelocity } from '../../../src/services/reportService';

describe('reportService — velocity', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('sums completed-task story points per completed sprint, ordered by end date', async () => {
    const passwordHash = await hashPassword('x', 4);
    const reporter = await User.create({ name: 'Rep', username: 'rep', passwordHash, role: 'user' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });

    const sprint1 = await Sprint.create({
      projectId: project._id, name: 'Sprint 1', status: 'completed',
      startDate: new Date('2026-07-01'), endDate: new Date('2026-07-14'),
    });
    const sprint2 = await Sprint.create({
      projectId: project._id, name: 'Sprint 2', status: 'completed',
      startDate: new Date('2026-07-15'), endDate: new Date('2026-07-28'),
    });
    // not completed — must be excluded
    await Sprint.create({
      projectId: project._id, name: 'Sprint 3 (active)', status: 'active',
      startDate: new Date('2026-07-29'), endDate: new Date('2026-08-11'),
    });

    await Task.create({ projectId: project._id, sprintId: sprint1._id, title: 'A', status: 'done', storyPoints: 5, reporterId: reporter._id, rank: 1000 });
    await Task.create({ projectId: project._id, sprintId: sprint1._id, title: 'B', status: 'done', storyPoints: 3, reporterId: reporter._id, rank: 2000 });
    // not done — must be excluded from sprint1's total
    await Task.create({ projectId: project._id, sprintId: sprint1._id, title: 'C', status: 'in_progress', storyPoints: 8, reporterId: reporter._id, rank: 3000 });
    await Task.create({ projectId: project._id, sprintId: sprint2._id, title: 'D', status: 'done', storyPoints: 2, reporterId: reporter._id, rank: 1000 });

    const result = await reportVelocity(String(project._id));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ sprintName: 'Sprint 1', completedPoints: 8 });
    expect(result[1]).toMatchObject({ sprintName: 'Sprint 2', completedPoints: 2 });
  });

  it('treats a done task with no story points as zero, not a crash', async () => {
    const passwordHash = await hashPassword('x', 4);
    const reporter = await User.create({ name: 'Rep', username: 'rep', passwordHash, role: 'user' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const sprint = await Sprint.create({
      projectId: project._id, name: 'Sprint 1', status: 'completed',
      startDate: new Date('2026-07-01'), endDate: new Date('2026-07-14'),
    });
    await Task.create({ projectId: project._id, sprintId: sprint._id, title: 'A', status: 'done', reporterId: reporter._id, rank: 1000 });

    const result = await reportVelocity(String(project._id));

    expect(result[0].completedPoints).toBe(0);
  });
});
