import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Ticket } from '../../../src/db/models/Ticket';
import { addComment, findAttachment } from '../../../src/services/commentService';
import { AuthUser } from '../../../src/services/scope';

function authUserFor(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: String(new mongoose.Types.ObjectId()),
    role: 'user', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: [],
    ...overrides,
  };
}

describe('commentService', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('appends a comment with isAdmin=false for a final_user', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const contact = authUserFor({ role: 'final_user', assignedClientIds: [String(client._id)] });

    const updated = await addComment(contact, String(ticket._id), { comment: 'When will this be fixed?' });
    expect(updated!.comments).toHaveLength(1);
    expect(updated!.comments[0].isAdmin).toBe(false);
    expect(updated!.comments[0].attachmentKey).toBeNull();
  });

  it('appends a comment with isAdmin=true for an employee', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    const updated = await addComment(employee, String(ticket._id), { comment: 'Looking into it', attachmentKey: 'tickets/key-1' });
    expect(updated!.comments[0].isAdmin).toBe(true);
    expect(updated!.comments[0].attachmentKey).toBe('tickets/key-1');
  });

  it('returns null when the caller is out of scope for the parent ticket', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const outsider = authUserFor({ role: 'final_user', assignedClientIds: [String(new mongoose.Types.ObjectId())] });

    expect(await addComment(outsider, String(ticket._id), { comment: 'Hi' })).toBeNull();
  });

  it('findAttachment returns the ticket and comment for an in-scope caller', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const contact = authUserFor({ role: 'final_user', assignedClientIds: [String(client._id)] });
    const updated = await addComment(contact, String(ticket._id), { comment: 'See attached', attachmentKey: 'tickets/key-1' });
    const commentId = String(updated!.comments[0]._id);

    const found = await findAttachment(contact, commentId);
    expect(found).not.toBeNull();
    expect(found!.comment.attachmentKey).toBe('tickets/key-1');
  });

  it('findAttachment returns null for an out-of-scope caller (IDOR guard)', async () => {
    const clientA = await Client.create({ name: 'Acme' });
    const clientB = await Client.create({ name: 'Globex' });
    const projectA = await Project.create({ clientId: clientA._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: clientA._id, projectId: projectA._id, subject: 'X' });
    const ownerContact = authUserFor({ role: 'final_user', assignedClientIds: [String(clientA._id)] });
    const updated = await addComment(ownerContact, String(ticket._id), { comment: 'See attached', attachmentKey: 'tickets/key-1' });
    const commentId = String(updated!.comments[0]._id);

    const outsiderContact = authUserFor({ role: 'final_user', assignedClientIds: [String(clientB._id)] });
    expect(await findAttachment(outsiderContact, commentId)).toBeNull();
  });
});
