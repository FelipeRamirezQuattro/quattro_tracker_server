import mongoose from 'mongoose';
import { Task } from '../db/models/Task';
import { AuthUser, scopeByProjectIdFilter } from './scope';

async function loadScopedTask(user: AuthUser, taskId: string) {
  const objectId = new mongoose.Types.ObjectId(taskId);
  return Task.findOne(scopeByProjectIdFilter(user, { _id: objectId }));
}

export async function addSubtask(user: AuthUser, taskId: string, data: any) {
  // Only the task lookup (which includes parsing taskId as an ObjectId) is
  // treated as "not found" -> null. A mongoose.Error.ValidationError thrown
  // by task.save() below (e.g. a subtask missing its required title) is
  // intentionally allowed to propagate so the route can map it to a 400.
  let task;
  try {
    task = await loadScopedTask(user, taskId);
  } catch {
    return null;
  }
  if (!task) return null;
  const { title, assigneeId, storyPoints } = data;
  task.subtasks.push({
    title,
    assigneeId: assigneeId || null,
    storyPoints: storyPoints ?? null,
    status: 'backlog',
  } as any);
  await task.save();
  return task;
}

export async function updateSubtask(user: AuthUser, taskId: string, subtaskId: string, data: any) {
  try {
    const task = await loadScopedTask(user, taskId);
    if (!task) return null;
    const subtask = task.subtasks.id(subtaskId);
    if (!subtask) return null;
    const { title, status, assigneeId, storyPoints } = data;
    if (title !== undefined) subtask.title = title;
    if (status !== undefined) subtask.status = status;
    if (assigneeId !== undefined) subtask.assigneeId = assigneeId;
    if (storyPoints !== undefined) subtask.storyPoints = storyPoints;
    await task.save();
    return task;
  } catch {
    return null;
  }
}

export async function deleteSubtask(user: AuthUser, taskId: string, subtaskId: string) {
  try {
    const task = await loadScopedTask(user, taskId);
    if (!task) return null;
    const subtask = task.subtasks.id(subtaskId);
    if (!subtask) return null;
    subtask.deleteOne();
    await task.save();
    return task;
  } catch {
    return null;
  }
}
