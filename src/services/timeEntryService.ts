import mongoose from 'mongoose';
import { TimeEntry } from '../db/models/TimeEntry';
import { Project } from '../db/models/Project';
import { User } from '../db/models/User';
import { AuthUser, scopeOwnUserFilter } from './scope';
import { getTask } from './taskService';
import { toDayDate } from '../helpers/date';

interface TimeEntryFilters {
  userId?: string;
  taskId?: string;
  projectId?: string;
  clientId?: string;
  from?: string;
  to?: string;
}

export async function listTimeEntries(user: AuthUser, filters: TimeEntryFilters) {
  const baseFilter: Record<string, any> = {};
  // Non-admins are always scoped to their own entries via scopeOwnUserFilter below;
  // a userId filter from the request body only makes sense for an admin browsing
  // someone else's entries. Setting it unconditionally would leave a non-admin's
  // baseFilter.userId already populated, which scopeOwnUserFilter combines with an
  // impossible `$and` (userId == filters.userId AND userId == self) instead of
  // silently ignoring the filter, so it's gated on role here.
  if (filters.userId && user.role === 'admin') baseFilter.userId = filters.userId;
  if (filters.taskId) baseFilter.taskId = filters.taskId;
  if (filters.projectId) baseFilter.projectId = filters.projectId;
  if (filters.clientId) baseFilter.clientId = filters.clientId;
  if (filters.from || filters.to) {
    baseFilter.date = {};
    if (filters.from) baseFilter.date.$gte = toDayDate(filters.from);
    if (filters.to) baseFilter.date.$lte = toDayDate(filters.to);
  }
  return TimeEntry.find(scopeOwnUserFilter(user, baseFilter)).sort({ date: -1 });
}

export async function getTimeEntry(user: AuthUser, id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return await TimeEntry.findOne(scopeOwnUserFilter(user, { _id: objectId }));
  } catch {
    return null;
  }
}

export async function createTimeEntry(user: AuthUser, data: any) {
  const task = await getTask(user, data.taskId);
  if (!task) return null;

  if (data.subtaskId) {
    const hasSubtask = task.subtasks.some((s) => String(s._id) === String(data.subtaskId));
    if (!hasSubtask) return null;
  }

  const project = await Project.findById(task.projectId);
  if (!project) return null;

  const userId = user.role === 'admin' && data.userId ? data.userId : user.id;

  // An admin may log time on behalf of any userId string, but nothing verified
  // it actually names a real User — an admin-supplied garbage/nonexistent id
  // would still create a TimeEntry, silently corrupting report aggregations
  // (see reportService's userBreakdown $lookup). Validate it against a live
  // (non-soft-deleted) User document first, same "not found" convention as
  // the taskId/subtaskId/project checks above.
  if (user.role === 'admin' && data.userId) {
    let targetUser = null;
    try {
      targetUser = await User.findById(data.userId);
    } catch {
      targetUser = null;
    }
    if (!targetUser) return null;
  }

  const { date, durationMinutes, startedAt, stoppedAt, billable, note } = data;

  return TimeEntry.create({
    userId,
    taskId: task._id,
    subtaskId: data.subtaskId || null,
    projectId: project._id,
    clientId: project.clientId,
    date: toDayDate(date),
    durationMinutes,
    startedAt: startedAt || null,
    stoppedAt: stoppedAt || null,
    billable: billable ?? true,
    note: note || '',
  });
}

export async function updateTimeEntry(user: AuthUser, id: string, data: any) {
  // Only the id-cast is guarded here — a bad :id is a 404, not a validation
  // error. runValidators: true below can throw mongoose.Error.ValidationError
  // (e.g. durationMinutes' `min: 1` constraint), which must NOT be swallowed
  // into this function's own catch, or the route would 404 instead of 400.
  // That error is left to propagate to the route handler, same as
  // createTimeEntry's TimeEntry.create() above.
  let objectId: mongoose.Types.ObjectId;
  try {
    objectId = new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
  const filter = scopeOwnUserFilter(user, { _id: objectId });
  const { date, durationMinutes, startedAt, stoppedAt, billable, note } = data;
  const allowlisted: Record<string, any> = {};
  if (date !== undefined) allowlisted.date = toDayDate(date);
  if (durationMinutes !== undefined) allowlisted.durationMinutes = durationMinutes;
  if (startedAt !== undefined) allowlisted.startedAt = startedAt;
  if (stoppedAt !== undefined) allowlisted.stoppedAt = stoppedAt;
  if (billable !== undefined) allowlisted.billable = billable;
  if (note !== undefined) allowlisted.note = note;
  return TimeEntry.findOneAndUpdate(filter, allowlisted, { returnDocument: 'after', runValidators: true });
}

export async function deleteTimeEntry(user: AuthUser, id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const filter = scopeOwnUserFilter(user, { _id: objectId });
    return await TimeEntry.findOneAndUpdate(filter, { deletedAt: new Date() }, { returnDocument: 'after' });
  } catch {
    return null;
  }
}
