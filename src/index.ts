import 'dotenv/config';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { connectDb } from './db/connect';

async function main() {
  const env = loadEnv();
  await connectDb(env.mongoUri);
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Listening on port ${env.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
