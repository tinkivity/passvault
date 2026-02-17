import jwt from 'jsonwebtoken';
import type { UserRole, UserStatus } from '@passvault/shared';
import { JWT_SECRET, config } from '../config.js';

export interface TokenPayload {
  userId: string;
  username: string;
  role: UserRole;
  status: UserStatus;
}

export function signToken(payload: TokenPayload): string {
  const expirySeconds =
    payload.role === 'admin'
      ? config.session.adminTokenExpiryHours * 3600
      : config.session.userTokenExpiryMinutes * 60;

  return jwt.sign(payload, JWT_SECRET, { expiresIn: expirySeconds });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
