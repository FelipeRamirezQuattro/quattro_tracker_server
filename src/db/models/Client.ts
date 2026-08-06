import mongoose, { Schema } from 'mongoose';
import { softDeletePlugin } from './plugins/softDelete';

export interface IClient {
  name: string;
  phone?: string;
  email?: string;
  billingAddress?: string;
  active: boolean;
  deletedAt: Date | null;
}

const clientSchema = new Schema<IClient>(
  {
    name: { type: String, required: true, index: true },
    phone: { type: String },
    email: { type: String, unique: true, sparse: true },
    billingAddress: { type: String },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true }
);

softDeletePlugin(clientSchema);

export const Client = mongoose.model<IClient>('Client', clientSchema);
