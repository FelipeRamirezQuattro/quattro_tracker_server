import { Client } from '../db/models/Client';
import { AuthUser, scopeClientFilter } from './scope';

export async function listClients(user: AuthUser) {
  return Client.find(scopeClientFilter(user));
}

export async function getClient(user: AuthUser, id: string) {
  return Client.findOne(scopeClientFilter(user, { _id: id }));
}

export async function createClient(data: { name: string; phone?: string; email?: string; billingAddress?: string }) {
  return Client.create(data);
}

export async function updateClient(id: string, data: Partial<{ name: string; phone: string; email: string; billingAddress: string; active: boolean }>) {
  return Client.findByIdAndUpdate(id, data, { returnDocument: 'after' });
}

export async function deleteClient(id: string) {
  return Client.findByIdAndUpdate(id, { deletedAt: new Date() }, { returnDocument: 'after' });
}
