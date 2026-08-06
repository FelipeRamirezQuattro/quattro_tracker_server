import mongoose, { Schema, Types } from 'mongoose';
import { softDeletePlugin } from './plugins/softDelete';

export type EpicStatus = 'open' | 'in_progress' | 'done';

export interface IEpic {
  projectId: Types.ObjectId;
  title: string;
  description?: string;
  status: EpicStatus;
  color?: string;
  targetDate?: Date;
  deletedAt: Date | null;
}

const epicSchema = new Schema<IEpic>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ['open', 'in_progress', 'done'], required: true, default: 'open' },
    color: { type: String },
    targetDate: { type: Date },
  },
  { timestamps: true }
);

softDeletePlugin(epicSchema);

export const Epic = mongoose.model<IEpic>('Epic', epicSchema);
