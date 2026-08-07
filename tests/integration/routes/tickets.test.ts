import request from 'supertest';
import { createApp } from '../../../src/app';
import { loadEnv } from '../../../src/config/env';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Ticket } from '../../../src/db/models/Ticket';
import { hashPassword } from '../../../src/helpers/password';
import { signAccessToken } from '../../../src/helpers/jwt';

jest.mock('../../../src/services/attachmentService', () => ({
  generateAttachmentKey: jest.fn(() => 'tickets/mock-key-1-screenshot.png'),
  uploadAttachment: jest.fn().mockResolvedValue(undefined),
}));

import { uploadAttachment } from '../../../src/services/attachmentService';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_SECRET = 'test-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS = '30';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.BCRYPT_COST_FACTOR = '4';

const env = loadEnv();
const app = createApp(env);

async function authHeaderFor(user: any) {
  const token = signAccessToken(
    { sub: String(user._id), role: user.role, tokenVersion: user.tokenVersion },
    env.jwtAccessSecret,
    env.jwtAccessExpiresIn
  );
  return `Bearer ${token}`;
}

describe('tickets routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('lets an admin create a ticket for any client/project', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const auth = await authHeaderFor(admin);

    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', auth)
      .send({ clientId: String(client._id), projectId: String(project._id), subject: 'Cannot log in' });

    expect(res.status).toBe(201);
    expect(res.body.data.subject).toBe('Cannot log in');
  });

  it('404s a final_user creating a ticket for a client they are not assigned to', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const contact = await User.create({ name: 'Contact', username: 'contact', passwordHash, role: 'final_user' });
    const auth = await authHeaderFor(contact);

    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', auth)
      .send({ clientId: String(client._id), projectId: String(project._id), subject: 'X' });

    expect(res.status).toBe(404);
  });

  it('only lists a final_user\'s own client\'s tickets', async () => {
    const passwordHash = await hashPassword('x', 4);
    const clientA = await Client.create({ name: 'Acme' });
    const clientB = await Client.create({ name: 'Globex' });
    const projectA = await Project.create({ clientId: clientA._id, name: 'Website' });
    const projectB = await Project.create({ clientId: clientB._id, name: 'Mobile' });
    await Ticket.create({ clientId: clientA._id, projectId: projectA._id, subject: 'A ticket' });
    await Ticket.create({ clientId: clientB._id, projectId: projectB._id, subject: 'B ticket' });
    const contact = await User.create({
      name: 'Contact', username: 'contact', passwordHash, role: 'final_user', assignedClientIds: [clientA._id],
    });
    const auth = await authHeaderFor(contact);

    const res = await request(app).get('/api/tickets').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe('A ticket');
  });

  it('403s a user (non-admin) on DELETE', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const employee = await User.create({
      name: 'Employee', username: 'employee', passwordHash, role: 'user', assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(employee);

    const res = await request(app).delete(`/api/tickets/${ticket._id}`).set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('lets a final_user reopen/close their own ticket via PUT, ignoring a subject change', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Old', solved: false });
    const contact = await User.create({
      name: 'Contact', username: 'contact', passwordHash, role: 'final_user', assignedClientIds: [client._id],
    });
    const auth = await authHeaderFor(contact);

    const res = await request(app)
      .put(`/api/tickets/${ticket._id}`)
      .set('Authorization', auth)
      .send({ subject: 'Hijacked subject', solved: true });

    expect(res.status).toBe(200);
    expect(res.body.data.solved).toBe(true);
    expect(res.body.data.subject).toBe('Old');
  });

  it('404s a final_user attempting PUT on a ticket outside their assignedClientIds', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const outsiderContact = await User.create({
      name: 'Outsider', username: 'outsider', passwordHash, role: 'final_user',
    });
    const auth = await authHeaderFor(outsiderContact);

    const res = await request(app).put(`/api/tickets/${ticket._id}`).set('Authorization', auth).send({ solved: true });
    expect(res.status).toBe(404);
  });

  it('adds a comment with an uploaded attachment and stores the generated key', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const employee = await User.create({
      name: 'Employee', username: 'employee', passwordHash, role: 'user', assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(employee);

    const res = await request(app)
      .post(`/api/tickets/${ticket._id}/comments`)
      .set('Authorization', auth)
      .field('comment', 'Here is a screenshot')
      .attach('attachment', Buffer.from('fake-image-bytes'), 'screenshot.png');

    expect(res.status).toBe(201);
    const comments = res.body.data.comments;
    expect(comments[comments.length - 1].hasAttachment).toBe(true);
    expect(comments[comments.length - 1].attachmentKey).toBeUndefined();
  });

  it('404s (and never touches S3) when posting a comment with an attachment to a ticket outside the caller\'s scope', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const outsider = await User.create({
      name: 'Outsider', username: 'outsider', passwordHash, role: 'user', assignedProjectIds: [],
    });
    const auth = await authHeaderFor(outsider);
    (uploadAttachment as jest.Mock).mockClear();

    const res = await request(app)
      .post(`/api/tickets/${ticket._id}/comments`)
      .set('Authorization', auth)
      .field('comment', 'Here is a screenshot')
      .attach('attachment', Buffer.from('fake-image-bytes'), 'screenshot.png');

    expect(res.status).toBe(404);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it('400s (not 404s) a comment with an empty/missing comment field', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const employee = await User.create({
      name: 'Employee', username: 'employee', passwordHash, role: 'user', assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(employee);

    const res = await request(app)
      .post(`/api/tickets/${ticket._id}/comments`)
      .set('Authorization', auth)
      .field('comment', '');

    expect(res.status).toBe(400);
  });

  it('GET /api/tickets/:id returns 200 with the ticket data for an in-scope caller', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Cannot log in' });
    const employee = await User.create({
      name: 'Employee', username: 'employee', passwordHash, role: 'user', assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(employee);

    const res = await request(app).get(`/api/tickets/${ticket._id}`).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.subject).toBe('Cannot log in');
    expect(String(res.body.data._id)).toBe(String(ticket._id));
  });

  it('promotes a ticket to a task, then 400s a second promotion attempt', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Cannot log in' });
    const employee = await User.create({
      name: 'Employee', username: 'employee', passwordHash, role: 'user', assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(employee);

    const first = await request(app).post(`/api/tickets/${ticket._id}/promote`).set('Authorization', auth);
    expect(first.status).toBe(200);
    expect(first.body.data.task.status).toBe('backlog');

    const second = await request(app).post(`/api/tickets/${ticket._id}/promote`).set('Authorization', auth);
    expect(second.status).toBe(400);
  });
});
