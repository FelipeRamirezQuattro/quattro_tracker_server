import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { Client } from '../../../../src/db/models/Client';
import { Project } from '../../../../src/db/models/Project';

describe('Project model', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a project with defaults', async () => {
    const client = await Client.create({ name: 'Acme Co' });
    const project = await Project.create({ clientId: client._id, name: 'Website Revamp' });

    expect(project.status).toBe('active');
    expect(project.assignedUserIds).toEqual([]);
    expect(project.deletedAt).toBeNull();
  });

  it('rejects an invalid status', async () => {
    const client = await Client.create({ name: 'Acme Co' });
    await expect(
      Project.create({ clientId: client._id, name: 'X', status: 'not-a-status' as any })
    ).rejects.toThrow();
  });

  it('requires clientId', async () => {
    await expect(Project.create({ name: 'No Client' } as any)).rejects.toThrow();
  });
});
