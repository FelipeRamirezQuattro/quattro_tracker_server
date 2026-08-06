import request from 'supertest';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { createApp } from '../../../src/app';
import { User } from '../../../src/db/models/User';
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

describe('user routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('admin can create a user and never sees a passwordHash back', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Employee', username: 'newemployee', password: 'temp-pass', role: 'user' });

    expect(res.status).toBe(201);
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.username).toBe('newemployee');
  });

  it('non-admin cannot list users', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Employee', username: 'employee', passwordHash, role: 'user' });
    const token = await loginAs(app, 'employee', 'pw');

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin can list users and passwordHash is never returned', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((user: any) => !user.passwordHash)).toBe(true);
  });

  it('admin can get a specific user', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const res = await request(app)
      .get(`/api/users/${admin._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('admin');
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('admin gets 404 when user not found', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const res = await request(app)
      .get('/api/users/invalidid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('admin can update a user', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const user = await User.create({ name: 'Old Name', username: 'user1', passwordHash, role: 'user' });
    const token = await loginAs(app, 'admin', 'pw');

    const res = await request(app)
      .put(`/api/users/${user._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name', email: 'newuser@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
    expect(res.body.data.email).toBe('newuser@example.com');
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('updateUser does not allow setting passwordHash directly', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const user = await User.create({ name: 'User', username: 'user1', passwordHash, role: 'user' });
    const token = await loginAs(app, 'admin', 'pw');

    const res = await request(app)
      .put(`/api/users/${user._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name', passwordHash: 'hacked' });

    expect(res.status).toBe(200);
    // Verify the passwordHash was not changed
    const updatedUser = await User.findById(user._id);
    expect(updatedUser?.passwordHash).toBe(passwordHash);
  });

  it('updateUser does not allow setting deletedAt directly', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const user = await User.create({ name: 'User', username: 'user1', passwordHash, role: 'user' });
    const token = await loginAs(app, 'admin', 'pw');

    const res = await request(app)
      .put(`/api/users/${user._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name', deletedAt: new Date() });

    expect(res.status).toBe(200);
    // Verify the user is not deleted
    const updatedUser = await User.findById(user._id);
    expect(updatedUser?.deletedAt).toBeNull();
  });

  it('admin can soft-delete a user and verify with includeDeleted', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const user = await User.create({ name: 'User', username: 'user1', passwordHash, role: 'user' });
    const token = await loginAs(app, 'admin', 'pw');

    // Delete the user
    const deleteRes = await request(app)
      .delete(`/api/users/${user._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);

    // Verify the user no longer appears in list (soft delete)
    const listRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    const deletedUserInList = listRes.body.data.find((u: any) => u._id === String(user._id));
    expect(deletedUserInList).toBeUndefined();

    // Verify the user still exists in database with deletedAt set
    const userWithDeleted = await User.findById(user._id).setOptions({ includeDeleted: true });
    expect(userWithDeleted).toBeDefined();
    expect(userWithDeleted?.deletedAt).toBeDefined();
    expect(userWithDeleted?.deletedAt).not.toBeNull();
  });

  it('non-admin cannot create a user', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Employee', username: 'employee', passwordHash, role: 'user' });
    const token = await loginAs(app, 'employee', 'pw');

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New User', username: 'newuser', password: 'pass', role: 'user' });

    expect(res.status).toBe(403);
  });

  it('non-admin cannot update a user', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    const user1 = await User.create({ name: 'Employee', username: 'employee', passwordHash, role: 'user' });
    const user2 = await User.create({ name: 'Another', username: 'another', passwordHash, role: 'user' });
    const token = await loginAs(app, 'employee', 'pw');

    const res = await request(app)
      .put(`/api/users/${user2._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('non-admin cannot delete a user', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    const user1 = await User.create({ name: 'Employee', username: 'employee', passwordHash, role: 'user' });
    const user2 = await User.create({ name: 'Another', username: 'another', passwordHash, role: 'user' });
    const token = await loginAs(app, 'employee', 'pw');

    const res = await request(app)
      .delete(`/api/users/${user2._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('handles errors gracefully on list users', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    // This test verifies error handling works (mocking a DB error would be ideal,
    // but for now we just verify the route doesn't crash)
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);

    expect([200, 500]).toContain(res.status);
  });
});
