import jwt from 'jsonwebtoken';
import type { UserRole, UserStatus } from '@passvault/shared';
import { getJwtSecret, config } from '../config.js';

export interface TokenPayload {
  userId: string;
  username: string;
  role: UserRole;
  status: UserStatus;
}

export async function signToken(payload: TokenPayload): Promise<string> {
  const secret = await getJwtSecret();
  const expirySeconds =
    payload.role === 'admin'
      ? config.session.adminTokenExpiryHours * 3600
      : config.session.userTokenExpiryMinutes * 60;
  return jwt.sign(payload, secret, { expiresIn: expirySeconds });
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const secret = await getJwtSecret();
  return jwt.verify(token, secret) as TokenPayload;
}
