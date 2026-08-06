import mongoose, { Schema, Types } from 'mongoose';
import { softDeletePlugin } from './plugins/softDelete';

export type TaskStatus = 'backlog' | 'ready' | 'in_progress' | 'in_review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export const TASK_STATUSES: TaskStatus[] = ['backlog', 'ready', 'in_progress', 'in_review', 'done'];

export interface ISubTask {
  _id: Types.ObjectId;
  title: string;
  status: TaskStatus;
  assigneeId: Types.ObjectId | null;
  storyPoints: number | null;
}

export interface ITask {
  projectId: Types.ObjectId;
  epicId: Types.ObjectId | null;
  sprintId: Types.ObjectId | null;
  title: string;
  description: string;
  status: TaskStatus;
  isBlocked: boolean;
  priority: TaskPriority;
  assigneeId: Types.ObjectId | null;
  reporterId: Types.ObjectId;
  storyPoints: number | null;
  labels: string[];
  dueDate?: Date;
  rank: number;
  subtasks: mongoose.Types.DocumentArray<ISubTask>;
  deletedAt: Date | null;
}

const subTaskSchema = new Schema<ISubTask>({
  title: { type: String, required: true },
  status: { type: String, enum: TASK_STATUSES, required: true, default: 'backlog' },
  assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  storyPoints: { type: Number, default: null },
});

const taskSchema = new Schema<ITask>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    epicId: { type: Schema.Types.ObjectId, ref: 'Epic', default: null, index: true },
    sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint', default: null, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: TASK_STATUSES, required: true, default: 'backlog', index: true },
    isBlocked: { type: Boolean, required: true, default: false },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], required: true, default: 'medium' },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storyPoints: { type: Number, default: null },
    labels: [{ type: String, default: [] }],
    dueDate: { type: Date },
    rank: { type: Number, required: true },
    subtasks: [subTaskSchema],
  },
  { timestamps: true }
);

taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ projectId: 1, sprintId: 1 });
taskSchema.index({ assigneeId: 1, status: 1 });

softDeletePlugin(taskSchema);

export const Task = mongoose.model<ITask>('Task', taskSchema);
