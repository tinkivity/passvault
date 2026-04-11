import bcrypt from 'bcryptjs';
import { randomBytes, hkdfSync, createCipheriv, createDecipheriv } from 'crypto';
import { LIMITS, SALT_LENGTH } from '@passvault/shared';
import { getJwtSecret } from '../config.js';

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

// ---------------------------------------------------------------------------
// Vault displayName encryption (AES-256-GCM, key derived from JWT secret)
// ---------------------------------------------------------------------------

const DISPLAY_NAME_KDF_INFO = 'passvault-vault-displayname-v1';
const DISPLAY_NAME_FORMAT_PREFIX = 'v1:';
const AES_KEY_LENGTH = 32;
const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

let displayNameKeyCache: Buffer | undefined;

async function getDisplayNameKey(): Promise<Buffer> {
  if (displayNameKeyCache) return displayNameKeyCache;
  const jwtSecret = await getJwtSecret();
  // HKDF info label provides domain separation from the JWT HMAC use of the same secret.
  const derived = hkdfSync('sha256', jwtSecret, Buffer.alloc(0), DISPLAY_NAME_KDF_INFO, AES_KEY_LENGTH);
  displayNameKeyCache = Buffer.from(derived);
  return displayNameKeyCache;
}

export function encryptDisplayNameWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, ciphertext, authTag]);
  return DISPLAY_NAME_FORMAT_PREFIX + blob.toString('base64url');
}

export function decryptDisplayNameWithKey(payload: string, key: Buffer): string {
  if (!payload.startsWith(DISPLAY_NAME_FORMAT_PREFIX)) {
    throw new Error('decryptDisplayName: unrecognized ciphertext format (missing v1: prefix)');
  }
  const blob = Buffer.from(payload.slice(DISPLAY_NAME_FORMAT_PREFIX.length), 'base64url');
  if (blob.length < GCM_IV_LENGTH + GCM_TAG_LENGTH) {
    throw new Error('decryptDisplayName: ciphertext too short');
  }
  const iv = blob.subarray(0, GCM_IV_LENGTH);
  const authTag = blob.subarray(blob.length - GCM_TAG_LENGTH);
  const ciphertext = blob.subarray(GCM_IV_LENGTH, blob.length - GCM_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export async function encryptDisplayName(plaintext: string): Promise<string> {
  const key = await getDisplayNameKey();
  return encryptDisplayNameWithKey(plaintext, key);
}

export async function decryptDisplayName(payload: string): Promise<string> {
  const key = await getDisplayNameKey();
  return decryptDisplayNameWithKey(payload, key);
}

// Exposed for the rotation script so it can reset the cache after swapping the underlying JWT secret.
export function __resetDisplayNameKeyCache(): void {
  displayNameKeyCache = undefined;
}
