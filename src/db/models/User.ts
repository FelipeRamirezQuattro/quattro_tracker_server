import mongoose, { Schema, Types } from 'mongoose';
import { softDeletePlugin } from './plugins/softDelete';

export type Role = 'admin' | 'user' | 'final_user';

export interface IUser {
  name: string;
  username: string;
  email?: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  assignedClientIds: Types.ObjectId[];
  assignedProjectIds: Types.ObjectId[];
  hourlyRate: number | null;
  tokenVersion: number;
  deletedAt: Date | null;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, unique: true, sparse: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user', 'final_user'], required: true, index: true },
    active: { type: Boolean, required: true, default: true },
    assignedClientIds: [{ type: Schema.Types.ObjectId, ref: 'Client', default: [] }],
    assignedProjectIds: [{ type: Schema.Types.ObjectId, ref: 'Project', default: [] }],
    hourlyRate: { type: Number, default: null },
    tokenVersion: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

userSchema.index({ assignedClientIds: 1 });
userSchema.index({ assignedProjectIds: 1 });

softDeletePlugin(userSchema);

export const User = mongoose.model<IUser>('User', userSchema);
