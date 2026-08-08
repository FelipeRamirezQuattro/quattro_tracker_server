import mongoose from 'mongoose';
import { Project } from '../db/models/Project';
import { Task } from '../db/models/Task';
import { Ticket } from '../db/models/Ticket';
import { HasDependentRecordsError } from './errors';
import { AuthUser, scopeProjectFilter } from './scope';

// A final_user's portal account is tied to a client (assignedClientIds), not
// individual projects (assignedProjectIds) — mirrors the same role-scoping
// decision already made for Ticket (see scopeTicketFilter in ticketService.ts).
// Without this, a final_user always sees zero projects from the default
// assignedProjectIds-scoped query and can never pick a project to file a
// ticket against. This is a narrow, additive bypass: it only applies when the
// caller is a final_user AND explicitly passes a clientId that's in their own
// assignedClientIds. Every other caller/shape keeps the original behavior.
export async function listProjects(user: AuthUser, filters: { clientId?: string } = {}) {
  if (user.role === 'final_user' && filters.clientId) {
    if (!user.assignedClientIds.includes(filters.clientId)) return [];
    // No explicit deletedAt filter needed: softDeletePlugin's pre(/^find/)
    // hook already excludes soft-deleted documents from every find() call.
    return Project.find({ clientId: filters.clientId });
  }
  const baseFilter: Record<string, any> = {};
  if (filters.clientId) baseFilter.clientId = filters.clientId;
  return Project.find(scopeProjectFilter(user, baseFilter));
}

export async function getProject(user: AuthUser, id: string) {
  try {
    // Try to create an ObjectId from the id string
    const objectId = new mongoose.Types.ObjectId(id);
    const filter = scopeProjectFilter(user, { _id: objectId });
    return Project.findOne(filter);
  } catch {
    // If id is not a valid ObjectId, return null
    return null;
  }
}

export async function createProject(data: { clientId: string; name: string; description?: string; guideUrl?: string }) {
  return Project.create(data);
}

export async function updateProject(user: AuthUser, id: string, data: any) {
  try {
    // Validate and convert id to ObjectId
    const objectId = new mongoose.Types.ObjectId(id);
    // Allowlist permitted fields only — strip deletedAt, _id, timestamps, etc.
    const { name, description, status, guideUrl } = data;
    const allowlistedData: Partial<{ name: string; description: string; status: string; guideUrl: string }> = {};
    if (name !== undefined) allowlistedData.name = name;
    if (description !== undefined) allowlistedData.description = description;
    if (status !== undefined) allowlistedData.status = status;
    if (guideUrl !== undefined) allowlistedData.guideUrl = guideUrl;
    // Apply scope filter so scoped users can only update their assigned projects
    const filter = scopeProjectFilter(user, { _id: objectId });
    return Project.findOneAndUpdate(filter, allowlistedData, { returnDocument: 'after' });
  } catch {
    // If id is not a valid ObjectId, return null
    return null;
  }
}

export async function deleteProject(id: string) {
  const [hasTasks, hasTickets] = await Promise.all([
    Task.exists({ projectId: id }),
    Ticket.exists({ projectId: id }),
  ]);
  if (hasTasks || hasTickets) {
    throw new HasDependentRecordsError(
      'Cannot delete a project that still has tasks or tickets. Archive or delete them first.'
    );
  }
  return Project.findByIdAndUpdate(id, { deletedAt: new Date() }, { returnDocument: 'after' });
}
