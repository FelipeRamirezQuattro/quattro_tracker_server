import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.AWS_S3_BUCKET || '';

function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// crypto.randomUUID() replaces the legacy app's Math.floor(Math.random()*Date.now())
// key generator — this is the weak-key fix for this rewrite.
export function generateAttachmentKey(originalFilename: string): string {
  return `tickets/${randomUUID()}-${sanitize(originalFilename)}`;
}

export async function uploadAttachment(key: string, buffer: Buffer, contentType?: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

export async function getAttachmentObject(key: string): Promise<{ stream: Readable; contentType?: string }> {
  const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return { stream: result.Body as Readable, contentType: result.ContentType };
}
