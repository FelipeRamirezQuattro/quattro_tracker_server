import mongoose from 'mongoose';
import { Ticket } from '../db/models/Ticket';
import { Client } from '../db/models/Client';
import { Project } from '../db/models/Project';
import { AuthUser, scopeByProjectIdFilter, scopeByClientIdFilter } from './scope';

interface TicketFilters {
  projectId?: string;
  clientId?: string;
  solved?: boolean;
}

// Ticket is the one entity scoped by two different foreign keys depending on
// role: a final_user's portal account is tied to a client, not individual
// projects, so they're scoped by clientId; an employee ("user") is scoped by
// projectId like every other Scrum entity. Admin is unrestricted either way.
export function scopeTicketFilter(user: AuthUser, baseFilter: Record<string, any> = {}) {
  if (user.role === 'final_user') return scopeByClientIdFilter(user, baseFilter);
  return scopeByProjectIdFilter(user, baseFilter);
}

export async function listTickets(user: AuthUser, filters: TicketFilters) {
  const baseFilter: Record<string, any> = {};
  if (filters.projectId) baseFilter.projectId = filters.projectId;
  if (filters.clientId) baseFilter.clientId = filters.clientId;
  if (filters.solved !== undefined) baseFilter.solved = filters.solved;
  return Ticket.find(scopeTicketFilter(user, baseFilter)).sort({ createdAt: -1 });
}

export async function getTicket(user: AuthUser, id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return await Ticket.findOne(scopeTicketFilter(user, { _id: objectId }));
  } catch {
    return null;
  }
}

// Deliberately does NOT reuse clientService.getClient/projectService.getProject:
// those scope Client/Project lookups by assignedClientIds/assignedProjectIds
// for any non-admin, which doesn't express Ticket's actual rule ("final_user
// gated by clientId, user gated by projectId — not both, per role"). This does
// its own raw existence + referential-integrity check instead.
export async function createTicket(
  user: AuthUser,
  data: { clientId: string; projectId: string; subject: string }
) {
  // Mongoose silently drops an undefined value from a filter object rather
  // than matching nothing, so Client.findOne({ _id: undefined }) below would
  // match the FIRST arbitrary non-deleted client instead of zero clients.
  // final_user/user's role guards already no-op on undefined (.includes(undefined)
  // is always false), so this is only admin-reachable, but must still be
  // rejected explicitly rather than relying on Mongo's filter semantics.
  if (typeof data.clientId !== 'string' || typeof data.projectId !== 'string' || !data.clientId || !data.projectId) {
    return null;
  }

  if (user.role === 'final_user' && !user.assignedClientIds.includes(data.clientId)) return null;
  if (user.role === 'user' && !user.assignedProjectIds.includes(data.projectId)) return null;

  let client, project;
  try {
    // No explicit deletedAt filter needed: softDeletePlugin's pre(/^find/) hook
    // already excludes soft-deleted documents from every find()/findOne() call.
    client = await Client.findOne({ _id: data.clientId });
    project = await Project.findOne({ _id: data.projectId });
  } catch {
    return null;
  }
  if (!client || !project) return null;
  if (String(project.clientId) !== String(client._id)) return null;

  return Ticket.create({
    clientId: client._id,
    projectId: project._id,
    subject: data.subject,
    solved: false,
    comments: [],
  });
}

// PUT is admin/user/final_user (route-guarded) — a final_user may reopen/close
// their own ticket ("if they're owner") the same way a user may on any ticket
// within their assignedProjectIds ("or assigned to it"), via scopeTicketFilter's
// existing per-role dispatch. The one restriction unique to final_user: they
// may only ever toggle `solved` — a subject change is silently dropped, not
// rejected, since "reopen/close" doesn't extend to relabeling the ticket.
export async function updateTicket(user: AuthUser, id: string, data: { subject?: string; solved?: boolean }) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const filter = scopeTicketFilter(user, { _id: objectId });
    const allowlisted: Record<string, any> = {};
    if (data.subject !== undefined && user.role !== 'final_user') allowlisted.subject = data.subject;
    if (data.solved !== undefined) allowlisted.solved = data.solved;
    return await Ticket.findOneAndUpdate(filter, allowlisted, { returnDocument: 'after' });
  } catch {
    return null;
  }
}

// DELETE is admin-only (route-guarded) — unscoped, mirrors deleteProject/deleteClient.
export async function deleteTicket(id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return await Ticket.findOneAndUpdate({ _id: objectId }, { deletedAt: new Date() }, { returnDocument: 'after' });
  } catch {
    return null;
  }
}
