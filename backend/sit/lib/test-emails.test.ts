import { describe, it, expect, afterEach } from 'vitest';
import { testUserEmail } from './test-emails.js';

const ORIG_PLUS = process.env.PASSVAULT_PLUS_ADDRESS;
const ORIG_SIT_ENV = process.env.SIT_ENV;
const ORIG_ENV = process.env.ENVIRONMENT;

afterEach(() => {
  if (ORIG_PLUS === undefined) delete process.env.PASSVAULT_PLUS_ADDRESS;
  else process.env.PASSVAULT_PLUS_ADDRESS = ORIG_PLUS;
  if (ORIG_SIT_ENV === undefined) delete process.env.SIT_ENV;
  else process.env.SIT_ENV = ORIG_SIT_ENV;
  if (ORIG_ENV === undefined) delete process.env.ENVIRONMENT;
  else process.env.ENVIRONMENT = ORIG_ENV;
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

  it('throws on beta when PASSVAULT_PLUS_ADDRESS is unset', () => {
    delete process.env.PASSVAULT_PLUS_ADDRESS;
    process.env.SIT_ENV = 'beta';
    expect(() => testUserEmail('sit-pro-123')).toThrow('PASSVAULT_PLUS_ADDRESS is required on beta');
  });

  it('throws on prod when PASSVAULT_PLUS_ADDRESS is unset', () => {
    delete process.env.PASSVAULT_PLUS_ADDRESS;
    process.env.ENVIRONMENT = 'prod';
    expect(() => testUserEmail('sit-pro-123')).toThrow('PASSVAULT_PLUS_ADDRESS is required on prod');
  });
});
