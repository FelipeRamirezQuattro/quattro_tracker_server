import mongoose from 'mongoose';
import { Ticket } from '../db/models/Ticket';
import { Task } from '../db/models/Task';
import { AuthUser, scopeByProjectIdFilter } from './scope';
import { nextRank } from '../helpers/rank';

export class AlreadyPromotedError extends Error {}

export async function promoteTicket(user: AuthUser, ticketId: string) {
  let ticket;
  try {
    const objectId = new mongoose.Types.ObjectId(ticketId);
    ticket = await Ticket.findOne(scopeByProjectIdFilter(user, { _id: objectId }));
  } catch {
    return null;
  }
  if (!ticket) return null;
  if (ticket.promotedTaskId) {
    throw new AlreadyPromotedError('This ticket has already been promoted to a task');
  }

  const maxRankDoc = await Task.findOne({ projectId: ticket.projectId, status: 'backlog' }).sort({ rank: -1 });
  const task = await Task.create({
    projectId: ticket.projectId,
    title: ticket.subject,
    description: '',
    reporterId: user.id,
    status: 'backlog',
    rank: nextRank(maxRankDoc ? maxRankDoc.rank : null),
  });

  ticket.promotedTaskId = task._id;
  await ticket.save();
  return { ticket, task };
}
