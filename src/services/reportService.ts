import mongoose from 'mongoose';
import { TimeEntry } from '../db/models/TimeEntry';
import { User } from '../db/models/User';
import { toDayDate } from '../helpers/date';
import { Sprint } from '../db/models/Sprint';
import { Task } from '../db/models/Task';

interface DateRange {
  from: string;
  to: string;
}

async function userBreakdown(matchStage: Record<string, any>) {
  const rows = await TimeEntry.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$userId',
        totalMinutes: { $sum: '$durationMinutes' },
        billableMinutes: { $sum: { $cond: ['$billable', '$durationMinutes', 0] } },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    // preserveNullAndEmptyArrays: a plain $unwind is an inner join — a
    // TimeEntry with a userId that doesn't match any User document (e.g. an
    // orphaned reference) would otherwise drop that group's row entirely,
    // silently excluding its minutes/cost from the totals reduced below.
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        name: { $ifNull: ['$user.name', null] },
        totalMinutes: 1,
        billableMinutes: 1,
        cost: { $multiply: [{ $divide: ['$totalMinutes', 60] }, { $ifNull: ['$user.hourlyRate', 0] }] },
      },
    },
  ]);

  const totalMinutes = rows.reduce((sum: number, r: any) => sum + r.totalMinutes, 0);
  const billableMinutes = rows.reduce((sum: number, r: any) => sum + r.billableMinutes, 0);
  const totalCost = rows.reduce((sum: number, r: any) => sum + r.cost, 0);
  return { rows, totalMinutes, billableMinutes, totalCost };
}

export async function reportByProject(projectId: string, range: DateRange) {
  const matchStage = {
    projectId: new mongoose.Types.ObjectId(projectId),
    date: { $gte: toDayDate(range.from), $lte: toDayDate(range.to) },
    deletedAt: null,
  };
  const { rows, totalMinutes, billableMinutes, totalCost } = await userBreakdown(matchStage);
  return { totalMinutes, billableMinutes, totalCost, byUser: rows };
}

export async function reportByClient(clientId: string, range: DateRange) {
  const matchStage = {
    clientId: new mongoose.Types.ObjectId(clientId),
    date: { $gte: toDayDate(range.from), $lte: toDayDate(range.to) },
    deletedAt: null,
  };

  const byProject = await TimeEntry.aggregate([
    { $match: matchStage },
    { $group: { _id: '$projectId', totalMinutes: { $sum: '$durationMinutes' } } },
    { $lookup: { from: 'projects', localField: '_id', foreignField: '_id', as: 'project' } },
    { $unwind: '$project' },
    { $project: { _id: 0, projectId: '$_id', name: '$project.name', totalMinutes: 1 } },
  ]);

  const { totalMinutes, billableMinutes, totalCost } = await userBreakdown(matchStage);
  return { totalMinutes, billableMinutes, totalCost, byProject };
}

export async function reportByUser(userId: string, range: DateRange) {
  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
    date: { $gte: toDayDate(range.from), $lte: toDayDate(range.to) },
    deletedAt: null,
  };

  const byClientProject = await TimeEntry.aggregate([
    { $match: matchStage },
    { $group: { _id: { client: '$clientId', project: '$projectId' }, totalMinutes: { $sum: '$durationMinutes' } } },
    { $lookup: { from: 'clients', localField: '_id.client', foreignField: '_id', as: 'client' } },
    { $lookup: { from: 'projects', localField: '_id.project', foreignField: '_id', as: 'project' } },
    // preserveNullAndEmptyArrays: same inner-join hazard as userBreakdown —
    // an orphaned client/project reference must not silently drop that
    // group's minutes from the totalMinutes reduced below.
    { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        clientId: '$_id.client',
        clientName: { $ifNull: ['$client.name', null] },
        projectId: '$_id.project',
        projectName: { $ifNull: ['$project.name', null] },
        totalMinutes: 1,
      },
    },
  ]);

  // .setOptions({ includeDeleted: true }): a soft-deleted user's real
  // hourlyRate must still be applied here so this matches userBreakdown's
  // $lookup (which runs inside .aggregate() and is NOT hooked by
  // softDeletePlugin's pre(/^find/) middleware) — otherwise an offboarded
  // employee's cost shows up in reportByProject/reportByClient but as $0
  // here, for the same underlying TimeEntry documents.
  const user = await User.findById(userId).setOptions({ includeDeleted: true });
  const hourlyRate = user?.hourlyRate ?? 0;
  const totalMinutes = byClientProject.reduce((sum: number, r: any) => sum + r.totalMinutes, 0);
  const totalCost = (totalMinutes / 60) * hourlyRate;

  return { totalMinutes, totalCost, byClientProject };
}

export async function reportTimeline(
  scope: 'project' | 'client',
  scopeId: string,
  range: DateRange,
  granularity: 'day' | 'week' | 'month'
) {
  const scopeField = scope === 'project' ? 'projectId' : 'clientId';
  const matchStage = {
    [scopeField]: new mongoose.Types.ObjectId(scopeId),
    date: { $gte: toDayDate(range.from), $lte: toDayDate(range.to) },
    deletedAt: null,
  };

  return TimeEntry.aggregate([
    { $match: matchStage },
    { $group: { _id: { $dateTrunc: { date: '$date', unit: granularity } }, totalMinutes: { $sum: '$durationMinutes' } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, bucket: '$_id', totalMinutes: 1 } },
  ]);
}

export async function reportVelocity(projectId: string) {
  const sprints = await Sprint.find({
    projectId: new mongoose.Types.ObjectId(projectId),
    status: 'completed',
  }).sort({ endDate: 1 });

  const results = await Promise.all(
    sprints.map(async (sprint) => {
      const rows = await Task.aggregate([
        { $match: { sprintId: sprint._id, status: 'done', deletedAt: null } },
        { $group: { _id: null, totalPoints: { $sum: { $ifNull: ['$storyPoints', 0] } } } },
      ]);
      return {
        sprintId: String(sprint._id),
        sprintName: sprint.name,
        completedPoints: rows[0]?.totalPoints ?? 0,
      };
    })
  );

  return results;
}
