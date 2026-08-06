import crypto from 'crypto';

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// SHA-256, not bcrypt: these tokens are already high-entropy random
// values (unlike user passwords), so a fast deterministic hash is enough
// to prevent DB-dump readback, and it lets us look tokens up by exact
// hash match instead of iterating with bcrypt.compare.
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
