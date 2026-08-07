import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Ticket } from '../../../src/db/models/Ticket';
import { Task } from '../../../src/db/models/Task';
import { promoteTicket, AlreadyPromotedError } from '../../../src/services/ticketPromotionService';
import { AuthUser } from '../../../src/services/scope';

function authUserFor(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: String(new mongoose.Types.ObjectId()),
    role: 'user', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: [],
    ...overrides,
  };
}

describe('ticketPromotionService', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a backlog task in the ticket\'s project and links promotedTaskId', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Cannot log in' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    const result = await promoteTicket(employee, String(ticket._id));
    expect(result).not.toBeNull();
    expect(result!.task.status).toBe('backlog');
    expect(result!.task.title).toBe('Cannot log in');
    expect(String(result!.task.projectId)).toBe(String(project._id));
    expect(String(result!.ticket.promotedTaskId)).toBe(String(result!.task._id));

    const persisted = await Ticket.findById(ticket._id);
    expect(String(persisted!.promotedTaskId)).toBe(String(result!.task._id));
  });

  it('throws AlreadyPromotedError on a second promotion attempt', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    await promoteTicket(employee, String(ticket._id));
    await expect(promoteTicket(employee, String(ticket._id))).rejects.toBeInstanceOf(AlreadyPromotedError);
  });

  it('returns null when the ticket is outside the caller\'s scope', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const outsider = authUserFor({ role: 'user', assignedProjectIds: [String(new mongoose.Types.ObjectId())] });

    expect(await promoteTicket(outsider, String(ticket._id))).toBeNull();
  });

  it('assigns an incrementing rank consistent with existing backlog tasks', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    await Task.create({ projectId: project._id, title: 'Existing', reporterId: client._id, rank: 1000, status: 'backlog' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'New from ticket' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    const result = await promoteTicket(employee, String(ticket._id));
    expect(result!.task.rank).toBe(2000);
  });
});
