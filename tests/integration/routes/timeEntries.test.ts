import request from 'supertest';
import { createApp } from '../../../src/app';
import { loadEnv } from '../../../src/config/env';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Task } from '../../../src/db/models/Task';
import { TimeEntry } from '../../../src/db/models/TimeEntry';
import { hashPassword } from '../../../src/helpers/password';
import { signAccessToken } from '../../../src/helpers/jwt';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_SECRET = 'test-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS = '30';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.BCRYPT_COST_FACTOR = '4';

const env = loadEnv();
const app = createApp(env);

async function authHeaderFor(user: any) {
  const token = signAccessToken(
    { sub: String(user._id), role: user.role, tokenVersion: user.tokenVersion },
    env.jwtAccessSecret,
    env.jwtAccessExpiresIn
  );
  return `Bearer ${token}`;
}

describe('time-entries routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('lets a scoped user log time against a task in their project', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const reporterId = client._id;
    const task = await Task.create({ projectId: project._id, title: 'Build homepage', reporterId, rank: 1000 });
    const user = await User.create({
      name: 'Employee', username: 'employee', passwordHash, role: 'user',
      assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(user);

    const res = await request(app)
      .post('/api/time-entries')
      .set('Authorization', auth)
      .send({ taskId: String(task._id), date: '2026-08-10', durationMinutes: 90 });

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(String(user._id));
    expect(res.body.data.projectId).toBe(String(project._id));
  });

  it('403s a final_user hitting time-entries at all', async () => {
    const passwordHash = await hashPassword('x', 4);
    const finalUser = await User.create({ name: 'Client Contact', username: 'contact', passwordHash, role: 'final_user' });
    const auth = await authHeaderFor(finalUser);

    const res = await request(app).get('/api/time-entries').set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('hides another user\'s entry from GET /:id for a non-admin', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const task = await Task.create({ projectId: project._id, title: 'X', reporterId: client._id, rank: 1000 });
    const owner = await User.create({ name: 'Owner', username: 'owner', passwordHash, role: 'user', assignedProjectIds: [project._id] });
    const other = await User.create({ name: 'Other', username: 'other', passwordHash, role: 'user', assignedProjectIds: [project._id] });
    const ownerAuth = await authHeaderFor(owner);
    const otherAuth = await authHeaderFor(other);

    const createRes = await request(app)
      .post('/api/time-entries')
      .set('Authorization', ownerAuth)
      .send({ taskId: String(task._id), date: '2026-08-10', durationMinutes: 30 });
    const entryId = createRes.body.data._id;

    const res = await request(app).get(`/api/time-entries/${entryId}`).set('Authorization', otherAuth);
    expect(res.status).toBe(404);
  });

  // Finding 1: PUT /:id previously had no mongoose.Error.ValidationError catch
  // branch (unlike POST /), so a durationMinutes' min:1 violation surfaced as
  // 500 instead of 400 once runValidators: true was added to updateTimeEntry.
  it('400s PUT /:id when durationMinutes is invalid', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const task = await Task.create({ projectId: project._id, title: 'X', reporterId: client._id, rank: 1000 });
    const owner = await User.create({ name: 'Owner', username: 'putowner', passwordHash, role: 'user', assignedProjectIds: [project._id] });
    const ownerAuth = await authHeaderFor(owner);

    const createRes = await request(app)
      .post('/api/time-entries')
      .set('Authorization', ownerAuth)
      .send({ taskId: String(task._id), date: '2026-08-10', durationMinutes: 30 });
    const entryId = createRes.body.data._id;

    const res = await request(app)
      .put(`/api/time-entries/${entryId}`)
      .set('Authorization', ownerAuth)
      .send({ durationMinutes: -5 });

    expect(res.status).toBe(400);

    const stored = await TimeEntry.findById(entryId);
    expect(stored!.durationMinutes).toBe(30);
  });
});
