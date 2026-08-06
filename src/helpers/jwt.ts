import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '../db/models/User';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  tokenVersion: number;
}

export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  expiresIn: string
): string {
  const options: SignOptions = { expiresIn: expiresIn as any };
  return jwt.sign(payload, secret, options);
}

export function verifyAccessToken(
  token: string,
  secret: string
): AccessTokenPayload & { iat: number; exp: number } {
  return jwt.verify(token, secret) as AccessTokenPayload & { iat: number; exp: number };
}
