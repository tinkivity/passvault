import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERRORS } from '@passvault/shared';

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
  getUserById: vi.fn(),
  createUser: vi.fn().mockResolvedValue(undefined),
  updateUser: vi.fn().mockResolvedValue(undefined),
  listAllUsers: vi.fn(),
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
}));

vi.mock('./totp.js', () => ({
  verifyCode: vi.fn(),
}));

import { adminLogin, adminChangePassword, createUserInvitation, listUsers } from './admin.js';
import { getUserByUsername, updateUser, createUser, listAllUsers } from '../utils/dynamodb.js';
import { verifyPassword } from '../utils/crypto.js';
import { verifyCode } from './totp.js';
import { config } from '../config.js';
import type { User } from '@passvault/shared';

const mockGetUser = vi.mocked(getUserByUsername);
const mockVerifyPw = vi.mocked(verifyPassword);
const mockVerifyTotp = vi.mocked(verifyCode);
const mockUpdateUser = vi.mocked(updateUser);
const mockListAllUsers = vi.mocked(listAllUsers);

function makeAdmin(overrides: Partial<User> = {}): User {
  return {
    userId: 'admin-1',
    username: 'admin',
    passwordHash: '$2b$12$hash',
    oneTimePasswordHash: '$2b$12$otphash',
    role: 'admin',
    status: 'pending_first_login',
    totpSecret: null,
    totpEnabled: false,
    encryptionSalt: 'base64salt==',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastLoginAt: null,
    createdBy: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  };
}

// ── adminLogin() ──────────────────────────────────────────────────────────────

describe('adminLogin — user lookup failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
  });

  it('returns 401 when username is not found', async () => {
    mockGetUser.mockResolvedValue(null);
    const result = await adminLogin({ username: 'nobody', password: 'pass' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when account is not admin role', async () => {
    mockGetUser.mockResolvedValue(makeAdmin({ role: 'user' }));
    const result = await adminLogin({ username: 'admin', password: 'pass' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
  });
});

describe('adminLogin — pending_first_login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
    mockGetUser.mockResolvedValue(makeAdmin({ status: 'pending_first_login' }));
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

describe('adminLogin — active, totpRequired: false (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
    mockGetUser.mockResolvedValue(
      makeAdmin({ status: 'active', totpEnabled: true, totpSecret: 'SECRET' }),
    );
  });

  it('returns 401 for wrong password', async () => {
    mockVerifyPw.mockResolvedValue(false);
    const result = await adminLogin({ username: 'admin', password: 'wrong' });
    expect(result.error).toBe(ERRORS.INVALID_CREDENTIALS);
  });

  it('succeeds without TOTP (dev/beta)', async () => {
    mockVerifyPw.mockResolvedValue(true);
    const result = await adminLogin({ username: 'admin', password: 'correct' });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
  });
});

describe('adminLogin — active, totpRequired: true (prod)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = true;
    mockGetUser.mockResolvedValue(
      makeAdmin({ status: 'active', totpEnabled: true, totpSecret: 'SECRET' }),
    );
    mockVerifyPw.mockResolvedValue(true);
  });

  it('returns 401 when TOTP code is missing', async () => {
    const result = await adminLogin({ username: 'admin', password: 'correct' });
    expect(result.error).toBe(ERRORS.INVALID_TOTP);
  });

  it('returns 401 for an invalid TOTP code', async () => {
    mockVerifyTotp.mockReturnValue(false);
    const result = await adminLogin({
      username: 'admin',
      password: 'correct',
      totpCode: '000000',
    });
    expect(result.error).toBe(ERRORS.INVALID_TOTP);
  });

  it('succeeds with a valid TOTP code', async () => {
    mockVerifyTotp.mockReturnValue(true);
    const result = await adminLogin({
      username: 'admin',
      password: 'correct',
      totpCode: '123456',
    });
    expect(result.error).toBeUndefined();
    expect(result.response?.token).toBe('signed.jwt.token');
  });
});

// ── adminLogin() — lockout + input validation ─────────────────────────────────

describe('adminLogin — account lockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
  });

  it('returns 429 when lockedUntil is in the future', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockGetUser.mockResolvedValue(makeAdmin({ status: 'active', lockedUntil: future }));
    mockVerifyPw.mockResolvedValue(true);
    const result = await adminLogin({ username: 'admin', password: 'correct' });
    expect(result.statusCode).toBe(429);
    expect(result.error).toBe(ERRORS.ACCOUNT_LOCKED);
  });

  it('increments failedLoginAttempts on wrong password', async () => {
    mockGetUser.mockResolvedValue(makeAdmin({ status: 'active', failedLoginAttempts: 1 }));
    mockVerifyPw.mockResolvedValue(false);
    await adminLogin({ username: 'admin', password: 'wrong' });
    expect(mockUpdateUser).toHaveBeenCalledWith('admin-1', expect.objectContaining({ failedLoginAttempts: 2 }));
  });

  it('sets lockedUntil after 5 failed attempts', async () => {
    mockGetUser.mockResolvedValue(makeAdmin({ status: 'active', failedLoginAttempts: 4 }));
    mockVerifyPw.mockResolvedValue(false);
    await adminLogin({ username: 'admin', password: 'wrong' });
    expect(mockUpdateUser).toHaveBeenCalledWith('admin-1', expect.objectContaining({
      failedLoginAttempts: 5,
      lockedUntil: expect.any(String),
    }));
  });

  it('resets counter on successful login', async () => {
    mockGetUser.mockResolvedValue(makeAdmin({ status: 'active', failedLoginAttempts: 2 }));
    mockVerifyPw.mockResolvedValue(true);
    await adminLogin({ username: 'admin', password: 'correct' });
    expect(mockUpdateUser).toHaveBeenCalledWith('admin-1', expect.objectContaining({
      failedLoginAttempts: 0,
      lockedUntil: null,
    }));
  });
});

describe('adminLogin — input validation (M3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 for oversized username without hitting DynamoDB', async () => {
    const result = await adminLogin({ username: 'a'.repeat(31), password: 'pass' });
    expect(result.statusCode).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns 401 for oversized password without hitting DynamoDB', async () => {
    const result = await adminLogin({ username: 'admin', password: 'x'.repeat(1025) });
    expect(result.statusCode).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
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

describe('adminChangePassword — totpRequired: false (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
  });

  it('sets next status to active', async () => {
    await adminChangePassword('admin-1', 'admin', { newPassword: 'StrongPass123!' });
    expect(mockUpdateUser).toHaveBeenCalledWith(
      'admin-1',
      expect.objectContaining({ status: 'active' }),
    );
  });
});

describe('adminChangePassword — totpRequired: true (prod)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = true;
  });

  it('sets next status to pending_totp_setup', async () => {
    await adminChangePassword('admin-1', 'admin', { newPassword: 'StrongPass123!' });
    expect(mockUpdateUser).toHaveBeenCalledWith(
      'admin-1',
      expect.objectContaining({ status: 'pending_totp_setup' }),
    );
  });
});

// ── createUserInvitation() ────────────────────────────────────────────────────

describe('createUserInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue(null); // username not taken by default
  });

  it('returns 400 for a username that is too short', async () => {
    const result = await createUserInvitation({ username: 'ab' }, 'admin-1');
    expect(result.statusCode).toBe(400);
    expect(result.error).toBe(ERRORS.INVALID_USERNAME);
  });

  it('returns 400 for a username that is too long', async () => {
    const result = await createUserInvitation({ username: 'a'.repeat(31) }, 'admin-1');
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for a username with invalid characters', async () => {
    const result = await createUserInvitation({ username: 'bad user!' }, 'admin-1');
    expect(result.statusCode).toBe(400);
  });

  it('returns 409 when username already exists', async () => {
    mockGetUser.mockResolvedValue(makeAdmin({ username: 'bob', role: 'user' }));
    const result = await createUserInvitation({ username: 'bob' }, 'admin-1');
    expect(result.statusCode).toBe(409);
    expect(result.error).toBe(ERRORS.USER_EXISTS);
  });

  it('creates a user and returns the OTP', async () => {
    const result = await createUserInvitation({ username: 'bob' }, 'admin-1');
    expect(result.error).toBeUndefined();
    expect(result.response?.username).toBe('bob');
    expect(result.response?.oneTimePassword).toBe('ABCDEFGH12345678');
    expect(vi.mocked(createUser)).toHaveBeenCalled();
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
    const result = await listUsers();
    expect(result.users[0].vaultSizeBytes).toBe(1024);
  });
});
