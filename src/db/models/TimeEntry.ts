import mongoose, { Schema, Types } from 'mongoose';
import { softDeletePlugin } from './plugins/softDelete';

export interface ITimeEntry {
  userId: Types.ObjectId;
  taskId: Types.ObjectId;
  subtaskId: Types.ObjectId | null;
  projectId: Types.ObjectId;
  clientId: Types.ObjectId;
  date: Date;
  durationMinutes: number;
  startedAt: Date | null;
  stoppedAt: Date | null;
  billable: boolean;
  note: string;
  deletedAt: Date | null;
}

const timeEntrySchema = new Schema<ITimeEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    subtaskId: { type: Schema.Types.ObjectId, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    date: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    startedAt: { type: Date, default: null },
    stoppedAt: { type: Date, default: null },
    billable: { type: Boolean, required: true, default: true, index: true },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

timeEntrySchema.index({ userId: 1, date: 1 });
timeEntrySchema.index({ projectId: 1, date: 1 });
timeEntrySchema.index({ clientId: 1, date: 1 });

softDeletePlugin(timeEntrySchema);

export const TimeEntry = mongoose.model<ITimeEntry>('TimeEntry', timeEntrySchema);
