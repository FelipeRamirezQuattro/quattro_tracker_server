import mongoose from 'mongoose';
import { Client } from '../db/models/Client';
import { AuthUser, scopeClientFilter } from './scope';

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

export async function updateClient(id: string, data: any) {
  // Allowlist permitted fields only — strip deletedAt, _id, timestamps, etc.
  const { name, phone, email, billingAddress, active } = data;
  const allowlistedData: Partial<{ name: string; phone: string; email: string; billingAddress: string; active: boolean }> = {};
  if (name !== undefined) allowlistedData.name = name;
  if (phone !== undefined) allowlistedData.phone = phone;
  if (email !== undefined) allowlistedData.email = email;
  if (billingAddress !== undefined) allowlistedData.billingAddress = billingAddress;
  if (active !== undefined) allowlistedData.active = active;
  return Client.findByIdAndUpdate(id, allowlistedData, { returnDocument: 'after' });
}

export async function deleteClient(id: string) {
  return Client.findByIdAndUpdate(id, { deletedAt: new Date() }, { returnDocument: 'after' });
}
