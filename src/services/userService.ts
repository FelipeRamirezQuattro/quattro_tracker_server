import mongoose from 'mongoose';
import { User, Role } from '../db/models/User';
import { hashPassword } from '../helpers/password';
import { Env } from '../config/env';

export async function listUsers() {
  return User.find().select('-passwordHash');
}

export async function getUser(id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return User.findById(objectId).select('-passwordHash');
  } catch {
    return null;
  }
}

interface CreateUserData {
  name: string;
  username: string;
  password: string;
  role: Role;
  email?: string;
  assignedClientIds?: string[];
  assignedProjectIds?: string[];
  hourlyRate?: number;
}

export async function createUser(data: CreateUserData, env: Env) {
  const passwordHash = await hashPassword(data.password, env.bcryptCostFactor);
  const user = await User.create({
    name: data.name,
    username: data.username,
    passwordHash,
    role: data.role,
    email: data.email,
    assignedClientIds: data.assignedClientIds || [],
    assignedProjectIds: data.assignedProjectIds || [],
    hourlyRate: data.hourlyRate ?? null,
  });
  return User.findById(user._id).select('-passwordHash');
}

export async function updateUser(
  id: string,
  data: Partial<{
    name: string;
    email: string;
    role: Role;
    active: boolean;
    assignedClientIds: string[];
    assignedProjectIds: string[];
    hourlyRate: number;
  }>
) {
  // Allowlist permitted fields only — strip passwordHash, deletedAt, tokenVersion, _id, timestamps, etc.
  const allowlistedData: Partial<{
    name: string;
    email: string;
    role: Role;
    active: boolean;
    assignedClientIds: string[];
    assignedProjectIds: string[];
    hourlyRate: number;
  }> = {};

  if (data.name !== undefined) allowlistedData.name = data.name;
  if (data.email !== undefined) allowlistedData.email = data.email;
  if (data.role !== undefined) allowlistedData.role = data.role;
  if (data.active !== undefined) allowlistedData.active = data.active;
  if (data.assignedClientIds !== undefined) allowlistedData.assignedClientIds = data.assignedClientIds;
  if (data.assignedProjectIds !== undefined) allowlistedData.assignedProjectIds = data.assignedProjectIds;
  if (data.hourlyRate !== undefined) allowlistedData.hourlyRate = data.hourlyRate;

  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const user = await User.findById(objectId);
    if (!user) return null;

    Object.assign(user, allowlistedData);
    user.tokenVersion += 1;
    await user.save();
    return User.findById(objectId).select('-passwordHash');
  } catch {
    return null;
  }
}

export async function deleteUser(id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return User.findByIdAndUpdate(objectId, { deletedAt: new Date() }, { returnDocument: 'after' });
  } catch {
    return null;
  }
}
