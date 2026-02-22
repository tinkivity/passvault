import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateOtp, generateSalt, generateNonce } from './crypto.js';
import { LIMITS, SALT_LENGTH } from '@passvault/shared';

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
