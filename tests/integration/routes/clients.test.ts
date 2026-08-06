import request from 'supertest';
import mongoose from 'mongoose';
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

  it('delete is soft-delete: record still exists with deletedAt set', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const createRes = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'To Delete' });
    const clientId = createRes.body.data._id;

    // Delete the client (soft-delete)
    await request(app)
      .delete(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${token}`);

    // Query with includeDeleted to verify it still exists with deletedAt set
    const deletedClient = await Client.findById(clientId).setOptions({ includeDeleted: true });
    expect(deletedClient).toBeDefined();
    expect(deletedClient!.deletedAt).toBeDefined();
    expect(deletedClient!.name).toBe('To Delete');
  });

  it('user can access detail of assigned client', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    const visibleClient = await Client.create({ name: 'Visible Co' });
    const adminPasswordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash: adminPasswordHash, role: 'admin' });
    const adminToken = await loginAs(app, 'admin', 'pw');

    await User.create({
      name: 'Contact',
      username: 'contact',
      passwordHash,
      role: 'final_user',
      assignedClientIds: [visibleClient._id],
    });
    const token = await loginAs(app, 'contact', 'pw');

    // User should be able to access their assigned client
    const res = await request(app)
      .get(`/api/clients/${visibleClient._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Visible Co');
  });

  it('admin can access detail of any client', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    const client1 = await Client.create({ name: 'Client 1' });
    const client2 = await Client.create({ name: 'Client 2' });
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    // Admin should be able to access any client
    const res1 = await request(app)
      .get(`/api/clients/${client1._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .get(`/api/clients/${client2._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
  });

  it('nonexistent client returns 404', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    // Query for a nonexistent client ID
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/clients/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('scoped user cannot access detail of unassigned client', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);

    // Create two clients
    const assignedClient = await Client.create({ name: 'Assigned Client' });
    const unassignedClient = await Client.create({ name: 'Unassigned Client' });

    // Create a user assigned to only assignedClient
    await User.create({
      name: 'ScopedUser',
      username: 'scoped',
      passwordHash,
      role: 'user',
      assignedClientIds: [assignedClient._id],
    });

    const token = await loginAs(app, 'scoped', 'pw');

    // User SHOULD access their assigned client
    const assignedRes = await request(app)
      .get(`/api/clients/${assignedClient._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(assignedRes.status).toBe(200);
    expect(assignedRes.body.data.name).toBe('Assigned Client');

    // User should NOT access unassigned client (404, not the unassigned client's data)
    const unassignedRes = await request(app)
      .get(`/api/clients/${unassignedClient._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(unassignedRes.status).toBe(404);
    expect(unassignedRes.body.message).toBe('Client not found');
  });

  it('user cannot mass-assign deletedAt to soft-delete via update', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'User', username: 'user', passwordHash, role: 'user' });
    const token = await loginAs(app, 'user', 'pw');

    // Create a client as admin
    const adminPasswordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash: adminPasswordHash, role: 'admin' });
    const adminToken = await loginAs(app, 'admin', 'pw');

    const createRes = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Client' });
    const clientId = createRes.body.data._id;

    // User attempts to mass-assign deletedAt via update (should be stripped)
    const updateRes = await request(app)
      .put(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated', deletedAt: new Date() });
    expect(updateRes.status).toBe(200);

    // Verify deletedAt was NOT set (client is still active)
    const verifyRes = await request(app)
      .get(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.deletedAt).toBeNull();
    expect(verifyRes.body.data.name).toBe('Updated');
  });
});
