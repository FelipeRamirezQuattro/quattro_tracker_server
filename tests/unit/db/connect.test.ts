import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb } from '../../../src/db/connect';

describe('connectDb', () => {
  let mongod: MongoMemoryServer;

  afterEach(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('connects mongoose to the given URI', async () => {
    mongod = await MongoMemoryServer.create();
    await connectDb(mongod.getUri());
    expect(mongoose.connection.readyState).toBe(1);
  });
});
