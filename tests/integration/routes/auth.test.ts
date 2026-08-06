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

describe('auth routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('logs in, refreshes, reads /me, and logs out', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('correct-horse', 4);
    await User.create({ name: 'Ada', username: 'ada', passwordHash, role: 'admin' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ada', password: 'correct-horse' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeDefined();
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.username).toBe('ada');
    expect(meRes.body.data.passwordHash).toBeUndefined();

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', refreshRes.headers['set-cookie']);
    expect(logoutRes.status).toBe(200);
  });

  it('rejects login with wrong credentials', async () => {
    const app = createApp(testEnv);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});
