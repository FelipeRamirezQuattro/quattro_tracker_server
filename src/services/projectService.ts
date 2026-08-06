import mongoose from 'mongoose';
import { Project } from '../db/models/Project';
import { AuthUser, scopeProjectFilter } from './scope';

export async function listProjects(user: AuthUser) {
  return Project.find(scopeProjectFilter(user));
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
  return Project.findByIdAndUpdate(id, { deletedAt: new Date() }, { returnDocument: 'after' });
}
