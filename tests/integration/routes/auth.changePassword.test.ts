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

describe('PUT /api/auth/change-password', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('changes the password for a valid current password', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('correct-horse', 4);
    await User.create({ name: 'Ada', username: 'ada', passwordHash, role: 'admin' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ada', password: 'correct-horse' });

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
      .send({ currentPassword: 'correct-horse', newPassword: 'new-password' });

    expect(res.status).toBe(200);

    const secondLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ada', password: 'new-password' });
    expect(secondLogin.status).toBe(200);
  });

  it('rejects a wrong current password', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('correct-horse', 4);
    await User.create({ name: 'Ada', username: 'ada', passwordHash, role: 'admin' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ada', password: 'correct-horse' });

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
      .send({ currentPassword: 'wrong', newPassword: 'new-password' });

    expect(res.status).toBe(401);
  });
});
