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

describe('subtask routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('adds, updates, and removes a subtask on a task', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const auth = await authHeaderFor(admin);

    const taskRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', auth)
      .send({ projectId: project._id, title: 'Parent task' });
    const taskId = taskRes.body.data._id;

    const addRes = await request(app)
      .post(`/api/tasks/${taskId}/subtasks`)
      .set('Authorization', auth)
      .send({ title: 'Child task' });
    expect(addRes.status).toBe(201);
    expect(addRes.body.data.subtasks).toHaveLength(1);
    const subtaskId = addRes.body.data.subtasks[0]._id;

    const updateRes = await request(app)
      .put(`/api/tasks/${taskId}/subtasks/${subtaskId}`)
      .set('Authorization', auth)
      .send({ status: 'in_progress' });
    expect(updateRes.body.data.subtasks[0].status).toBe('in_progress');

    const deleteRes = await request(app)
      .delete(`/api/tasks/${taskId}/subtasks/${subtaskId}`)
      .set('Authorization', auth);
    expect(deleteRes.body.data.subtasks).toHaveLength(0);
  });
});
