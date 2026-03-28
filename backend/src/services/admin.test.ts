import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERRORS } from '@passvault/shared';

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
  createUser: vi.fn().mockResolvedValue(undefined),
  updateUser: vi.fn().mockResolvedValue(undefined),
  listAllUsers: vi.fn(),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  recordLoginEvent: vi.fn().mockResolvedValue(undefined),
  getLoginCountSince: vi.fn().mockResolvedValue(0),
  listVaultsByUser: vi.fn().mockResolvedValue([]),
  getVaultRecord: vi.fn().mockResolvedValue(null),
  deleteVaultRecord: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../utils/s3.js', () => ({
  putVaultFile: vi.fn().mockResolvedValue('2024-01-01T00:00:00.000Z'),
  getVaultFile: vi.fn(),
  getVaultFileSize: vi.fn().mockResolvedValue(1024),
  deleteVaultFile: vi.fn().mockResolvedValue(undefined),
  deleteLegacyVaultFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./vault.js', () => ({
  createFirstVault: vi.fn().mockResolvedValue('vault-1'),
  deleteVault: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/ses.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./passkey.js', () => ({
  verifyPasskeyToken: vi.fn(),
}));

import { adminLogin, adminChangePassword, createUserInvitation, listUsers, refreshOtp, deleteNewUser, getStats, lockUser, unlockUser, expireUser, retireUser, verifyEmailToken } from './admin.js';
import { getUserByUsername, getUserById, updateUser, createUser, listAllUsers, deleteUser, getLoginCountSince, listVaultsByUser } from '../utils/dynamodb.js';
import { verifyPassword } from '../utils/crypto.js';
import { verifyPasskeyToken } from './passkey.js';
import { config } from '../config.js';
import type { User } from '@passvault/shared';

const mockGetUserByUsername = vi.mocked(getUserByUsername);
const mockGetUserById = vi.mocked(getUserById);
const mockVerifyPw = vi.mocked(verifyPassword);
const mockVerifyPasskeyToken = vi.mocked(verifyPasskeyToken);
const mockUpdateUser = vi.mocked(updateUser);
const mockListAllUsers = vi.mocked(listAllUsers);
const mockGetLoginCountSince = vi.mocked(getLoginCountSince);

function makeAdmin(overrides: Partial<User> = {}): User {
  return {
    userId: 'admin-1',
    username: 'admin',
    passwordHash: '$2b$12$hash',
    oneTimePasswordHash: '$2b$12$otphash',
    role: 'admin',
    status: 'pending_first_login',
    passkeyCredentialId: null,
    passkeyPublicKey: null,
    passkeyCounter: 0,
    passkeyTransports: null,
    passkeyAaguid: null,
    encryptionSalt: 'base64salt==',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastLoginAt: null,
    createdBy: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    plan: 'free' as const,
    otpExpiresAt: null,
    ...overrides,
  };
}

// ── adminLogin() ──────────────────────────────────────────────────────────────

describe('adminLogin — user lookup failures (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
  });

  it('returns 401 when username is not found', async () => {
    mockGetUserByUsername.mockResolvedValue(null);
    const result = await adminLogin({ username: 'nobody', password: 'pass' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when account is not admin role', async () => {
    mockGetUserByUsername.mockResolvedValue(makeAdmin({ role: 'user' }));
    const result = await adminLogin({ username: 'admin', password: 'pass' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
  });
});

describe('adminLogin — pending_first_login (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
    mockGetUserByUsername.mockResolvedValue(makeAdmin({ status: 'pending_first_login' }));
  });

  it('returns 401 for wrong OTP', async () => {
    mockVerifyPw.mockResolvedValue(false);
    const result = await adminLogin({ username: 'admin', password: 'wrong' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
  });

  it('returns token and requirePasswordChange on correct OTP', async () => {
    mockVerifyPw.mockResolvedValue(true);
    const result = await adminLogin({ username: 'admin', password: 'correct-otp' });
    expect(result.response?.token).toBe('signed.jwt.token');
    expect(result.response?.requirePasswordChange).toBe(true);
  });
});

describe('adminLogin — active (dev/beta, passkeyRequired: false)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
    mockGetUserByUsername.mockResolvedValue(makeAdmin({ status: 'active' }));
  });

  it('returns 401 for wrong password', async () => {
    mockVerifyPw.mockResolvedValue(false);
    const result = await adminLogin({ username: 'admin', password: 'wrong' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
  });

  it('succeeds with correct password', async () => {
    mockVerifyPw.mockResolvedValue(true);
    const result = await adminLogin({ username: 'admin', password: 'correct' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
  });
});

describe('adminLogin — passkeyRequired: true (prod)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = true;
  });

  it('returns 401 when passkeyToken is missing', async () => {
    const result = await adminLogin({ password: 'correct' });
    expect(result.error).toBe(ERRORS.INVALID_PASSKEY);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when passkeyToken is invalid', async () => {
    mockVerifyPasskeyToken.mockRejectedValue(new Error('jwt expired'));
    const result = await adminLogin({ passkeyToken: 'bad.token', password: 'correct' });
    expect(result.error).toBe(ERRORS.INVALID_PASSKEY);
  });

  it('returns 401 when user is not admin role', async () => {
    mockVerifyPasskeyToken.mockResolvedValue('admin-1');
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user' }));
    const result = await adminLogin({ passkeyToken: 'valid.token', password: 'correct' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
  });

  it('succeeds with valid passkey token and correct password', async () => {
    mockVerifyPasskeyToken.mockResolvedValue('admin-1');
    mockGetUserById.mockResolvedValue(makeAdmin({ status: 'active' }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await adminLogin({ passkeyToken: 'valid.token', password: 'correct' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
  });
});

// ── adminLogin() — lockout ────────────────────────────────────────────────────

describe('adminLogin — account lockout (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
  });

  it('returns 429 when lockedUntil is in the future', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockGetUserByUsername.mockResolvedValue(makeAdmin({ status: 'active', lockedUntil: future }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await adminLogin({ username: 'admin', password: 'correct' });
    expect(result.statusCode).toBe(429);
    expect(result.error).toBe(ERRORS.ACCOUNT_LOCKED);
  });

  it('increments failedLoginAttempts on wrong password', async () => {
    mockGetUserByUsername.mockResolvedValue(makeAdmin({ status: 'active', failedLoginAttempts: 1 }));
    mockVerifyPw.mockResolvedValue(false);
    await adminLogin({ username: 'admin', password: 'wrong' });
    expect(mockUpdateUser).toHaveBeenCalledWith('admin-1', expect.objectContaining({ failedLoginAttempts: 2 }));
  });

  it('sets lockedUntil after 5 failed attempts', async () => {
    mockGetUserByUsername.mockResolvedValue(makeAdmin({ status: 'active', failedLoginAttempts: 4 }));
    mockVerifyPw.mockResolvedValue(false);
    await adminLogin({ username: 'admin', password: 'wrong' });
    expect(mockUpdateUser).toHaveBeenCalledWith('admin-1', expect.objectContaining({
      failedLoginAttempts: 5,
      lockedUntil: expect.any(String),
    }));
  });

  it('resets counter on successful login', async () => {
    mockGetUserByUsername.mockResolvedValue(makeAdmin({ status: 'active', failedLoginAttempts: 2 }));
    mockVerifyPw.mockResolvedValue(true);
    await adminLogin({ username: 'admin', password: 'correct' });
    expect(mockUpdateUser).toHaveBeenCalledWith('admin-1', expect.objectContaining({
      failedLoginAttempts: 0,
      lockedUntil: null,
    }));
  });
});

describe('adminLogin — input validation (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
  });

  it('returns 401 for oversized username without hitting DynamoDB', async () => {
    const result = await adminLogin({ username: 'a'.repeat(255), password: 'pass' });
    expect(result.statusCode).toBe(401);
    expect(mockGetUserByUsername).not.toHaveBeenCalled();
  });

  it('returns 401 for oversized password without hitting DynamoDB', async () => {
    const result = await adminLogin({ username: 'admin', password: 'x'.repeat(1025) });
    expect(result.statusCode).toBe(401);
    expect(mockGetUserByUsername).not.toHaveBeenCalled();
  });
});

// ── adminChangePassword() ─────────────────────────────────────────────────────

describe('adminChangePassword — validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 for a weak password', async () => {
    const result = await adminChangePassword('admin-1', 'admin', { newPassword: 'weak' });
    expect(result.statusCode).toBe(400);
    expect(result.details?.length).toBeGreaterThan(0);
  });
});

describe('adminChangePassword — passkeyRequired: false (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
  });

  it('sets next status to active', async () => {
    await adminChangePassword('admin-1', 'admin', { newPassword: 'StrongPass123!' });
    expect(mockUpdateUser).toHaveBeenCalledWith(
      'admin-1',
      expect.objectContaining({ status: 'active' }),
    );
  });
});

describe('adminChangePassword — passkeyRequired: true (prod)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = true;
  });

  it('sets next status to pending_passkey_setup', async () => {
    await adminChangePassword('admin-1', 'admin', { newPassword: 'StrongPass123!' });
    expect(mockUpdateUser).toHaveBeenCalledWith(
      'admin-1',
      expect.objectContaining({ status: 'pending_passkey_setup' }),
    );
  });
});

describe('adminChangePassword — rejects OTP as new password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
  });

  it('returns 400 when new password matches the OTP', async () => {
    mockGetUserById.mockResolvedValue(
      makeAdmin({ status: 'pending_first_login', oneTimePasswordHash: '$2b$12$otphash' }),
    );
    mockVerifyPw.mockResolvedValue(true);
    const result = await adminChangePassword('admin-1', 'admin', { newPassword: 'StrongPass123!' });
    expect(result.error).toBe(ERRORS.PASSWORD_SAME_AS_OTP);
    expect(result.statusCode).toBe(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('succeeds when new password differs from the OTP', async () => {
    mockGetUserById.mockResolvedValue(
      makeAdmin({ status: 'pending_first_login', oneTimePasswordHash: '$2b$12$otphash' }),
    );
    mockVerifyPw.mockResolvedValue(false);
    const result = await adminChangePassword('admin-1', 'admin', { newPassword: 'StrongPass123!' });
    expect(result.error).toBeUndefined();
    expect(result.response?.success).toBe(true);
  });

  it('skips OTP check for active users', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ status: 'active', oneTimePasswordHash: null }));
    const result = await adminChangePassword('admin-1', 'admin', { newPassword: 'StrongPass123!' });
    expect(result.error).toBeUndefined();
    expect(mockVerifyPw).not.toHaveBeenCalled();
  });
});

// ── createUserInvitation() ────────────────────────────────────────────────────

describe('createUserInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserByUsername.mockResolvedValue(null); // username not taken by default
  });

  it('returns 400 for a username that is too short', async () => {
    const result = await createUserInvitation({ username: 'ab' }, 'admin-1');
    expect(result.statusCode).toBe(400);
    expect(result.error).toBe(ERRORS.INVALID_USERNAME);
  });

  it('returns 400 for a username that is too long', async () => {
    const result = await createUserInvitation({ username: 'a'.repeat(255) }, 'admin-1');
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for a username with invalid characters', async () => {
    const result = await createUserInvitation({ username: 'bad user!' }, 'admin-1');
    expect(result.statusCode).toBe(400);
  });

  it('returns 409 when username already exists', async () => {
    mockGetUserByUsername.mockResolvedValue(makeAdmin({ username: 'bob@example.com', role: 'user' }));
    const result = await createUserInvitation({ username: 'bob@example.com' }, 'admin-1');
    expect(result.statusCode).toBe(409);
    expect(result.error).toBe(ERRORS.USER_EXISTS);
  });

  it('creates a user and returns the OTP', async () => {
    const result = await createUserInvitation({ username: 'bob@example.com' }, 'admin-1');
    expect(result.error).toBeUndefined();
    expect(result.response?.username).toBe('bob@example.com');
    expect(result.response?.oneTimePassword).toBe('ABCDEFGH12345678');
    expect(vi.mocked(createUser)).toHaveBeenCalled();
  });

  it('returns 400 for invalid email format (username must be valid email)', async () => {
    const result = await createUserInvitation({ username: 'not-an-email' }, 'admin-1');
    expect(result.statusCode).toBe(400);
  });
});

// ── listUsers() ───────────────────────────────────────────────────────────────

describe('listUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only regular users, not admins', async () => {
    mockListAllUsers.mockResolvedValue([
      makeAdmin({ userId: 'admin-1', role: 'admin' }),
      makeAdmin({ userId: 'user-1', username: 'alice', role: 'user' }),
    ]);
    const result = await listUsers();
    expect(result.users).toHaveLength(1);
    expect(result.users[0].username).toBe('alice');
  });

  it('includes vault size for each user', async () => {
    mockListAllUsers.mockResolvedValue([
      makeAdmin({ userId: 'user-1', username: 'alice', role: 'user' }),
    ]);
    vi.mocked(listVaultsByUser).mockResolvedValue([
      { vaultId: 'vault-1', userId: 'user-1', displayName: 'Personal Vault', createdAt: '2024-01-01T00:00:00.000Z' },
    ]);
    const result = await listUsers();
    expect(result.users[0].vaultSizeBytes).toBe(1024);
  });

  it('includes username for each user', async () => {
    mockListAllUsers.mockResolvedValue([
      makeAdmin({ userId: 'user-1', username: 'alice@example.com', role: 'user' }),
    ]);
    const result = await listUsers();
    expect(result.users[0].username).toBe('alice@example.com');
  });
});

// ── refreshOtp() ──────────────────────────────────────────────────────────────

describe('refreshOtp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue(null);
    const result = await refreshOtp('user-1');
    expect(result.statusCode).toBe(404);
  });

  it('returns 403 when user is not pending_first_login', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'active' }));
    const result = await refreshOtp('user-1');
    expect(result.statusCode).toBe(403);
  });

  it('returns new OTP for pending user', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'pending_first_login' }));
    const result = await refreshOtp('user-1');
    expect(result.response?.oneTimePassword).toBe('ABCDEFGH12345678');
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({
      failedLoginAttempts: 0,
      lockedUntil: null,
    }));
  });
});

// ── deleteNewUser() ───────────────────────────────────────────────────────────

describe('deleteNewUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue(null);
    const result = await deleteNewUser('user-1');
    expect(result.statusCode).toBe(404);
  });

  it('returns 403 when user is not pending_first_login', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'active' }));
    const result = await deleteNewUser('user-1');
    expect(result.statusCode).toBe(403);
  });

  it('deletes vault file and user record', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'pending_first_login', userId: 'user-1' }));
    const result = await deleteNewUser('user-1');
    expect(result.response?.success).toBe(true);
    expect(vi.mocked(deleteUser)).toHaveBeenCalledWith('user-1');
  });
});

// ── getStats() ────────────────────────────────────────────────────────────────

import { getVaultFileSize } from '../utils/s3.js';

const mockGetVaultFileSize = vi.mocked(getVaultFileSize);

describe('getStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns totalUsers count excluding admins', async () => {
    mockListAllUsers.mockResolvedValue([
      makeAdmin({ userId: 'admin-1', role: 'admin' }),
      makeAdmin({ userId: 'user-1', username: 'alice', role: 'user' }),
      makeAdmin({ userId: 'user-2', username: 'bob', role: 'user' }),
    ]);
    mockGetVaultFileSize.mockResolvedValue(0);
    mockGetLoginCountSince.mockResolvedValue(0);
    const result = await getStats();
    expect(result.totalUsers).toBe(2);
  });

  it('returns summed vault sizes for regular users', async () => {
    mockListAllUsers.mockResolvedValue([
      makeAdmin({ userId: 'user-1', username: 'alice', role: 'user' }),
      makeAdmin({ userId: 'user-2', username: 'bob', role: 'user' }),
    ]);
    vi.mocked(listVaultsByUser)
      .mockResolvedValueOnce([{ vaultId: 'vault-1', userId: 'user-1', displayName: 'Personal Vault', createdAt: '2024-01-01T00:00:00.000Z' }])
      .mockResolvedValueOnce([{ vaultId: 'vault-2', userId: 'user-2', displayName: 'Personal Vault', createdAt: '2024-01-01T00:00:00.000Z' }]);
    mockGetVaultFileSize.mockResolvedValueOnce(1024).mockResolvedValueOnce(512);
    mockGetLoginCountSince.mockResolvedValue(0);
    const result = await getStats();
    expect(result.totalVaultSizeBytes).toBe(1536);
  });

  it('handles null vault sizes gracefully', async () => {
    mockListAllUsers.mockResolvedValue([
      makeAdmin({ userId: 'user-1', username: 'alice', role: 'user' }),
    ]);
    mockGetVaultFileSize.mockResolvedValue(null as unknown as number);
    mockGetLoginCountSince.mockResolvedValue(0);
    const result = await getStats();
    expect(result.totalVaultSizeBytes).toBe(0);
  });

  it('returns loginsLast7Days from getLoginCountSince', async () => {
    mockListAllUsers.mockResolvedValue([
      makeAdmin({ userId: 'user-1', username: 'alice', role: 'user' }),
    ]);
    mockGetVaultFileSize.mockResolvedValue(0);
    mockGetLoginCountSince.mockResolvedValue(42);
    const result = await getStats();
    expect(result.loginsLast7Days).toBe(42);
    expect(mockGetLoginCountSince).toHaveBeenCalledWith(expect.any(String));
  });

  it('passes a timestamp approximately 7 days ago to getLoginCountSince', async () => {
    mockListAllUsers.mockResolvedValue([]);
    mockGetLoginCountSince.mockResolvedValue(0);
    const before = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1000).toISOString();
    await getStats();
    const after = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 1000).toISOString();
    const calledWith = mockGetLoginCountSince.mock.calls[0][0];
    expect(calledWith >= before).toBe(true);
    expect(calledWith <= after).toBe(true);
  });
});

// ── lockUser() ────────────────────────────────────────────────────────────────

describe('lockUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue(null);
    const result = await lockUser('user-1');
    expect(result.statusCode).toBe(404);
  });

  it('returns 403 when user is admin', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'admin', status: 'active' }));
    const result = await lockUser('admin-1');
    expect(result.statusCode).toBe(403);
  });

  it('returns 400 when user is already locked', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'locked' }));
    const result = await lockUser('user-1');
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when user is retired', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'retired' }));
    const result = await lockUser('user-1');
    expect(result.statusCode).toBe(404);
  });

  it('sets status to locked for an active user', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'active', userId: 'user-1' }));
    const result = await lockUser('user-1');
    expect(result.response?.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { status: 'locked' });
  });
});

// ── unlockUser() ──────────────────────────────────────────────────────────────

describe('unlockUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue(null);
    const result = await unlockUser('user-1');
    expect(result.statusCode).toBe(404);
  });

  it('returns 403 when user is admin', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'admin', status: 'locked' }));
    const result = await unlockUser('admin-1');
    expect(result.statusCode).toBe(403);
  });

  it('returns 400 when user is not locked', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'active' }));
    const result = await unlockUser('user-1');
    expect(result.statusCode).toBe(400);
  });

  it('restores status to active', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'locked', userId: 'user-1' }));
    const result = await unlockUser('user-1');
    expect(result.response?.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { status: 'active' });
  });
});

// ── expireUser() ──────────────────────────────────────────────────────────────

describe('expireUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue(null);
    const result = await expireUser('user-1');
    expect(result.statusCode).toBe(404);
  });

  it('returns 403 when user is admin', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'admin', status: 'active' }));
    const result = await expireUser('admin-1');
    expect(result.statusCode).toBe(403);
  });

  it('returns 404 when user is retired', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'retired' }));
    const result = await expireUser('user-1');
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when user is already expired', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'expired' }));
    const result = await expireUser('user-1');
    expect(result.statusCode).toBe(400);
  });

  it('sets status to expired for an active user', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'active', userId: 'user-1' }));
    const result = await expireUser('user-1');
    expect(result.response?.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { status: 'expired' });
  });
});

// ── retireUser() ──────────────────────────────────────────────────────────────

describe('retireUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue(null);
    const result = await retireUser('user-1');
    expect(result.statusCode).toBe(404);
  });

  it('returns 403 when user is admin', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'admin', status: 'active' }));
    const result = await retireUser('admin-1');
    expect(result.statusCode).toBe(403);
  });

  it('returns 404 when user is already retired', async () => {
    mockGetUserById.mockResolvedValue(makeAdmin({ role: 'user', status: 'retired' }));
    const result = await retireUser('user-1');
    expect(result.statusCode).toBe(404);
  });

  it('renames username and sets status to retired', async () => {
    mockGetUserById.mockResolvedValue(
      makeAdmin({ role: 'user', status: 'active', userId: 'user-1', username: 'bob@example.com' }),
    );
    const result = await retireUser('user-1');
    expect(result.response?.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', {
      status: 'retired',
      username: '_retired_user-1_bob@example.com',
    });
  });

  it('frees original username for reuse after retire', async () => {
    mockGetUserById.mockResolvedValue(
      makeAdmin({ role: 'user', status: 'active', userId: 'user-1', username: 'alice@example.com' }),
    );
    await retireUser('user-1');
    const [, updates] = mockUpdateUser.mock.calls[0];
    expect((updates as { username: string }).username).not.toBe('alice@example.com');
    expect((updates as { username: string }).username).toContain('alice@example.com');
    expect((updates as { username: string }).username).toContain('_retired_');
  });
});

// ── verifyEmailToken() ────────────────────────────────────────────────────────

describe('verifyEmailToken', () => {
  beforeEach(() => vi.clearAllMocks());

  const futureExpiry = new Date(Date.now() + 60_000).toISOString();
  const pastExpiry = new Date(Date.now() - 60_000).toISOString();

  it('returns 400 when no user has the token', async () => {
    mockListAllUsers.mockResolvedValue([]);
    const result = await verifyEmailToken('no-such-token');
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when the token belongs to a non-pending_email_verification user', async () => {
    mockListAllUsers.mockResolvedValue([
      makeAdmin({ role: 'user', status: 'active', registrationToken: 'tok1', registrationTokenExpiresAt: futureExpiry }),
    ]);
    const result = await verifyEmailToken('tok1');
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when the token is expired', async () => {
    mockListAllUsers.mockResolvedValue([
      makeAdmin({ role: 'user', status: 'pending_email_verification', registrationToken: 'tok1', registrationTokenExpiresAt: pastExpiry }),
    ]);
    const result = await verifyEmailToken('tok1');
    expect(result.statusCode).toBe(400);
  });

  it('transitions user to pending_first_login on valid token', async () => {
    mockListAllUsers.mockResolvedValue([
      makeAdmin({ role: 'user', status: 'pending_email_verification', userId: 'user-1', registrationToken: 'tok1', registrationTokenExpiresAt: futureExpiry }),
    ]);
    const result = await verifyEmailToken('tok1');
    expect(result.response?.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ status: 'pending_first_login' }));
  });
});
