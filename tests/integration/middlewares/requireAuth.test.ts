import express from 'express';
import request from 'supertest';
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
  });

  it('rejects an expired/invalid token', async () => {
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
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
  });

  it('attaches authUser for a valid token', async () => {
    const user = await User.create({
      name: 'Ada',
      username: 'ada',
      passwordHash: 'h',
      role: 'admin',
      tokenVersion: 0,
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
  });
});
