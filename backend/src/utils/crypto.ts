import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { LIMITS, SALT_LENGTH } from '@passvault/shared';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateOtp(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = randomBytes(LIMITS.OTP_LENGTH);
  let otp = '';
  for (let i = 0; i < LIMITS.OTP_LENGTH; i++) {
    otp += chars[bytes[i] % chars.length];
  }
  return otp;
}

export function generateSalt(): string {
  return randomBytes(SALT_LENGTH).toString('base64');
}

export function generateNonce(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}
