import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { signAccessToken } from '../../../src/helpers/jwt';
import { requireAuth } from '../../../src/middlewares/requireAuth';

const testEnv = { jwtAccessSecret: 'test-secret' } as any;

function buildApp() {
  const app = express();
  app.get('/protected', requireAuth(testEnv), (req, res) => {
    res.json({ authUser: req.authUser });
  });
  return app;
}

describe('requireAuth', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('rejects a request with no Authorization header', async () => {
    const res = await request(buildApp()).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a request with malformed Authorization header (wrong scheme)', async () => {
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Basic xyz');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a request with malformed Authorization header (Bearer with no token)', async () => {
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Bearer');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects an expired/invalid token', async () => {
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a token for a user that does not exist', async () => {
    const fakeUserId = new Types.ObjectId();
    const token = signAccessToken(
      { sub: String(fakeUserId), role: 'admin', tokenVersion: 0 },
      'test-secret',
      '15m'
    );

    const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a token for an inactive user', async () => {
    const user = await User.create({
      name: 'Bob',
      username: 'bob',
      passwordHash: 'h',
      role: 'user',
      active: false,
      tokenVersion: 0,
    });
    const token = signAccessToken(
      { sub: String(user._id), role: 'user', tokenVersion: 0 },
      'test-secret',
      '15m'
    );

    const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a token whose tokenVersion is stale', async () => {
    const user = await User.create({
      name: 'Ada',
      username: 'ada',
      passwordHash: 'h',
      role: 'admin',
      tokenVersion: 5,
    });
    const token = signAccessToken(
      { sub: String(user._id), role: 'admin', tokenVersion: 0 },
      'test-secret',
      '15m'
    );

    const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('attaches authUser for a valid token with correct tokenVersion and assigned IDs', async () => {
    const clientId1 = new Types.ObjectId();
    const clientId2 = new Types.ObjectId();
    const projectId1 = new Types.ObjectId();
    const projectId2 = new Types.ObjectId();

    const user = await User.create({
      name: 'Ada',
      username: 'ada',
      passwordHash: 'h',
      role: 'admin',
      tokenVersion: 0,
      assignedClientIds: [clientId1, clientId2],
      assignedProjectIds: [projectId1, projectId2],
    });
    const token = signAccessToken(
      { sub: String(user._id), role: 'admin', tokenVersion: 0 },
      'test-secret',
      '15m'
    );

    const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.authUser.id).toBe(String(user._id));
    expect(res.body.authUser.role).toBe('admin');
    expect(res.body.authUser.tokenVersion).toBe(0);
    expect(res.body.authUser.assignedClientIds).toEqual([String(clientId1), String(clientId2)]);
    expect(res.body.authUser.assignedProjectIds).toEqual([String(projectId1), String(projectId2)]);
  });
});
