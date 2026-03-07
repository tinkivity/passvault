import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERRORS } from '@passvault/shared';

// config is a plain object — mutate features.* between tests
vi.mock('../config.js', () => ({
  config: {
    environment: 'dev',
    features: {
      powEnabled: false,
      honeypotEnabled: true,
      passkeyRequired: false,
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
  getUserById: vi.fn(),
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

vi.mock('./passkey.js', () => ({
  verifyPasskeyToken: vi.fn(),
}));

import { login, changePassword } from './auth.js';
import { getUserByUsername, getUserById, updateUser } from '../utils/dynamodb.js';
import { verifyPassword, hashPassword } from '../utils/crypto.js';
import { verifyPasskeyToken } from './passkey.js';
import { config } from '../config.js';
import type { User } from '@passvault/shared';

const mockGetUserByUsername = vi.mocked(getUserByUsername);
const mockGetUserById = vi.mocked(getUserById);
const mockVerifyPw = vi.mocked(verifyPassword);
const mockVerifyPasskeyToken = vi.mocked(verifyPasskeyToken);
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
    passkeyCredentialId: null,
    passkeyPublicKey: null,
    passkeyCounter: 0,
    passkeyTransports: null,
    passkeyAaguid: null,
    encryptionSalt: 'base64salt==',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastLoginAt: null,
    createdBy: 'admin-1',
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  };
}

// ── login() — dev/beta (passkeyRequired: false) ───────────────────────────────

describe('login — user not found (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
  });

  it('returns 401 when user does not exist', async () => {
    mockGetUserByUsername.mockResolvedValue(null);
    const result = await login({ username: 'nobody', password: 'pass' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when account has admin role', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ role: 'admin' }));
    const result = await login({ username: 'admin', password: 'pass' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });
});

describe('login — pending_first_login (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'pending_first_login' }));
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

describe('login — active user (dev/beta, passkeyRequired: false)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'active' }));
  });

  it('returns 401 for wrong password', async () => {
    mockVerifyPw.mockResolvedValue(false);
    const result = await login({ username: 'alice', password: 'wrong' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
  });

  it('succeeds with correct password', async () => {
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
  });
});

// ── login() — prod (passkeyRequired: true) ────────────────────────────────────

describe('login — passkeyRequired: true (prod)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = true;
  });

  it('returns 401 when passkeyToken is missing', async () => {
    const result = await login({ password: 'correct' });
    expect(result.error).toBe(ERRORS.INVALID_PASSKEY);
    expect(result.statusCode).toBe(401);
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('returns 401 when passkeyToken is invalid', async () => {
    mockVerifyPasskeyToken.mockRejectedValue(new Error('jwt expired'));
    const result = await login({ passkeyToken: 'bad.token', password: 'correct' });
    expect(result.error).toBe(ERRORS.INVALID_PASSKEY);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when user not found by userId from token', async () => {
    mockVerifyPasskeyToken.mockResolvedValue('user-1');
    mockGetUserById.mockResolvedValue(null);
    const result = await login({ passkeyToken: 'valid.token', password: 'correct' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for wrong password after valid passkey', async () => {
    mockVerifyPasskeyToken.mockResolvedValue('user-1');
    mockGetUserById.mockResolvedValue(makeUser({ status: 'active' }));
    mockVerifyPw.mockResolvedValue(false);
    const result = await login({ passkeyToken: 'valid.token', password: 'wrong' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ failedLoginAttempts: 1 }));
  });

  it('succeeds with valid passkey token and correct password', async () => {
    mockVerifyPasskeyToken.mockResolvedValue('user-1');
    mockGetUserById.mockResolvedValue(makeUser({ status: 'active' }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ passkeyToken: 'valid.token', password: 'correct' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
    expect(result.response?.username).toBe('alice');
  });
});

describe('login — pending_passkey_setup (prod)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = true;
    mockVerifyPasskeyToken.mockResolvedValue('user-1');
    mockGetUserById.mockResolvedValue(makeUser({ status: 'pending_passkey_setup' }));
    mockVerifyPw.mockResolvedValue(true);
  });

  it('returns requirePasskeySetup flag when passkeyRequired is true', async () => {
    const result = await login({ passkeyToken: 'valid.token', password: 'correct' });
    expect(result.response?.requirePasskeySetup).toBe(true);
  });
});

// ── login() — lockout + input validation ──────────────────────────────────────

describe('login — account lockout (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
  });

  it('returns 429 when lockedUntil is in the future', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'active', lockedUntil: future }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.statusCode).toBe(429);
    expect(result.error).toBe(ERRORS.ACCOUNT_LOCKED);
  });

  it('allows login when lockedUntil is in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'active', lockedUntil: past }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.response?.token).toBeDefined();
  });

  it('increments failedLoginAttempts on wrong password', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'active', failedLoginAttempts: 2 }));
    mockVerifyPw.mockResolvedValue(false);
    await login({ username: 'alice', password: 'wrong' });
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ failedLoginAttempts: 3 }));
  });

  it('sets lockedUntil after 5 failed attempts', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'active', failedLoginAttempts: 4 }));
    mockVerifyPw.mockResolvedValue(false);
    await login({ username: 'alice', password: 'wrong' });
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({
      failedLoginAttempts: 5,
      lockedUntil: expect.any(String),
    }));
  });

  it('resets counter on successful login', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'active', failedLoginAttempts: 3 }));
    mockVerifyPw.mockResolvedValue(true);
    await login({ username: 'alice', password: 'correct' });
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({
      failedLoginAttempts: 0,
      lockedUntil: null,
    }));
  });
});

describe('login — input validation (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
  });

  it('returns 401 for oversized username without hitting DynamoDB', async () => {
    const result = await login({ username: 'a'.repeat(31), password: 'Password1!' });
    expect(result.statusCode).toBe(401);
    expect(mockGetUserByUsername).not.toHaveBeenCalled();
  });

  it('returns 401 for oversized password without hitting DynamoDB', async () => {
    const result = await login({ username: 'alice', password: 'x'.repeat(1025) });
    expect(result.statusCode).toBe(401);
    expect(mockGetUserByUsername).not.toHaveBeenCalled();
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

describe('changePassword — passkeyRequired: false (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
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

describe('changePassword — passkeyRequired: true (prod)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = true;
  });

  it('sets status to pending_passkey_setup', async () => {
    const result = await changePassword('user-1', 'alice', { newPassword: 'StrongPass123!' });
    expect(result.error).toBeUndefined();
    expect(mockUpdateUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ status: 'pending_passkey_setup' }),
    );
  });
});
