import mongoose, { Schema, Types } from 'mongoose';
import { softDeletePlugin } from './plugins/softDelete';

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';

export interface IProject {
  clientId: Types.ObjectId;
  name: string;
  description?: string;
  status: ProjectStatus;
  startDate?: Date;
  targetDate?: Date;
  guideUrl?: string;
  assignedUserIds: Types.ObjectId[];
  deletedAt: Date | null;
}

const projectSchema = new Schema<IProject>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    status: {
      type: String,
      enum: ['active', 'on_hold', 'completed', 'archived'],
      required: true,
      default: 'active',
      index: true,
    },
    startDate: { type: Date },
    targetDate: { type: Date },
    guideUrl: { type: String },
    assignedUserIds: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
  },
  { timestamps: true }
);

projectSchema.index({ assignedUserIds: 1 });

softDeletePlugin(projectSchema);

export const Project = mongoose.model<IProject>('Project', projectSchema);
