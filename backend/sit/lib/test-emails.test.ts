import { describe, it, expect, afterEach } from 'vitest';
import { testUserEmail } from './test-emails.js';

const ORIG = process.env.PASSVAULT_PLUS_ADDRESS;

afterEach(() => {
  if (ORIG === undefined) delete process.env.PASSVAULT_PLUS_ADDRESS;
  else process.env.PASSVAULT_PLUS_ADDRESS = ORIG;
});

describe('testUserEmail', () => {
  it('falls back to @passvault-test.local when env var is unset', () => {
    delete process.env.PASSVAULT_PLUS_ADDRESS;
    expect(testUserEmail('sit-pro-123')).toBe('sit-pro-123@passvault-test.local');
  });

  it('plus-addresses into the verified domain when env var is a valid email', () => {
    process.env.PASSVAULT_PLUS_ADDRESS = 'ops@example.com';
    expect(testUserEmail('sit-pro-123')).toBe('ops+sit-pro-123@example.com');
  });

  it('falls back when env var is malformed', () => {
    process.env.PASSVAULT_PLUS_ADDRESS = 'not-an-email';
    expect(testUserEmail('sit-pro-123')).toBe('sit-pro-123@passvault-test.local');
  });

  it('falls back when env var is empty', () => {
    process.env.PASSVAULT_PLUS_ADDRESS = '';
    expect(testUserEmail('sit-pro-123')).toBe('sit-pro-123@passvault-test.local');
  });
});
