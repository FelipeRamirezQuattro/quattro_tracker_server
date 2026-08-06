import request from 'supertest';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { createApp } from '../../../src/app';
import { User } from '../../../src/db/models/User';
import { Client } from '../../../src/db/models/Client';
import { hashPassword } from '../../../src/helpers/password';

const testEnv = {
  nodeEnv: 'test',
  jwtAccessSecret: 'test-secret',
  jwtAccessExpiresIn: '15m',
  refreshTokenExpiresInDays: 30,
  bcryptCostFactor: 4,
  corsOrigins: ['http://localhost:3000'],
} as any;

async function loginAs(app: any, username: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.data.accessToken as string;
}

describe('client routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('admin can create, list, update, and delete a client', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const createRes = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Co' });
    expect(createRes.status).toBe(201);
    const clientId = createRes.body.data._id;

    const listRes = await request(app).get('/api/clients').set('Authorization', `Bearer ${token}`);
    expect(listRes.body.data).toHaveLength(1);

    const updateRes = await request(app)
      .put(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Corp' });
    expect(updateRes.body.data.name).toBe('Acme Corp');

    const deleteRes = await request(app)
      .delete(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    const listAfterDelete = await request(app)
      .get('/api/clients')
      .set('Authorization', `Bearer ${token}`);
    expect(listAfterDelete.body.data).toHaveLength(0);
  });

  it('final_user only sees their assigned clients', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    const visibleClient = await Client.create({ name: 'Visible Co' });
    await Client.create({ name: 'Hidden Co' });
    await User.create({
      name: 'Contact',
      username: 'contact',
      passwordHash,
      role: 'final_user',
      assignedClientIds: [visibleClient._id],
    });
    const token = await loginAs(app, 'contact', 'pw');

    const listRes = await request(app).get('/api/clients').set('Authorization', `Bearer ${token}`);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].name).toBe('Visible Co');
  });

  it('final_user cannot create a client', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Contact', username: 'contact', passwordHash, role: 'final_user' });
    const token = await loginAs(app, 'contact', 'pw');

    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Co' });
    expect(res.status).toBe(403);
  });
});
