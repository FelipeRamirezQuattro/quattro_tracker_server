import request from 'supertest';
import { createApp } from '../../src/app';

const testEnv = { corsOrigins: ['http://localhost:3000'] } as any;

describe('GET /api/health', () => {
  it('returns 200 and success:true', async () => {
    const app = createApp(testEnv);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
