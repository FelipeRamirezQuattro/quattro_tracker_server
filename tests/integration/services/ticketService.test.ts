import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Ticket } from '../../../src/db/models/Ticket';
import {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
} from '../../../src/services/ticketService';
import { AuthUser } from '../../../src/services/scope';

function authUserFor(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: String(new mongoose.Types.ObjectId()),
    role: 'user',
    tokenVersion: 0,
    assignedClientIds: [],
    assignedProjectIds: [],
    ...overrides,
  };
}

describe('ticketService', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('lets an admin create a ticket for any client/project', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const admin = authUserFor({ role: 'admin' });

    const ticket = await createTicket(admin, {
      clientId: String(client._id), projectId: String(project._id), subject: 'Cannot log in',
    });
    expect(ticket).not.toBeNull();
    expect(String(ticket!.clientId)).toBe(String(client._id));
  });

  it('refuses to create a ticket for a final_user outside their assignedClientIds', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const outsider = authUserFor({ role: 'final_user', assignedClientIds: [String(new mongoose.Types.ObjectId())] });

    const ticket = await createTicket(outsider, {
      clientId: String(client._id), projectId: String(project._id), subject: 'X',
    });
    expect(ticket).toBeNull();
  });

  it('refuses to create a ticket for a user outside their assignedProjectIds', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const outsider = authUserFor({ role: 'user', assignedProjectIds: [String(new mongoose.Types.ObjectId())] });

    const ticket = await createTicket(outsider, {
      clientId: String(client._id), projectId: String(project._id), subject: 'X',
    });
    expect(ticket).toBeNull();
  });

  it('rejects a projectId that does not belong to the given clientId', async () => {
    const clientA = await Client.create({ name: 'Acme' });
    const clientB = await Client.create({ name: 'Globex' });
    const projectOfB = await Project.create({ clientId: clientB._id, name: 'Mobile' });
    const admin = authUserFor({ role: 'admin' });

    const ticket = await createTicket(admin, {
      clientId: String(clientA._id), projectId: String(projectOfB._id), subject: 'X',
    });
    expect(ticket).toBeNull();
  });

  it('only returns a final_user\'s own client\'s tickets from listTickets', async () => {
    const clientA = await Client.create({ name: 'Acme' });
    const clientB = await Client.create({ name: 'Globex' });
    const projectA = await Project.create({ clientId: clientA._id, name: 'Website' });
    const projectB = await Project.create({ clientId: clientB._id, name: 'Mobile' });
    await Ticket.create({ clientId: clientA._id, projectId: projectA._id, subject: 'A ticket' });
    await Ticket.create({ clientId: clientB._id, projectId: projectB._id, subject: 'B ticket' });

    const contact = authUserFor({ role: 'final_user', assignedClientIds: [String(clientA._id)] });
    const results = await listTickets(contact, {});
    expect(results).toHaveLength(1);
    expect(results[0].subject).toBe('A ticket');
  });

  it('only returns a user\'s own assigned project\'s tickets from listTickets', async () => {
    const client = await Client.create({ name: 'Acme' });
    const projectA = await Project.create({ clientId: client._id, name: 'Website' });
    const projectB = await Project.create({ clientId: client._id, name: 'Mobile' });
    await Ticket.create({ clientId: client._id, projectId: projectA._id, subject: 'A ticket' });
    await Ticket.create({ clientId: client._id, projectId: projectB._id, subject: 'B ticket' });

    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(projectA._id)] });
    const results = await listTickets(employee, {});
    expect(results).toHaveLength(1);
    expect(results[0].subject).toBe('A ticket');
  });

  it('allowlists subject/solved on updateTicket for an employee', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Old' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    const updated = await updateTicket(employee, String(ticket._id), { subject: 'New', solved: true });
    expect(updated!.subject).toBe('New');
    expect(updated!.solved).toBe(true);
  });

  it('lets a final_user reopen/close their own ticket, ignoring any subject change', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Old', solved: false });
    const contact = authUserFor({ role: 'final_user', assignedClientIds: [String(client._id)] });

    const updated = await updateTicket(contact, String(ticket._id), { subject: 'Hijacked subject', solved: true });
    expect(updated!.solved).toBe(true);
    expect(updated!.subject).toBe('Old');
  });

  it('blocks a final_user from updating a ticket outside their assignedClientIds', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const outsider = authUserFor({ role: 'final_user', assignedClientIds: [String(new mongoose.Types.ObjectId())] });

    expect(await updateTicket(outsider, String(ticket._id), { solved: true })).toBeNull();
  });

  it('soft-deletes rather than removing the document', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });

    const deleted = await deleteTicket(String(ticket._id));
    expect(deleted!.deletedAt).not.toBeNull();
    expect(await Ticket.findById(ticket._id)).toBeNull();
  });

  it('getTicket returns null for a ticket outside the caller\'s scope', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const outsider = authUserFor({ role: 'user', assignedProjectIds: [String(new mongoose.Types.ObjectId())] });

    expect(await getTicket(outsider, String(ticket._id))).toBeNull();
  });

  it('getTicket returns the ticket for an in-scope caller', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Cannot log in' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    const found = await getTicket(employee, String(ticket._id));
    expect(found).not.toBeNull();
    expect(String(found!._id)).toBe(String(ticket._id));
    expect(found!.subject).toBe('Cannot log in');
  });

  it('createTicket returns null when clientId is missing', async () => {
    const project = await Project.create({ clientId: new mongoose.Types.ObjectId(), name: 'Website' });
    const admin = authUserFor({ role: 'admin' });

    const ticket = await createTicket(admin, {
      projectId: String(project._id), subject: 'X',
    } as any);
    expect(ticket).toBeNull();
  });

  it('createTicket returns null when clientId is a non-string (e.g. an injection attempt)', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const admin = authUserFor({ role: 'admin' });

    const ticket = await createTicket(admin, {
      clientId: { $ne: null } as any, projectId: String(project._id), subject: 'X',
    } as any);
    expect(ticket).toBeNull();
  });

  it('createTicket returns null when projectId is missing', async () => {
    const client = await Client.create({ name: 'Acme' });
    const admin = authUserFor({ role: 'admin' });

    const ticket = await createTicket(admin, {
      clientId: String(client._id), subject: 'X',
    } as any);
    expect(ticket).toBeNull();
  });
});
