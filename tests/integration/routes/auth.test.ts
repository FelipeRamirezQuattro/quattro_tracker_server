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

function assertRefreshTokenCookie(setCookieHeader: string, options: { shouldHaveSecure?: boolean } = {}) {
  expect(setCookieHeader).toBeDefined();
  expect(setCookieHeader).toContain('HttpOnly');
  expect(setCookieHeader).toContain('SameSite=Strict');
  expect(setCookieHeader).toContain('Path=/api/auth');
  if (options.shouldHaveSecure) {
    expect(setCookieHeader).toContain('Secure');
  } else {
    expect(setCookieHeader).not.toContain('Secure');
  }
}

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
    expect(loginRes.body.data.refreshToken).toBeUndefined();
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    // In test env (nodeEnv='test'), Secure should NOT be present
    assertRefreshTokenCookie(cookies[0], { shouldHaveSecure: false });

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.username).toBe('ada');
    expect(meRes.body.data.passwordHash).toBeUndefined();

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    expect(refreshRes.body.data.refreshToken).toBeUndefined();
    const newCookies = refreshRes.headers['set-cookie'];
    expect(newCookies).toBeDefined();
    assertRefreshTokenCookie(newCookies[0], { shouldHaveSecure: false });

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', newCookies);
    expect(logoutRes.status).toBe(200);
    // Verify logout clears the cookie with proper options
    const logoutCookies = logoutRes.headers['set-cookie'];
    expect(logoutCookies).toBeDefined();
    expect(logoutCookies[0]).toContain('HttpOnly');
    expect(logoutCookies[0]).toContain('SameSite=Strict');
    expect(logoutCookies[0]).toContain('Path=/api/auth');
  });

  it('rejects login with wrong credentials', async () => {
    const app = createApp(testEnv);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});
