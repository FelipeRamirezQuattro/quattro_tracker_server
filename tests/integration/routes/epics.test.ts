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

describe('epics routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('lets an admin create and list epics on a project', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const auth = await authHeaderFor(admin);

    const createRes = await request(app)
      .post(`/api/projects/${project._id}/epics`)
      .set('Authorization', auth)
      .send({ title: 'Launch' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe('open');

    const listRes = await request(app)
      .get(`/api/projects/${project._id}/epics`)
      .set('Authorization', auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects an epic missing a title with a 400, not a 500', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const auth = await authHeaderFor(admin);

    const res = await request(app)
      .post(`/api/projects/${project._id}/epics`)
      .set('Authorization', auth)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it('blocks a final_user from any epic route', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const contact = await User.create({
      name: 'Contact', username: 'contact', passwordHash, role: 'final_user',
      assignedClientIds: [client._id], assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(contact);

    const res = await request(app)
      .get(`/api/projects/${project._id}/epics`)
      .set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('hides an epic from a user not assigned to its project', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const outsider = await User.create({
      name: 'Outsider', username: 'outsider', passwordHash, role: 'user',
      assignedProjectIds: [],
    });
    const auth = await authHeaderFor(outsider);

    const res = await request(app)
      .get(`/api/projects/${project._id}/epics`)
      .set('Authorization', auth);
    expect(res.status).toBe(404);
  });

  it('hides an epic from a user scoped to a different project via the flat /api/epics/:id route', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const projectA = await Project.create({ clientId: client._id, name: 'Project A' });
    const projectB = await Project.create({ clientId: client._id, name: 'Project B' });
    const adminAuth = await authHeaderFor(admin);

    const createRes = await request(app)
      .post(`/api/projects/${projectA._id}/epics`)
      .set('Authorization', adminAuth)
      .send({ title: 'Launch' });
    expect(createRes.status).toBe(201);
    const epicId = createRes.body.data._id;

    const scopedUser = await User.create({
      name: 'Scoped', username: 'scoped', passwordHash, role: 'user',
      assignedProjectIds: [projectB._id],
    });
    const scopedAuth = await authHeaderFor(scopedUser);

    const res = await request(app)
      .get(`/api/epics/${epicId}`)
      .set('Authorization', scopedAuth);
    expect(res.status).toBe(404);
  });
});
