import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERRORS } from '@passvault/shared';

// config is a plain object — mutate features.* between tests
vi.mock('../config.js', () => ({
  config: {
    environment: 'dev',
    features: {
      powEnabled: false,
      honeypotEnabled: true,
      totpRequired: false,
      wafEnabled: false,
      cloudFrontEnabled: false,
    },
    session: { adminTokenExpiryHours: 24, userTokenExpiryMinutes: 30 },
  },
  getJwtSecret: vi.fn().mockResolvedValue('test-secret'),
  DYNAMODB_TABLE: 'test-table',
  FILES_BUCKET: 'test-bucket',
}));

vi.mock('../utils/dynamodb.js', () => ({
  getUserByUsername: vi.fn(),
  updateUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/crypto.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('$2b$12$newhash'),
  verifyPassword: vi.fn(),
  generateOtp: vi.fn().mockReturnValue('ABCDEFGH12345678'),
  generateSalt: vi.fn().mockReturnValue('base64salt=='),
}));

vi.mock('../utils/jwt.js', () => ({
  signToken: vi.fn().mockResolvedValue('signed.jwt.token'),
}));

vi.mock('./totp.js', () => ({
  verifyCode: vi.fn(),
}));

import { login, changePassword } from './auth.js';
import { getUserByUsername, updateUser } from '../utils/dynamodb.js';
import { verifyPassword, hashPassword } from '../utils/crypto.js';
import { verifyCode } from './totp.js';
import { config } from '../config.js';
import type { User } from '@passvault/shared';

const mockGetUser = vi.mocked(getUserByUsername);
const mockVerifyPw = vi.mocked(verifyPassword);
const mockVerifyTotp = vi.mocked(verifyCode);
const mockUpdateUser = vi.mocked(updateUser);
const mockHashPw = vi.mocked(hashPassword);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: 'user-1',
    username: 'alice',
    passwordHash: '$2b$12$hash',
    oneTimePasswordHash: '$2b$12$otphash',
    role: 'user',
    status: 'pending_first_login',
    totpSecret: null,
    totpEnabled: false,
    encryptionSalt: 'base64salt==',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastLoginAt: null,
    createdBy: 'admin-1',
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  };
}

// ── login() ───────────────────────────────────────────────────────────────────

describe('login — user not found', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
  });

  it('returns 401 when user does not exist', async () => {
    mockGetUser.mockResolvedValue(null);
    const result = await login({ username: 'nobody', password: 'pass' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when account has admin role', async () => {
    mockGetUser.mockResolvedValue(makeUser({ role: 'admin' }));
    const result = await login({ username: 'admin', password: 'pass' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });
});

describe('login — pending_first_login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
    mockGetUser.mockResolvedValue(makeUser({ status: 'pending_first_login' }));
  });

  it('returns 401 for wrong OTP', async () => {
    mockVerifyPw.mockResolvedValue(false);
    const result = await login({ username: 'alice', password: 'wrong' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });

  it('returns token and requirePasswordChange on correct OTP', async () => {
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct-otp' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
    expect(result.response?.requirePasswordChange).toBe(true);
  });
});

describe('login — active user, totpRequired: false (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
    mockGetUser.mockResolvedValue(
      makeUser({ status: 'active', totpEnabled: true, totpSecret: 'TOTP_SECRET' }),
    );
  });

  it('returns 401 for wrong password', async () => {
    mockVerifyPw.mockResolvedValue(false);
    const result = await login({ username: 'alice', password: 'wrong' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
  });

  it('succeeds without TOTP even when user has it enabled (dev/beta)', async () => {
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
    // TOTP not required in this env so no requireTotpSetup flag
    expect(result.response?.requirePasswordChange).toBeUndefined();
  });
});

describe('login — active user, totpRequired: true (prod)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = true;
    mockGetUser.mockResolvedValue(
      makeUser({ status: 'active', totpEnabled: true, totpSecret: 'TOTP_SECRET' }),
    );
    mockVerifyPw.mockResolvedValue(true);
  });

  it('returns 401 when TOTP code is missing', async () => {
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.error).toBe(ERRORS.INVALID_TOTP);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for an invalid TOTP code', async () => {
    mockVerifyTotp.mockReturnValue(false);
    const result = await login({ username: 'alice', password: 'correct', totpCode: '000000' });
    expect(result.error).toBe(ERRORS.INVALID_TOTP);
  });

  it('succeeds with a valid TOTP code', async () => {
    mockVerifyTotp.mockReturnValue(true);
    const result = await login({ username: 'alice', password: 'correct', totpCode: '123456' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
  });
});

describe('login — pending_totp_setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = true;
    mockGetUser.mockResolvedValue(makeUser({ status: 'pending_totp_setup' }));
    mockVerifyPw.mockResolvedValue(true);
  });

  it('returns requireTotpSetup flag when totpRequired is true', async () => {
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.response?.requireTotpSetup).toBe(true);
  });

  it('does not return requireTotpSetup when totpRequired is false', async () => {
    config.features.totpRequired = false;
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.response?.requireTotpSetup).toBeUndefined();
  });
});

// ── login() — lockout + input validation ──────────────────────────────────────

describe('login — account lockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
  });

  it('returns 429 when lockedUntil is in the future', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockGetUser.mockResolvedValue(makeUser({ status: 'active', lockedUntil: future }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.statusCode).toBe(429);
    expect(result.error).toBe(ERRORS.ACCOUNT_LOCKED);
  });

  it('allows login when lockedUntil is in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    mockGetUser.mockResolvedValue(makeUser({ status: 'active', lockedUntil: past }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.response?.token).toBeDefined();
  });

  it('increments failedLoginAttempts on wrong password', async () => {
    mockGetUser.mockResolvedValue(makeUser({ status: 'active', failedLoginAttempts: 2 }));
    mockVerifyPw.mockResolvedValue(false);
    await login({ username: 'alice', password: 'wrong' });
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ failedLoginAttempts: 3 }));
  });

  it('sets lockedUntil after 5 failed attempts', async () => {
    mockGetUser.mockResolvedValue(makeUser({ status: 'active', failedLoginAttempts: 4 }));
    mockVerifyPw.mockResolvedValue(false);
    await login({ username: 'alice', password: 'wrong' });
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({
      failedLoginAttempts: 5,
      lockedUntil: expect.any(String),
    }));
  });

  it('resets counter on successful login', async () => {
    mockGetUser.mockResolvedValue(makeUser({ status: 'active', failedLoginAttempts: 3 }));
    mockVerifyPw.mockResolvedValue(true);
    await login({ username: 'alice', password: 'correct' });
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({
      failedLoginAttempts: 0,
      lockedUntil: null,
    }));
  });
});

describe('login — input validation (M3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 for oversized username without hitting DynamoDB', async () => {
    const result = await login({ username: 'a'.repeat(31), password: 'Password1!' });
    expect(result.statusCode).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns 401 for oversized password without hitting DynamoDB', async () => {
    const result = await login({ username: 'alice', password: 'x'.repeat(1025) });
    expect(result.statusCode).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns 401 for non-string username', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await login({ username: 123 as any, password: 'pass' });
    expect(result.statusCode).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

// ── changePassword() ──────────────────────────────────────────────────────────

describe('changePassword — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when the password is too weak', async () => {
    const result = await changePassword('user-1', 'alice', { newPassword: 'weak' });
    expect(result.error).toBe('Password does not meet requirements');
    expect(result.statusCode).toBe(400);
    expect(result.details?.length).toBeGreaterThan(0);
  });

  it('returns 400 when the password contains the username', async () => {
    const result = await changePassword('user-1', 'alice', {
      newPassword: 'AliceSuperPass123!',
    });
    expect(result.error).toBe('Password does not meet requirements');
  });
});

describe('changePassword — totpRequired: false (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
  });

  it('sets status to active', async () => {
    const result = await changePassword('user-1', 'alice', { newPassword: 'StrongPass123!' });
    expect(result.error).toBeUndefined();
    expect(result.response?.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ status: 'active' }),
    );
  });
});

describe('changePassword — totpRequired: true (prod)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = true;
  });

  it('sets status to pending_totp_setup', async () => {
    const result = await changePassword('user-1', 'alice', { newPassword: 'StrongPass123!' });
    expect(result.error).toBeUndefined();
    expect(mockUpdateUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ status: 'pending_totp_setup' }),
    );
  });
});
