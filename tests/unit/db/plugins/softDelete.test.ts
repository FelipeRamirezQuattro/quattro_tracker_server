import mongoose, { Schema } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { softDeletePlugin } from '../../../../src/db/models/plugins/softDelete';

const testSchema = new Schema({ name: String });
softDeletePlugin(testSchema);
const TestModel = mongoose.model<any>('SoftDeleteTestModel', testSchema);

describe('softDeletePlugin', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('excludes soft-deleted documents from find by default', async () => {
    await TestModel.create({ name: 'alive' });
    await TestModel.create({ name: 'dead', deletedAt: new Date() });

    const results = await TestModel.find();
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('alive');
  });

  it('includes soft-deleted documents when includeDeleted is set', async () => {
    await TestModel.create({ name: 'alive' });
    await TestModel.create({ name: 'dead', deletedAt: new Date() });

    const results = await TestModel.find().setOptions({ includeDeleted: true });
    expect(results).toHaveLength(2);
  });
});
