import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { createApp } from '../../../src/app';
import { User } from '../../../src/db/models/User';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { hashPassword } from '../../../src/helpers/password';

const testEnv = {
  nodeEnv: 'test',
  jwtAccessSecret: 'test-secret',
  jwtAccessExpiresIn: '15m',
  refreshTokenExpiresInDays: 30,
  bcryptCostFactor: 4,
  corsOrigins: ['http://localhost:3000'],
} as any;

async function loginAs(app: any, username: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.data.accessToken as string;
}

describe('project routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('admin can create and list projects', async () => {
    const app = createApp(testEnv);
    const client = await Client.create({ name: 'Acme Co' });
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const createRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: String(client._id), name: 'Website Revamp' });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(listRes.body.data).toHaveLength(1);
  });

  it('user role only sees their assigned projects', async () => {
    const app = createApp(testEnv);
    const client = await Client.create({ name: 'Acme Co' });
    const visibleProject = await Project.create({ clientId: client._id, name: 'Visible', status: 'active' });
    await Project.create({ clientId: client._id, name: 'Hidden', status: 'active' });
    const passwordHash = await hashPassword('pw', 4);
    await User.create({
      name: 'Employee',
      username: 'employee',
      passwordHash,
      role: 'user',
      assignedProjectIds: [visibleProject._id],
    });
    const token = await loginAs(app, 'employee', 'pw');

    const listRes = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].name).toBe('Visible');
  });

  it('final_user cannot create a project', async () => {
    const app = createApp(testEnv);
    const client = await Client.create({ name: 'Acme Co' });
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Contact', username: 'contact', passwordHash, role: 'final_user' });
    const token = await loginAs(app, 'contact', 'pw');

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: String(client._id), name: 'New Project' });
    expect(res.status).toBe(403);
  });

  it('admin can perform full CRUD on projects', async () => {
    const app = createApp(testEnv);
    const client = await Client.create({ name: 'Test Co' });
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    // Create
    const createRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: String(client._id), name: 'New Project', description: 'Test project' });
    expect(createRes.status).toBe(201);
    const projectId = createRes.body.data._id;

    // Read
    const readRes = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(readRes.status).toBe(200);
    expect(readRes.body.data.name).toBe('New Project');

    // Update
    const updateRes = await request(app)
      .put(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Project', description: 'Updated' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Updated Project');

    // Delete (soft-delete)
    const deleteRes = await request(app)
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    // Verify deleted project is gone from normal list
    const listAfterDelete = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${token}`);
    expect(listAfterDelete.body.data).toHaveLength(0);
  });

  it('delete is soft-delete: record still exists with deletedAt set', async () => {
    const app = createApp(testEnv);
    const client = await Client.create({ name: 'Test Co' });
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const createRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: String(client._id), name: 'To Delete' });
    const projectId = createRes.body.data._id;

    // Delete the project (soft-delete)
    await request(app)
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`);

    // Query with includeDeleted to verify it still exists with deletedAt set
    const deletedProject = await Project.findById(projectId).setOptions({ includeDeleted: true });
    expect(deletedProject).toBeDefined();
    expect(deletedProject!.deletedAt).toBeDefined();
    expect(deletedProject!.name).toBe('To Delete');
  });

  it('scoped user cannot access detail of unassigned project', async () => {
    const app = createApp(testEnv);
    const client = await Client.create({ name: 'Test Co' });
    const passwordHash = await hashPassword('pw', 4);

    // Create two projects
    const assignedProject = await Project.create({
      clientId: client._id,
      name: 'Assigned Project',
      status: 'active',
    });
    const unassignedProject = await Project.create({
      clientId: client._id,
      name: 'Unassigned Project',
      status: 'active',
    });

    // Create a user assigned to only assignedProject
    await User.create({
      name: 'ScopedUser',
      username: 'scoped',
      passwordHash,
      role: 'user',
      assignedProjectIds: [assignedProject._id],
    });

    const token = await loginAs(app, 'scoped', 'pw');

    // User SHOULD access their assigned project
    const assignedRes = await request(app)
      .get(`/api/projects/${assignedProject._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(assignedRes.status).toBe(200);
    expect(assignedRes.body.data.name).toBe('Assigned Project');

    // User should NOT access unassigned project (404, not the unassigned project's data)
    const unassignedRes = await request(app)
      .get(`/api/projects/${unassignedProject._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(unassignedRes.status).toBe(404);
    expect(unassignedRes.body.message).toBe('Project not found');
  });

  it('user cannot mass-assign deletedAt to soft-delete via update', async () => {
    const app = createApp(testEnv);
    const client = await Client.create({ name: 'Test Co' });
    const passwordHash = await hashPassword('pw', 4);

    // Create a project first
    const project = await Project.create({
      clientId: client._id,
      name: 'Test Project',
      status: 'active',
    });

    // Create a user assigned to this project
    await User.create({
      name: 'User',
      username: 'user',
      passwordHash,
      role: 'user',
      assignedProjectIds: [project._id],
    });
    const token = await loginAs(app, 'user', 'pw');

    // User attempts to mass-assign deletedAt via update (should be stripped, field is allowlisted away)
    const updateRes = await request(app)
      .put(`/api/projects/${project._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated', deletedAt: new Date() });
    expect(updateRes.status).toBe(200);

    // Verify deletedAt was NOT set (project is still active, mass-assignment was stripped)
    const adminPasswordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash: adminPasswordHash, role: 'admin' });
    const adminToken = await loginAs(app, 'admin', 'pw');

    const verifyRes = await request(app)
      .get(`/api/projects/${project._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.deletedAt).toBeNull();
    expect(verifyRes.body.data.name).toBe('Updated');
  });

  it('scoped user cannot update unassigned project', async () => {
    const app = createApp(testEnv);
    const client = await Client.create({ name: 'Test Co' });
    const passwordHash = await hashPassword('pw', 4);

    // Create two projects: one assigned, one not
    const assignedProject = await Project.create({
      clientId: client._id,
      name: 'Assigned Project',
      status: 'active',
    });
    const unassignedProject = await Project.create({
      clientId: client._id,
      name: 'Unassigned Project',
      status: 'active',
    });

    // Create a user assigned to only assignedProject
    await User.create({
      name: 'ScopedUser',
      username: 'scoped',
      passwordHash,
      role: 'user',
      assignedProjectIds: [assignedProject._id],
    });
    const token = await loginAs(app, 'scoped', 'pw');

    // User SHOULD be able to update their assigned project
    const assignedUpdateRes = await request(app)
      .put(`/api/projects/${assignedProject._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Assigned Updated' });
    expect(assignedUpdateRes.status).toBe(200);
    expect(assignedUpdateRes.body.data.name).toBe('Assigned Updated');

    // User should NOT be able to update unassigned project (404, not silent write)
    const unassignedUpdateRes = await request(app)
      .put(`/api/projects/${unassignedProject._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Should Not Update' });
    expect(unassignedUpdateRes.status).toBe(404);
    expect(unassignedUpdateRes.body.message).toBe('Project not found');

    // Verify unassigned project was NOT updated
    const adminPasswordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash: adminPasswordHash, role: 'admin' });
    const adminToken = await loginAs(app, 'admin', 'pw');

    const verifyRes = await request(app)
      .get(`/api/projects/${unassignedProject._id.toString()}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.name).toBe('Unassigned Project'); // Name unchanged
  });

  it('nonexistent project returns 404', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    // Query for a nonexistent project ID
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/projects/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('user can update assigned project', async () => {
    const app = createApp(testEnv);
    const client = await Client.create({ name: 'Test Co' });
    const project = await Project.create({
      clientId: client._id,
      name: 'Project',
      status: 'active',
    });
    const passwordHash = await hashPassword('pw', 4);
    await User.create({
      name: 'Employee',
      username: 'employee',
      passwordHash,
      role: 'user',
      assignedProjectIds: [project._id],
    });
    const token = await loginAs(app, 'employee', 'pw');

    const updateRes = await request(app)
      .put(`/api/projects/${project._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated', description: 'New desc', status: 'on_hold' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Updated');
    expect(updateRes.body.data.description).toBe('New desc');
    expect(updateRes.body.data.status).toBe('on_hold');
  });

  it('final_user cannot delete a project', async () => {
    const app = createApp(testEnv);
    const client = await Client.create({ name: 'Test Co' });
    const project = await Project.create({
      clientId: client._id,
      name: 'Project',
      status: 'active',
    });
    const passwordHash = await hashPassword('pw', 4);
    await User.create({
      name: 'Contact',
      username: 'contact',
      passwordHash,
      role: 'final_user',
      assignedProjectIds: [project._id],
    });
    const token = await loginAs(app, 'contact', 'pw');

    const res = await request(app)
      .delete(`/api/projects/${project._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
