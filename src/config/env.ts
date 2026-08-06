export interface Env {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  jwtAccessSecret: string;
  jwtAccessExpiresIn: string;
  refreshTokenExpiresInDays: number;
  corsOrigins: string[];
  emailFrom: string;
  emailPassword: string;
  bcryptCostFactor: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function loadEnv(): Env {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(required('PORT')),
    mongoUri: required('MONGODB_URI'),
    jwtAccessSecret: required('JWT_ACCESS_SECRET'),
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshTokenExpiresInDays: Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || '30'),
    corsOrigins: required('CORS_ORIGIN').split(',').map((o) => o.trim()),
    emailFrom: process.env.EMAIL_FROM || '',
    emailPassword: process.env.EMAIL_PASSWORD || '',
    bcryptCostFactor: Number(process.env.BCRYPT_COST_FACTOR || '12'),
  };
}
