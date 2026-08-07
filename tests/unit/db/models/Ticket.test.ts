import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { Ticket } from '../../../../src/db/models/Ticket';

describe('Ticket model', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a ticket with defaults', async () => {
    const ticket = await Ticket.create({
      clientId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      subject: 'Cannot log in',
    });
    expect(ticket.solved).toBe(false);
    expect(ticket.comments).toHaveLength(0);
    expect(ticket.promotedTaskId).toBeNull();
    expect(ticket.deletedAt).toBeNull();
  });

  it('requires clientId, projectId, and subject', async () => {
    await expect(Ticket.create({} as any)).rejects.toThrow();
  });

  it('defaults an embedded comment\'s isAdmin to false and attachmentKey to null', async () => {
    const ticket = await Ticket.create({
      clientId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      subject: 'X',
      comments: [{ userId: new mongoose.Types.ObjectId(), comment: 'First reply' }],
    });
    expect(ticket.comments[0].isAdmin).toBe(false);
    expect(ticket.comments[0].attachmentKey).toBeNull();
    expect(ticket.comments[0].createdAt).toBeInstanceOf(Date);
  });

  it('is excluded from find() once soft-deleted', async () => {
    const ticket = await Ticket.create({
      clientId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      subject: 'X',
      deletedAt: new Date(),
    });
    expect(await Ticket.findById(ticket._id)).toBeNull();
  });

  it('strips attachmentKey and adds hasAttachment when a comment is serialized as part of the parent ticket (JSON.stringify)', async () => {
    const ticket = await Ticket.create({
      clientId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      subject: 'X',
      comments: [
        { userId: new mongoose.Types.ObjectId(), comment: 'has a file', attachmentKey: 'tickets/secret-key.png' },
        { userId: new mongoose.Types.ObjectId(), comment: 'no file' },
      ],
    });

    // Round-trip through JSON exactly as res.json(...) would in a route handler.
    const serialized = JSON.parse(JSON.stringify(ticket));

    expect(serialized.comments[0].hasAttachment).toBe(true);
    expect(serialized.comments[0].attachmentKey).toBeUndefined();
    expect(serialized.comments[1].hasAttachment).toBe(false);
    expect(serialized.comments[1].attachmentKey).toBeUndefined();

    // But the raw Mongoose document (not serialized) still exposes the real key —
    // commentService.findAttachment relies on this direct property access.
    expect(ticket.comments[0].attachmentKey).toBe('tickets/secret-key.png');
  });
});
