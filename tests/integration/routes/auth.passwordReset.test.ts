jest.mock('../../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { createApp } from '../../../src/app';
import { User } from '../../../src/db/models/User';
import { sendPasswordResetEmail } from '../../../src/services/emailService';

const testEnv = {
  nodeEnv: 'test',
  jwtAccessSecret: 'test-secret',
  jwtAccessExpiresIn: '15m',
  refreshTokenExpiresInDays: 30,
  bcryptCostFactor: 4,
  corsOrigins: ['http://localhost:3000'],
  emailFrom: 'noreply@example.com',
  emailPassword: 'app-password',
} as any;

describe('password reset routes', () => {
  beforeAll(connectTestDb);
  afterEach(async () => {
    await clearTestDb();
    jest.clearAllMocks();
  });
  afterAll(closeTestDb);

  it('request then confirm resets the password', async () => {
    const app = createApp(testEnv);
    await User.create({
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      passwordHash: 'x',
      role: 'admin',
    });

    const requestRes = await request(app)
      .post('/api/auth/reset-password/request')
      .send({ usernameOrEmail: 'ada@example.com' });
    expect(requestRes.status).toBe(200);

    const call = (sendPasswordResetEmail as jest.Mock).mock.calls[0][0];
    const rawToken = new URL(call.resetLink).searchParams.get('token')!;

    const confirmRes = await request(app)
      .post('/api/auth/reset-password/confirm')
      .send({ token: rawToken, newPassword: 'brand-new-password' });
    expect(confirmRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ada', password: 'brand-new-password' });
    expect(loginRes.status).toBe(200);
  });
});
