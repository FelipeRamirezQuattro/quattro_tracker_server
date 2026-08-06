import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { Client } from '../../../../src/db/models/Client';

describe('Client model', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a client with defaults', async () => {
    const client = await Client.create({ name: 'Acme Co' });
    expect(client.active).toBe(true);
    expect(client.deletedAt).toBeNull();
  });

  it('requires a name', async () => {
    await expect(Client.create({})).rejects.toThrow();
  });
});
