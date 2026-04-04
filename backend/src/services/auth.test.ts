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
    session: { adminTokenExpiryHours: 24, userTokenExpiryMinutes: 30, otpExpiryMinutes: 60 },
  },
  getJwtSecret: vi.fn().mockResolvedValue('test-secret'),
  DYNAMODB_TABLE: 'test-table',
  FILES_BUCKET: 'test-bucket',
}));

vi.mock('../utils/dynamodb.js', () => ({
  getUserByUsername: vi.fn(),
  getUserById: vi.fn(),
  updateUser: vi.fn().mockResolvedValue(undefined),
  recordLoginEvent: vi.fn().mockResolvedValue(undefined),
  listPasskeyCredentials: vi.fn().mockResolvedValue([]),
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

vi.mock('../utils/ses.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import { login, changePassword } from './auth.js';
import { getUserByUsername, getUserById, updateUser, listPasskeyCredentials } from '../utils/dynamodb.js';
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
const mockListPasskeyCredentials = vi.mocked(listPasskeyCredentials);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: 'user-1',
    username: 'alice',
    passwordHash: '$2b$12$hash',
    oneTimePasswordHash: '$2b$12$otphash',
    role: 'user',
    status: 'pending_first_login',
    encryptionSalt: 'base64salt==',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastLoginAt: null,
    createdBy: 'admin-1',
    failedLoginAttempts: 0,
    lockedUntil: null,
    plan: 'free' as const,
    otpExpiresAt: null,
    ...overrides,
  };
}

// ── login() — dev/beta (passkeyRequired: false) ───────────────────────────────

describe('login — user not found (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
    mockListPasskeyCredentials.mockResolvedValue([]);
  });

  it('returns 401 when user does not exist', async () => {
    mockGetUserByUsername.mockResolvedValue(null);
    const result = await login({ username: 'nobody', password: 'pass' });
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

// ── login() — per-user passkey ────────────────────────────────────────────────

describe('login — user with passkey registered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when passkeyToken is invalid', async () => {
    mockVerifyPasskeyToken.mockRejectedValue(new Error('jwt expired'));
    const result = await login({ passkeyToken: 'bad.token' });
    expect(result.error).toBe(ERRORS.INVALID_PASSKEY);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when user not found by userId from token', async () => {
    mockVerifyPasskeyToken.mockResolvedValue({ userId: 'user-1', credentialId: 'cred-1', passkeyName: 'My Key' });
    mockGetUserById.mockResolvedValue(null);
    const result = await login({ passkeyToken: 'valid.token' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });

  it('succeeds with valid passkey token — no password required', async () => {
    mockVerifyPasskeyToken.mockResolvedValue({ userId: 'user-1', credentialId: 'cred-1', passkeyName: 'My Key' });
    mockGetUserById.mockResolvedValue(makeUser({ status: 'active' }));
    const result = await login({ passkeyToken: 'valid.token' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
    expect(result.response?.username).toBe('alice');
    expect(mockVerifyPw).not.toHaveBeenCalled();
  });

  it('rejects password login when user has passkeys registered', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'active' }));
    mockListPasskeyCredentials.mockResolvedValueOnce([{ credentialId: 'cred-1', userId: 'user-1', name: 'My Key', publicKey: 'pubkey', counter: 0, transports: null, aaguid: 'aaguid', createdAt: '2024-01-01T00:00:00Z' }]);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.error).toBe(ERRORS.INVALID_PASSKEY);
    expect(result.statusCode).toBe(401);
  });
});

// ── login() — lockout + input validation ──────────────────────────────────────

describe('login — account lockout (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
    mockListPasskeyCredentials.mockResolvedValue([]);
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
    mockListPasskeyCredentials.mockResolvedValue([]);
  });

  it('returns 401 for oversized username without hitting DynamoDB', async () => {
    const result = await login({ username: 'a'.repeat(255), password: 'Password1!' });
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
    mockListPasskeyCredentials.mockResolvedValue([]);
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


describe('changePassword — rejects OTP as new password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
    mockListPasskeyCredentials.mockResolvedValue([]);
  });

  it('returns 400 when new password matches the OTP', async () => {
    mockGetUserById.mockResolvedValue(
      makeUser({ status: 'pending_first_login', oneTimePasswordHash: '$2b$12$otphash' }),
    );
    mockVerifyPw.mockResolvedValue(true);
    const result = await changePassword('user-1', 'alice', { newPassword: 'StrongPass123!' });
    expect(result.error).toBe(ERRORS.PASSWORD_SAME_AS_OTP);
    expect(result.statusCode).toBe(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('succeeds when new password differs from the OTP', async () => {
    mockGetUserById.mockResolvedValue(
      makeUser({ status: 'pending_first_login', oneTimePasswordHash: '$2b$12$otphash' }),
    );
    mockVerifyPw.mockResolvedValue(false);
    const result = await changePassword('user-1', 'alice', { newPassword: 'StrongPass123!' });
    expect(result.error).toBeUndefined();
    expect(result.response?.success).toBe(true);
  });

  it('skips OTP check for active users', async () => {
    mockGetUserById.mockResolvedValue(makeUser({ status: 'active', oneTimePasswordHash: null }));
    const result = await changePassword('user-1', 'alice', { newPassword: 'StrongPass123!' });
    expect(result.error).toBeUndefined();
    expect(mockVerifyPw).not.toHaveBeenCalled();
  });
});

// ── login() — OTP expiry ───────────────────────────────────────────────────────

describe('login — OTP expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
    mockListPasskeyCredentials.mockResolvedValue([]);
  });

  it('returns 401 OTP_EXPIRED when otpExpiresAt is in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    mockGetUserByUsername.mockResolvedValue(
      makeUser({ status: 'pending_first_login', otpExpiresAt: past }),
    );
    const result = await login({ username: 'alice', password: 'otp' });
    expect(result.error).toBe(ERRORS.OTP_EXPIRED);
    expect(result.statusCode).toBe(401);
  });

  it('allows login when otpExpiresAt is in the future', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    mockGetUserByUsername.mockResolvedValue(
      makeUser({ status: 'pending_first_login', otpExpiresAt: future }),
    );
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'otp' });
    expect(result.error).toBeUndefined();
  });
});

// ── login() — user status checks ─────────────────────────────────────────────

describe('login — user status checks (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
    mockListPasskeyCredentials.mockResolvedValue([]);
  });

  it('returns 403 ACCOUNT_SUSPENDED when admin has set status to locked', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'locked' }));
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.error).toBe(ERRORS.ACCOUNT_SUSPENDED);
    expect(result.statusCode).toBe(403);
  });

  it('returns 401 INVALID_CREDENTIALS for retired users (indistinguishable from wrong password)', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'retired' }));
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });

  it('allows login for expired users (read-only; write blocked at vault layer)', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'expired' }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
  });

  it('returns accountExpired flag and expiresAt for expired users', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'expired', expiresAt: '2025-01-01' }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.response?.accountExpired).toBe(true);
    expect(result.response?.expiresAt).toBe('2025-01-01');
  });

  it('does not set accountExpired for active users', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'active', expiresAt: '2030-12-31' }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.response?.accountExpired).toBeUndefined();
    expect(result.response?.expiresAt).toBe('2030-12-31');
  });

  it('returns null expiresAt for perpetual users', async () => {
    mockGetUserByUsername.mockResolvedValue(makeUser({ status: 'active' }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.response?.expiresAt).toBeNull();
  });

  it('auto-locks admin and returns ACCOUNT_EXPIRED when expiresAt is in the past', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    mockGetUserByUsername.mockResolvedValue(makeUser({ role: 'admin', status: 'active', expiresAt: past }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'admin', password: 'correct' });
    expect(result.statusCode).toBe(403);
    expect(result.error).toBe(ERRORS.ACCOUNT_EXPIRED);
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { status: 'locked' });
  });

  it('does not auto-lock regular users with past expiresAt', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    mockGetUserByUsername.mockResolvedValue(makeUser({ role: 'user', status: 'active', expiresAt: past }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await login({ username: 'alice', password: 'correct' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBeDefined();
  });
});

