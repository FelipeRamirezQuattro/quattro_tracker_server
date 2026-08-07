import mongoose from 'mongoose';
import { Task, TaskStatus } from '../db/models/Task';
import { AuthUser, scopeByProjectIdFilter } from './scope';

export class InvalidTransitionError extends Error {}
export class DefinitionOfReadyError extends Error {}

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['ready'],
  ready: ['in_progress', 'backlog'],
  in_progress: ['in_review', 'backlog'],
  in_review: ['done', 'in_progress'],
  done: ['in_review', 'in_progress'],
};

export async function transitionTaskStatus(user: AuthUser, id: string, newStatus: TaskStatus) {
  let task;
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    task = await Task.findOne(scopeByProjectIdFilter(user, { _id: objectId }));
  } catch {
    return null;
  }
  if (!task) return null;

  if (!ALLOWED_TRANSITIONS[task.status].includes(newStatus)) {
    throw new InvalidTransitionError(`Cannot move a task from ${task.status} to ${newStatus}`);
  }

  if (task.status === 'backlog' && newStatus === 'ready') {
    if (!task.description || task.storyPoints == null || !task.assigneeId) {
      throw new DefinitionOfReadyError(
        'Task needs a description, story points, and an assignee before leaving the backlog'
      );
    }
  }

  task.status = newStatus;
  await task.save();
  return task;
}
