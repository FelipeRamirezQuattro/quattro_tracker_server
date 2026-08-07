import mongoose from 'mongoose';
import { Ticket } from '../db/models/Ticket';
import { AuthUser } from './scope';
import { scopeTicketFilter } from './ticketService';

export async function addComment(
  user: AuthUser,
  ticketId: string,
  data: { comment: string; attachmentKey?: string | null }
) {
  // Only the ObjectId construction + lookup are wrapped: a malformed id or an
  // out-of-scope/nonexistent ticket should map to null (-> 404 in the route).
  // ticket.save() below runs OUTSIDE this try/catch on purpose, so a
  // mongoose.Error.ValidationError (e.g. an empty/missing `comment`) escapes
  // to the caller instead of being swallowed into the same null/404 path —
  // the route's ValidationError -> 400 branch depends on this.
  let ticket;
  try {
    const objectId = new mongoose.Types.ObjectId(ticketId);
    ticket = await Ticket.findOne(scopeTicketFilter(user, { _id: objectId }));
    if (!ticket) return null;
  } catch {
    return null;
  }

  ticket.comments.push({
    userId: new mongoose.Types.ObjectId(user.id),
    comment: data.comment,
    isAdmin: user.role !== 'final_user',
    attachmentKey: data.attachmentKey ?? null,
  } as any);
  await ticket.save();
  return ticket;
}

export async function findAttachment(user: AuthUser, attachmentId: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(attachmentId);
    const ticket = await Ticket.findOne(scopeTicketFilter(user, { 'comments._id': objectId }));
    if (!ticket) return null;
    const comment = ticket.comments.id(objectId);
    if (!comment) return null;
    return { ticket, comment };
  } catch {
    return null;
  }
}
