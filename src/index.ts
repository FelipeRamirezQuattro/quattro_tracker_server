import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app';
import { loadEnv } from './config/env';

async function main() {
  const env = loadEnv();
  await mongoose.connect(env.mongoUri);
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Listening on port ${env.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
