import { Schema } from 'mongoose';

export function softDeletePlugin(schema: Schema): void {
  schema.add({ deletedAt: { type: Date, default: null } });

  schema.index({ deletedAt: 1 });

  schema.pre(/^find/, function () {
    const query = this as any;
    if (!query.getOptions().includeDeleted) {
      query.where({ deletedAt: null });
    }
  });

  schema.pre('countDocuments', function () {
    const query = this as any;
    if (!query.getOptions().includeDeleted) {
      query.where({ deletedAt: null });
    }
  });
}
