import mongoose, { Schema, Types } from 'mongoose';
import { softDeletePlugin } from './plugins/softDelete';

export interface IComment {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  comment: string;
  isAdmin: boolean;
  attachmentKey: string | null;
  createdAt: Date;
}

export interface ITicket {
  clientId: Types.ObjectId;
  projectId: Types.ObjectId;
  subject: string;
  solved: boolean;
  comments: mongoose.Types.DocumentArray<IComment>;
  promotedTaskId: Types.ObjectId | null;
  deletedAt: Date | null;
}

const commentSchema = new Schema<IComment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    comment: { type: String, required: true },
    isAdmin: { type: Boolean, required: true, default: false },
    attachmentKey: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The raw S3 key must never leave the server in a JSON response (see Global
// Constraints). Comments are only ever read by clients through the parent
// Ticket document's JSON serialization (listTickets/getTicket/addComment
// responses), so a transform on this subdocument's own `toJSON` is enough —
// Mongoose invokes each subdocument's own `toJSON` options when the parent
// document is serialized. `commentService.findAttachment` reads
// `comment.attachmentKey` directly off the Mongoose document (never through
// `.toJSON()`/`JSON.stringify()`), so that path is unaffected by this.
commentSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    ret.hasAttachment = ret.attachmentKey != null;
    delete ret.attachmentKey;
    return ret;
  },
});

const ticketSchema = new Schema<ITicket>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    subject: { type: String, required: true },
    solved: { type: Boolean, required: true, default: false, index: true },
    comments: [commentSchema],
    promotedTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { timestamps: true }
);

ticketSchema.index({ clientId: 1, projectId: 1 });
ticketSchema.index({ projectId: 1, solved: 1 });

softDeletePlugin(ticketSchema);

export const Ticket = mongoose.model<ITicket>('Ticket', ticketSchema);
