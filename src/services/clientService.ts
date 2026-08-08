import mongoose from 'mongoose';
import { Client } from '../db/models/Client';
import { Project } from '../db/models/Project';
import { AuthUser, scopeClientFilter } from './scope';
import { HasDependentRecordsError } from './errors';

export async function listClients(user: AuthUser) {
  return Client.find(scopeClientFilter(user));
}

export async function getClient(user: AuthUser, id: string) {
  try {
    // Try to create an ObjectId from the id string
    const objectId = new mongoose.Types.ObjectId(id);
    const filter = scopeClientFilter(user, { _id: objectId });
    return Client.findOne(filter);
  } catch {
    // If id is not a valid ObjectId, return null
    return null;
  }
}

export async function createClient(data: { name: string; phone?: string; email?: string; billingAddress?: string }) {
  return Client.create(data);
}

export async function updateClient(user: AuthUser, id: string, data: any) {
  // Allowlist permitted fields only — strip deletedAt, _id, timestamps, etc.
  const { name, phone, email, billingAddress, active } = data;
  const allowlistedData: Partial<{ name: string; phone: string; email: string; billingAddress: string; active: boolean }> = {};
  if (name !== undefined) allowlistedData.name = name;
  if (phone !== undefined) allowlistedData.phone = phone;
  if (email !== undefined) allowlistedData.email = email;
  if (billingAddress !== undefined) allowlistedData.billingAddress = billingAddress;
  if (active !== undefined) allowlistedData.active = active;

  // Use scoped query to ensure user can only update their assigned clients
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const filter = scopeClientFilter(user, { _id: objectId });
    return Client.findOneAndUpdate(filter, allowlistedData, { returnDocument: 'after' });
  } catch {
    // If id is not a valid ObjectId, return null
    return null;
  }
}

export async function deleteClient(id: string) {
  const hasProjects = await Project.exists({ clientId: id });
  if (hasProjects) {
    throw new HasDependentRecordsError(
      'Cannot delete a client that still has projects. Archive or delete its projects first.'
    );
  }
  return Client.findByIdAndUpdate(id, { deletedAt: new Date() }, { returnDocument: 'after' });
}
