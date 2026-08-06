import 'dotenv/config';
import { Env, loadEnv } from '../config/env';
import { connectDb } from '../db/connect';
import { User } from '../db/models/User';
import { hashPassword } from '../helpers/password';

export async function seedAdmin(env: Env, credentials: { username: string; password: string }): Promise<void> {
  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) return;

  const passwordHash = await hashPassword(credentials.password, env.bcryptCostFactor);
  await User.create({
    name: 'Admin',
    username: credentials.username,
    passwordHash,
    role: 'admin',
  });
}

async function main() {
  const env = loadEnv();
  await connectDb(env.mongoUri);

  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error('Set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD to run the seed script');
  }

  await seedAdmin(env, { username, password });
  console.log(`Seed complete. Admin username: ${username}`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
