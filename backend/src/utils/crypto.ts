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
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  // Guarantee at least one character from each category required by the password policy.
  const pick = (set: string) => set[randomBytes(1)[0] % set.length];
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];

  // Fill the remainder randomly from the full set.
  const remaining = randomBytes(LIMITS.OTP_LENGTH - 4);
  for (let i = 0; i < remaining.length; i++) {
    chars.push(all[remaining[i] % all.length]);
  }

  // Shuffle using Fisher-Yates so the guaranteed chars aren't always at the front.
  const shuffle = randomBytes(chars.length);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffle[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

export function generateSalt(): string {
  return randomBytes(SALT_LENGTH).toString('base64');
}

export function generateNonce(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}
