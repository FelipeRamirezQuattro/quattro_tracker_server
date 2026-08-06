import mongoose from 'mongoose';
import { Epic } from '../db/models/Epic';
import { AuthUser, scopeByProjectIdFilter } from './scope';
import { getProject } from './projectService';

export async function listEpics(user: AuthUser, projectId: string) {
  const project = await getProject(user, projectId);
  if (!project) return null;
  return Epic.find(scopeByProjectIdFilter(user, { projectId: project._id }));
}

export async function getEpic(user: AuthUser, id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return await Epic.findOne(scopeByProjectIdFilter(user, { _id: objectId }));
  } catch {
    return null;
  }
}

export async function createEpic(user: AuthUser, projectId: string, data: any) {
  const project = await getProject(user, projectId);
  if (!project) return null;
  const { title, description, color, targetDate } = data;
  return Epic.create({ projectId: project._id, title, description, color, targetDate });
}

export async function updateEpic(user: AuthUser, id: string, data: any) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const { title, description, status, color, targetDate } = data;
    const allowlisted: Record<string, any> = {};
    if (title !== undefined) allowlisted.title = title;
    if (description !== undefined) allowlisted.description = description;
    if (status !== undefined) allowlisted.status = status;
    if (color !== undefined) allowlisted.color = color;
    if (targetDate !== undefined) allowlisted.targetDate = targetDate;
    const filter = scopeByProjectIdFilter(user, { _id: objectId });
    return await Epic.findOneAndUpdate(filter, allowlisted, { returnDocument: 'after' });
  } catch {
    return null;
  }
}

export async function deleteEpic(user: AuthUser, id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const filter = scopeByProjectIdFilter(user, { _id: objectId });
    return await Epic.findOneAndUpdate(filter, { deletedAt: new Date() }, { returnDocument: 'after' });
  } catch {
    return null;
  }
}
