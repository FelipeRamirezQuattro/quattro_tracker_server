import mongoose from 'mongoose';
import { Task } from '../db/models/Task';
import { AuthUser, scopeByProjectIdFilter } from './scope';
import { getProject } from './projectService';
import { nextRank } from '../helpers/rank';

interface TaskFilters {
  projectId: string;
  status?: string;
  sprintId?: string;
  epicId?: string;
  assigneeId?: string;
}

export async function listTasks(user: AuthUser, filters: TaskFilters) {
  const project = await getProject(user, filters.projectId);
  if (!project) return null;
  const baseFilter: Record<string, any> = { projectId: project._id };
  if (filters.status) baseFilter.status = filters.status;
  if (filters.sprintId) baseFilter.sprintId = filters.sprintId;
  if (filters.epicId) baseFilter.epicId = filters.epicId;
  if (filters.assigneeId) baseFilter.assigneeId = filters.assigneeId;
  return Task.find(scopeByProjectIdFilter(user, baseFilter)).sort({ rank: 1 });
}

export async function getTask(user: AuthUser, id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return await Task.findOne(scopeByProjectIdFilter(user, { _id: objectId }));
  } catch {
    return null;
  }
}

export async function createTask(user: AuthUser, data: any) {
  const project = await getProject(user, data.projectId);
  if (!project) return null;

  const { title, description, epicId, sprintId, priority, assigneeId, storyPoints, labels, dueDate } = data;
  const maxRankDoc = await Task.findOne({ projectId: project._id, status: 'backlog' }).sort({ rank: -1 });

  return Task.create({
    projectId: project._id,
    title,
    description: description || '',
    epicId: epicId || null,
    sprintId: sprintId || null,
    priority: priority || 'medium',
    assigneeId: assigneeId || null,
    reporterId: user.id,
    storyPoints: storyPoints ?? null,
    labels: labels || [],
    dueDate,
    rank: nextRank(maxRankDoc ? maxRankDoc.rank : null),
    status: 'backlog',
  });
}

// `status` is intentionally not allowlisted here — it only moves through
// transitionTaskStatus (taskStatusService.ts), which enforces the workflow
// matrix and the Definition-of-Ready gate.
export async function updateTask(user: AuthUser, id: string, data: any) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const { title, description, epicId, sprintId, priority, assigneeId, storyPoints, labels, dueDate, isBlocked, rank } = data;
    const allowlisted: Record<string, any> = {};
    if (title !== undefined) allowlisted.title = title;
    if (description !== undefined) allowlisted.description = description;
    if (epicId !== undefined) allowlisted.epicId = epicId;
    if (sprintId !== undefined) allowlisted.sprintId = sprintId;
    if (priority !== undefined) allowlisted.priority = priority;
    if (assigneeId !== undefined) allowlisted.assigneeId = assigneeId;
    if (storyPoints !== undefined) allowlisted.storyPoints = storyPoints;
    if (labels !== undefined) allowlisted.labels = labels;
    if (dueDate !== undefined) allowlisted.dueDate = dueDate;
    if (isBlocked !== undefined) allowlisted.isBlocked = isBlocked;
    if (rank !== undefined) allowlisted.rank = rank;
    const filter = scopeByProjectIdFilter(user, { _id: objectId });
    return await Task.findOneAndUpdate(filter, allowlisted, { returnDocument: 'after' });
  } catch {
    return null;
  }
}

export async function deleteTask(user: AuthUser, id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const filter = scopeByProjectIdFilter(user, { _id: objectId });
    return await Task.findOneAndUpdate(filter, { deletedAt: new Date() }, { returnDocument: 'after' });
  } catch {
    return null;
  }
}
