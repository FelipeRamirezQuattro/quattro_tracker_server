import request from 'supertest';
import { Readable } from 'stream';
import { createApp } from '../../../src/app';
import { loadEnv } from '../../../src/config/env';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Ticket } from '../../../src/db/models/Ticket';
import { hashPassword } from '../../../src/helpers/password';
import { signAccessToken } from '../../../src/helpers/jwt';
import { getAttachmentObject } from '../../../src/services/attachmentService';

jest.mock('../../../src/services/attachmentService', () => ({
  generateAttachmentKey: jest.fn(() => 'tickets/mock-key-1-screenshot.png'),
  uploadAttachment: jest.fn().mockResolvedValue(undefined),
  getAttachmentObject: jest.fn().mockResolvedValue({
    stream: Readable.from([Buffer.from('fake-image-bytes')]),
    contentType: 'image/png',
  }),
}));

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

describe('files route (IDOR regression)', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('streams the attachment for a caller in scope for the parent ticket', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({
      clientId: client._id, projectId: project._id, subject: 'X',
      comments: [{ userId: client._id, comment: 'See attached', attachmentKey: 'tickets/key-1' }],
    });
    const contact = await User.create({
      name: 'Contact', username: 'contact', passwordHash, role: 'final_user', assignedClientIds: [client._id],
    });
    const auth = await authHeaderFor(contact);
    const commentId = ticket.comments[0]._id;

    const res = await request(app).get(`/api/files/${commentId}`).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('404s a final_user from a different client requesting the same attachment (IDOR guard)', async () => {
    const passwordHash = await hashPassword('x', 4);
    const clientA = await Client.create({ name: 'Acme' });
    const clientB = await Client.create({ name: 'Globex' });
    const projectA = await Project.create({ clientId: clientA._id, name: 'Website' });
    const ticket = await Ticket.create({
      clientId: clientA._id, projectId: projectA._id, subject: 'X',
      comments: [{ userId: clientA._id, comment: 'See attached', attachmentKey: 'tickets/key-1' }],
    });
    const outsiderContact = await User.create({
      name: 'Outsider', username: 'outsider', passwordHash, role: 'final_user', assignedClientIds: [clientB._id],
    });
    const auth = await authHeaderFor(outsiderContact);
    const commentId = ticket.comments[0]._id;

    const res = await request(app).get(`/api/files/${commentId}`).set('Authorization', auth);
    expect(res.status).toBe(404);
  });

  it('404s a random/unknown attachmentId rather than 500ing', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const auth = await authHeaderFor(admin);

    const res = await request(app).get('/api/files/not-a-real-object-id').set('Authorization', auth);
    expect(res.status).toBe(404);
  });

  it('500s (not 404s) when the underlying S3 fetch fails for an in-scope attachment', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({
      clientId: client._id, projectId: project._id, subject: 'X',
      comments: [{ userId: client._id, comment: 'See attached', attachmentKey: 'tickets/key-1' }],
    });
    const contact = await User.create({
      name: 'Contact', username: 'contact', passwordHash, role: 'final_user', assignedClientIds: [client._id],
    });
    const auth = await authHeaderFor(contact);
    const commentId = ticket.comments[0]._id;

    (getAttachmentObject as jest.Mock).mockRejectedValueOnce(new Error('S3 outage'));

    const res = await request(app).get(`/api/files/${commentId}`).set('Authorization', auth);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Contact the system administrator.' });
  });
});
