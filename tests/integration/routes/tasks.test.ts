import request from 'supertest';
import { createApp } from '../../../src/app';
import { loadEnv } from '../../../src/config/env';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
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

describe('tasks routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a task in the backlog with an auto-assigned rank, and lists it back', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const auth = await authHeaderFor(admin);

    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', auth)
      .send({ projectId: project._id, title: 'Set up CI' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe('backlog');
    expect(createRes.body.data.reporterId).toBe(String(admin._id));
    expect(createRes.body.data.rank).toBe(1000);

    const secondRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', auth)
      .send({ projectId: project._id, title: 'Write docs' });
    expect(secondRes.body.data.rank).toBe(2000);

    const listRes = await request(app)
      .get(`/api/tasks?projectId=${project._id}`)
      .set('Authorization', auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(2);
  });

  it('rejects a status change via the general update endpoint', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const auth = await authHeaderFor(admin);

    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', auth)
      .send({ projectId: project._id, title: 'Set up CI' });
    const taskId = createRes.body.data._id;

    const updateRes = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', auth)
      .send({ status: 'done', priority: 'high' });

    expect(updateRes.body.data.status).toBe('backlog');
    expect(updateRes.body.data.priority).toBe('high');
  });

  it('blocks final_user entirely', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const contact = await User.create({
      name: 'Contact', username: 'contact', passwordHash, role: 'final_user',
      assignedClientIds: [client._id], assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(contact);

    const res = await request(app)
      .get(`/api/tasks?projectId=${project._id}`)
      .set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('hides a task from a user scoped to a different project, both by id and by list', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const projectA = await Project.create({ clientId: client._id, name: 'Project A' });
    const projectB = await Project.create({ clientId: client._id, name: 'Project B' });
    const adminAuth = await authHeaderFor(admin);

    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', adminAuth)
      .send({ projectId: projectA._id, title: 'Set up CI' });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.data._id;

    const scopedUser = await User.create({
      name: 'Scoped', username: 'scoped', passwordHash, role: 'user',
      assignedProjectIds: [projectB._id],
    });
    const scopedAuth = await authHeaderFor(scopedUser);

    const getRes = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', scopedAuth);
    expect(getRes.status).toBe(404);

    const listRes = await request(app)
      .get(`/api/tasks?projectId=${projectA._id}`)
      .set('Authorization', scopedAuth);
    expect(listRes.status).toBe(404);
  });
});
