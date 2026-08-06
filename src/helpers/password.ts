import bcrypt from 'bcrypt';

export async function hashPassword(plain: string, costFactor: number): Promise<string> {
  return bcrypt.hash(plain, costFactor);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
