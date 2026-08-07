const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

// Must be set before attachmentService is imported below: BUCKET is captured
// once from process.env.AWS_S3_BUCKET at module load time, not read per-call.
// Setting this in a beforeEach would be too late and would leave BUCKET as ''
// for the whole suite, masking a regression that always sent an empty/undefined
// Bucket to S3.
process.env.AWS_S3_BUCKET = 'test-bucket';

import { generateAttachmentKey, uploadAttachment, getAttachmentObject } from '../../../src/services/attachmentService';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

describe('attachmentService', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('generates a key namespaced under tickets/ with a UUID and a sanitized filename', () => {
    const key = generateAttachmentKey('My Screenshot (1).png');
    expect(key).toMatch(/^tickets\/[0-9a-f-]{36}-My_Screenshot__1_\.png$/);
  });

  it('generates a unique key on every call', () => {
    const a = generateAttachmentKey('a.png');
    const b = generateAttachmentKey('a.png');
    expect(a).not.toBe(b);
  });

  it('uploadAttachment sends a PutObjectCommand with the right bucket/key/contentType', async () => {
    mockSend.mockResolvedValueOnce({});
    await uploadAttachment('tickets/key-1', Buffer.from('hi'), 'image/png');
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'test-bucket', Key: 'tickets/key-1', ContentType: 'image/png' })
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('getAttachmentObject sends a GetObjectCommand and returns the stream/contentType', async () => {
    const fakeStream = {} as any;
    mockSend.mockResolvedValueOnce({ Body: fakeStream, ContentType: 'image/png' });
    const result = await getAttachmentObject('tickets/key-1');
    expect(GetObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'test-bucket', Key: 'tickets/key-1' })
    );
    expect(result.stream).toBe(fakeStream);
    expect(result.contentType).toBe('image/png');
  });
});
