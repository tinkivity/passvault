import { describe, it, expect } from 'vitest';
import { validatePassword } from './password.js';

describe('validatePassword', () => {
  it('accepts a fully compliant password', () => {
    const result = validatePassword('ValidPass123!');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a password shorter than 12 characters', () => {
    const result = validatePassword('Short1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('12 characters'))).toBe(true);
  });

  it('rejects a password with no uppercase letter', () => {
    const result = validatePassword('nouppercase123!');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('uppercase'))).toBe(true);
  });

  it('rejects a password with no lowercase letter', () => {
    const result = validatePassword('NOLOWERCASE123!');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
  });

  it('rejects a password with no number', () => {
    const result = validatePassword('NoNumbers!Here?');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('number'))).toBe(true);
  });

  it('rejects a password with no special character', () => {
    const result = validatePassword('NoSpecialChar123');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('special character'))).toBe(true);
  });

  it('rejects a password that contains the username (case-insensitive)', () => {
    const result = validatePassword('MyUserNamePass123!', 'myusername');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('username'))).toBe(true);
  });

  it('passes when username is not provided, even if password contains it', () => {
    const result = validatePassword('AdminPass123!');
    expect(result.valid).toBe(true);
  });

  it('accumulates multiple errors', () => {
    // Missing: uppercase, number, special char, too short
    const result = validatePassword('short');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('accepts passwords with various special characters', () => {
    for (const special of ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')']) {
      const result = validatePassword(`ValidPass123${special}`);
      expect(result.valid).toBe(true);
    }
  });
});
