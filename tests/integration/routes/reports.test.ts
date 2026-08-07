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

describe('reports routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('returns a by-project report for an admin', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const task = await Task.create({ projectId: project._id, title: 'X', reporterId: client._id, rank: 1000 });
    await TimeEntry.create({ userId: admin._id, taskId: task._id, projectId: project._id, clientId: client._id, date: new Date('2026-08-05'), durationMinutes: 60 });
    const auth = await authHeaderFor(admin);

    const res = await request(app)
      .get('/api/reports/by-project')
      .query({ projectId: String(project._id), from: '2026-08-01', to: '2026-08-31' })
      .set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.data.totalMinutes).toBe(60);
  });

  it('403s a non-admin user on every report endpoint', async () => {
    const passwordHash = await hashPassword('x', 4);
    const user = await User.create({ name: 'Employee', username: 'employee', passwordHash, role: 'user' });
    const auth = await authHeaderFor(user);

    const res = await request(app)
      .get('/api/reports/by-project')
      .query({ projectId: 'x', from: '2026-08-01', to: '2026-08-31' })
      .set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  // Finding 3: reportService's exported functions call
  // `new mongoose.Types.ObjectId(id)` directly, outside any try/catch — an
  // invalid id string throws uncaught and previously surfaced as a generic
  // 500 instead of a 400, since these are query params.
  it('400s /by-project on an invalid projectId (not 500)', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin-badproject', passwordHash, role: 'admin' });
    const auth = await authHeaderFor(admin);

    const res = await request(app)
      .get('/api/reports/by-project')
      .query({ projectId: 'not-a-valid-id', from: '2026-08-01', to: '2026-08-31' })
      .set('Authorization', auth);
    expect(res.status).toBe(400);
  });

  it('400s /by-project on an invalid from date (not 500)', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin-baddate', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const auth = await authHeaderFor(admin);

    const res = await request(app)
      .get('/api/reports/by-project')
      .query({ projectId: String(project._id), from: 'not-a-date', to: '2026-08-31' })
      .set('Authorization', auth);
    expect(res.status).toBe(400);
  });

  it('400s the timeline endpoint on an invalid granularity', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const auth = await authHeaderFor(admin);

    const res = await request(app)
      .get('/api/reports/timeline')
      .query({ scope: 'project', scopeId: 'x', from: '2026-08-01', to: '2026-08-31', granularity: 'fortnight' })
      .set('Authorization', auth);
    expect(res.status).toBe(400);
  });
});
