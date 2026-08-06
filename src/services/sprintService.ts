import mongoose from 'mongoose';
import { Sprint } from '../db/models/Sprint';
import { AuthUser, scopeByProjectIdFilter } from './scope';
import { getProject } from './projectService';

export async function listSprints(user: AuthUser, projectId: string) {
  const project = await getProject(user, projectId);
  if (!project) return null;
  return Sprint.find(scopeByProjectIdFilter(user, { projectId: project._id }));
}

export async function getSprint(user: AuthUser, id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return await Sprint.findOne(scopeByProjectIdFilter(user, { _id: objectId }));
  } catch {
    return null;
  }
}

export async function createSprint(user: AuthUser, projectId: string, data: any) {
  const project = await getProject(user, projectId);
  if (!project) return null;
  const { name, goal, startDate, endDate } = data;
  return Sprint.create({ projectId: project._id, name, goal, startDate, endDate });
}

export async function updateSprint(user: AuthUser, id: string, data: any) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const { name, goal, startDate, endDate, status } = data;
    const allowlisted: Record<string, any> = {};
    if (name !== undefined) allowlisted.name = name;
    if (goal !== undefined) allowlisted.goal = goal;
    if (startDate !== undefined) allowlisted.startDate = startDate;
    if (endDate !== undefined) allowlisted.endDate = endDate;
    if (status !== undefined) allowlisted.status = status;
    const filter = scopeByProjectIdFilter(user, { _id: objectId });
    return await Sprint.findOneAndUpdate(filter, allowlisted, { returnDocument: 'after' });
  } catch {
    return null;
  }
}

export async function deleteSprint(user: AuthUser, id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const filter = scopeByProjectIdFilter(user, { _id: objectId });
    return await Sprint.findOneAndUpdate(filter, { deletedAt: new Date() }, { returnDocument: 'after' });
  } catch {
    return null;
  }
}
