import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'crypto';
import {
  hashPassword,
  verifyPassword,
  generateOtp,
  generateSalt,
  generateNonce,
  encryptDisplayNameWithKey,
  decryptDisplayNameWithKey,
  encryptDisplayName,
  decryptDisplayName,
  __resetDisplayNameKeyCache,
} from './crypto.js';
import { LIMITS, SALT_LENGTH } from '@passvault/shared';

vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  return {
    ...actual,
    getJwtSecret: vi.fn(async () => 'test-jwt-secret-32bytes-of-entropy-please'),
  };
});

// Real bcrypt calls — 12 rounds per hash, allow extra time
describe('hashPassword / verifyPassword', { timeout: 30_000 }, () => {
  it('returns a bcrypt hash string', async () => {
    const hash = await hashPassword('TestPassword1!');
    expect(hash).toMatch(/^\$2[ab]\$/);
    expect(hash.length).toBeGreaterThan(50);
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('CorrectHorse42!');
    await expect(verifyPassword('CorrectHorse42!', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('CorrectHorse42!');
    await expect(verifyPassword('WrongPassword1!', hash)).resolves.toBe(false);
  });

  it('produces a different hash each time (unique salts)', async () => {
    const [h1, h2] = await Promise.all([
      hashPassword('SamePassword1!'),
      hashPassword('SamePassword1!'),
    ]);
    expect(h1).not.toBe(h2);
  });
});

describe('generateOtp', () => {
  const ALLOWED = new Set(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'.split(''),
  );

  it('returns a string of the correct length', () => {
    expect(generateOtp()).toHaveLength(LIMITS.OTP_LENGTH);
  });

  it('only contains characters from the allowed set', () => {
    const otp = generateOtp();
    for (const ch of otp) {
      expect(ALLOWED.has(ch), `unexpected char: ${ch}`).toBe(true);
    }
  });

  it('produces unique values across calls', () => {
    const values = new Set(Array.from({ length: 20 }, () => generateOtp()));
    expect(values.size).toBe(20);
  });

  it('always contains at least one uppercase, lowercase, digit, and special character', () => {
    for (let i = 0; i < 50; i++) {
      const otp = generateOtp();
      expect(/[A-Z]/.test(otp), 'missing uppercase').toBe(true);
      expect(/[a-z]/.test(otp), 'missing lowercase').toBe(true);
      expect(/[0-9]/.test(otp), 'missing digit').toBe(true);
      expect(/[!@#$%^&*]/.test(otp), 'missing special character').toBe(true);
    }
  });
});

describe('generateSalt', () => {
  it('returns valid base64 encoding 32 bytes', () => {
    const salt = generateSalt();
    expect(Buffer.from(salt, 'base64').length).toBe(SALT_LENGTH);
  });

  it('produces unique values', () => {
    const salts = new Set(Array.from({ length: 10 }, () => generateSalt()));
    expect(salts.size).toBe(10);
  });
});

describe('generateNonce', () => {
  it('returns a lowercase hex string of double the requested byte length', () => {
    const nonce = generateNonce(16);
    expect(nonce).toMatch(/^[0-9a-f]+$/);
    expect(nonce).toHaveLength(32);
  });

  it('respects different byte sizes', () => {
    expect(generateNonce(8)).toHaveLength(16);
    expect(generateNonce(32)).toHaveLength(64);
  });

  it('produces unique values', () => {
    const nonces = new Set(Array.from({ length: 10 }, () => generateNonce(16)));
    expect(nonces.size).toBe(10);
  });
});

describe('encryptDisplayNameWithKey / decryptDisplayNameWithKey', () => {
  const key = randomBytes(32);

  it('round-trips ASCII plaintext', () => {
    const ciphertext = encryptDisplayNameWithKey('Personal Vault', key);
    expect(ciphertext.startsWith('v1:')).toBe(true);
    expect(decryptDisplayNameWithKey(ciphertext, key)).toBe('Personal Vault');
  });

  it('round-trips unicode plaintext', () => {
    const name = 'Personal 🔐 金庫';
    expect(decryptDisplayNameWithKey(encryptDisplayNameWithKey(name, key), key)).toBe(name);
  });

  it('round-trips empty string', () => {
    expect(decryptDisplayNameWithKey(encryptDisplayNameWithKey('', key), key)).toBe('');
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const a = encryptDisplayNameWithKey('Same Name', key);
    const b = encryptDisplayNameWithKey('Same Name', key);
    expect(a).not.toBe(b);
    expect(decryptDisplayNameWithKey(a, key)).toBe('Same Name');
    expect(decryptDisplayNameWithKey(b, key)).toBe('Same Name');
  });

  it('rejects tampered ciphertext (flipped bit in body)', () => {
    const ciphertext = encryptDisplayNameWithKey('Personal Vault', key);
    // Flip a bit inside the base64url body
    const body = ciphertext.slice(3);
    const buf = Buffer.from(body, 'base64url');
    buf[buf.length - 5] ^= 0x01;
    const tampered = 'v1:' + buf.toString('base64url');
    expect(() => decryptDisplayNameWithKey(tampered, key)).toThrow();
  });

  it('rejects payload without v1: prefix', () => {
    expect(() => decryptDisplayNameWithKey('plainvalue', key)).toThrow(/unrecognized ciphertext format/);
  });

  it('rejects payload that is too short', () => {
    expect(() => decryptDisplayNameWithKey('v1:' + Buffer.from('abc').toString('base64url'), key)).toThrow(/too short/);
  });

  it('rejects decrypt with a wrong key', () => {
    const ciphertext = encryptDisplayNameWithKey('Personal Vault', key);
    const otherKey = randomBytes(32);
    expect(() => decryptDisplayNameWithKey(ciphertext, otherKey)).toThrow();
  });
});

describe('encryptDisplayName / decryptDisplayName (high-level)', () => {
  beforeEach(() => {
    __resetDisplayNameKeyCache();
  });

  it('round-trips through the cached HKDF key', async () => {
    const ciphertext = await encryptDisplayName('Hello World');
    expect(ciphertext.startsWith('v1:')).toBe(true);
    await expect(decryptDisplayName(ciphertext)).resolves.toBe('Hello World');
  });

  it('derives the same key across calls (cache works)', async () => {
    const a = await encryptDisplayName('X');
    const b = await encryptDisplayName('X');
    // Different IV each time, but both must decrypt via the cached key.
    await expect(decryptDisplayName(a)).resolves.toBe('X');
    await expect(decryptDisplayName(b)).resolves.toBe('X');
  });
});
