describe('loadEnv', () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...REAL_ENV };
  });

  afterAll(() => {
    process.env = REAL_ENV;
  });

  it('loads and parses required env vars', () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '4000';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
    process.env.JWT_ACCESS_SECRET = 'secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS = '30';
    process.env.CORS_ORIGIN = 'http://localhost:3000,http://localhost:3001';
    process.env.BCRYPT_COST_FACTOR = '12';

    const { loadEnv } = require('../../../src/config/env');
    const env = loadEnv();

    expect(env.port).toBe(4000);
    expect(env.corsOrigins).toEqual(['http://localhost:3000', 'http://localhost:3001']);
    expect(env.bcryptCostFactor).toBe(12);
  });

  it('throws when a required var is missing', () => {
    // Set other required vars first since loadEnv() checks PORT before MONGODB_URI, so without them the error would be on PORT instead
    process.env.NODE_ENV = 'test';
    process.env.PORT = '4000';
    process.env.JWT_ACCESS_SECRET = 'secret';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    delete process.env.MONGODB_URI;
    const { loadEnv } = require('../../../src/config/env');
    expect(() => loadEnv()).toThrow(/MONGODB_URI/);
  });
});
