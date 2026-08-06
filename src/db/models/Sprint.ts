import mongoose, { Schema, Types } from 'mongoose';
import { softDeletePlugin } from './plugins/softDelete';

export type SprintStatus = 'planned' | 'active' | 'completed';

export interface ISprint {
  projectId: Types.ObjectId;
  name: string;
  goal?: string;
  startDate: Date;
  endDate: Date;
  status: SprintStatus;
  deletedAt: Date | null;
}

const sprintSchema = new Schema<ISprint>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true },
    goal: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['planned', 'active', 'completed'], required: true, default: 'planned', index: true },
  },
  { timestamps: true }
);

sprintSchema.index({ projectId: 1, status: 1 });

softDeletePlugin(sprintSchema);

export const Sprint = mongoose.model<ISprint>('Sprint', sprintSchema);
