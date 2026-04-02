import { describe, it, expect, vi, beforeEach } from 'vitest';
import { API_PATHS } from '@passvault/shared';

vi.mock('../config.js', () => ({
  config: {
    environment: 'dev',
    features: { powEnabled: false, honeypotEnabled: true, passkeyRequired: false },
    session: { adminTokenExpiryHours: 24, userTokenExpiryMinutes: 30, otpExpiryMinutes: 60 },
  },
  getJwtSecret: vi.fn().mockResolvedValue('test-secret'),
  DYNAMODB_TABLE: 'test-table',
  FILES_BUCKET: 'test-bucket',
}));

vi.mock('../middleware/pow.js', () => ({
  validatePow: vi.fn().mockReturnValue({ valid: true, errorResponse: null }),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn(),
  requireAdminActive: vi.fn(),
}));

vi.mock('../services/admin.js', () => ({
  createUserInvitation: vi.fn(),
  listUsers: vi.fn(),
  refreshOtp: vi.fn(),
  deleteNewUser: vi.fn(),
  getStats: vi.fn(),
  lockUser: vi.fn(),
  unlockUser: vi.fn(),
  expireUser: vi.fn(),
  retireUser: vi.fn(),
  reactivateUser: vi.fn(),
  updateUserProfile: vi.fn(),
  adminEmailUserVault: vi.fn(),
  listLoginEvents: vi.fn(),
}));

vi.mock('../services/vault.js', () => ({
  downloadVault: vi.fn(),
  listVaults: vi.fn(),
}));

import { handler } from './admin-management.js';
import { createUserInvitation, listUsers, refreshOtp, deleteNewUser, getStats } from '../services/admin.js';
import { requireAdminActive } from '../middleware/auth.js';
import { validatePow } from '../middleware/pow.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { TokenPayload } from '../utils/jwt.js';

const mockCreateUser = vi.mocked(createUserInvitation);
const mockListUsers = vi.mocked(listUsers);
const mockRefreshOtp = vi.mocked(refreshOtp);
const mockDeleteNewUser = vi.mocked(deleteNewUser);
const mockGetStats = vi.mocked(getStats);
const mockRequireAdminActive = vi.mocked(requireAdminActive);
const mockValidatePow = vi.mocked(validatePow);

const adminUser: TokenPayload = {
  userId: 'admin-1',
  username: 'admin',
  role: 'admin',
  status: 'active',
};

function makeEvent(
  path: string,
  method: string,
  body?: object | string,
  queryStringParameters?: Record<string, string>,
): APIGatewayProxyEvent {
  return {
    path,
    httpMethod: method,
    headers: { Authorization: 'Bearer tok' },
    body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
    queryStringParameters: queryStringParameters ?? null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: path,
    isBase64Encoded: false,
  };
}

function adminAuthOk() {
  mockRequireAdminActive.mockResolvedValue({ user: adminUser, errorResponse: null });
}

function adminAuthFail(statusCode = 401) {
  mockRequireAdminActive.mockResolvedValue({
    user: null,
    errorResponse: { statusCode, body: statusCode === 401 ? '{"error":"Unauthorized"}' : '{"error":"Forbidden"}', headers: {} },
  });
}

// ── Routing ───────────────────────────────────────────────────────────────────

describe('routing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 for an unknown path', async () => {
    const res = await handler(makeEvent('/admin/unknown', 'GET'));
    expect(res.statusCode).toBe(404);
  });
});

// ── POST /admin/users ─────────────────────────────────────────────────────────

describe('POST /admin/users (create user)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 401 when unauthenticated', async () => {
    adminAuthFail();
    const res = await handler(makeEvent(API_PATHS.ADMIN_USERS, 'POST', { username: 'bob@example.com' }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when admin account is not fully set up', async () => {
    adminAuthFail(403);
    const res = await handler(makeEvent(API_PATHS.ADMIN_USERS, 'POST', { username: 'bob@example.com' }));
    expect(res.statusCode).toBe(403);
  });

  it('returns 201 on successful user creation', async () => {
    adminAuthOk();
    mockCreateUser.mockResolvedValue({
      response: { success: true, username: 'bob@example.com', oneTimePassword: 'OTP', userId: 'uid-2' },
    });
    const res = await handler(makeEvent(API_PATHS.ADMIN_USERS, 'POST', { username: 'bob@example.com' }));
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.username).toBe('bob@example.com');
  });
});

// ── GET /admin/users ──────────────────────────────────────────────────────────

describe('GET /admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 200 with user list', async () => {
    adminAuthOk();
    mockListUsers.mockResolvedValue({
      users: [{ userId: 'u1', username: 'alice', status: 'active', plan: 'free' as const, createdAt: '2024-01-01', lastLoginAt: null, vaultSizeBytes: 0 }],
    });
    const res = await handler(makeEvent(API_PATHS.ADMIN_USERS, 'GET'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.users).toHaveLength(1);
  });
});

// ── POST /api/admin/users/{userId}/refresh-otp ────────────────────────────────

describe('POST /api/admin/users/{userId}/refresh-otp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 401 when unauthenticated', async () => {
    adminAuthFail();
    const res = await handler(makeEvent('/api/admin/users/u1/refresh-otp', 'POST'));
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 on success', async () => {
    adminAuthOk();
    mockRefreshOtp.mockResolvedValue({
      response: { success: true, username: 'bob', oneTimePassword: 'NEWPASS', userId: 'u1' },
    });
    const res = await handler(makeEvent('/api/admin/users/u1/refresh-otp', 'POST'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.oneTimePassword).toBe('NEWPASS');
  });
});

// ── DELETE /api/admin/users/{userId} ──────────────────────────────────────────

describe('DELETE /api/admin/users/{userId}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 200 on success', async () => {
    adminAuthOk();
    mockDeleteNewUser.mockResolvedValue({ response: { success: true } });
    const res = await handler(makeEvent('/api/admin/users/u1', 'DELETE'));
    expect(res.statusCode).toBe(200);
  });
});

// ── GET /admin/stats ──────────────────────────────────────────────────────────

describe('GET /admin/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 401 when unauthenticated', async () => {
    adminAuthFail();
    const res = await handler(makeEvent(API_PATHS.ADMIN_STATS, 'GET'));
    expect(res.statusCode).toBe(401);
    expect(mockGetStats).not.toHaveBeenCalled();
  });

  it('returns 403 when admin is not active', async () => {
    adminAuthFail(403);
    const res = await handler(makeEvent(API_PATHS.ADMIN_STATS, 'GET'));
    expect(res.statusCode).toBe(403);
    expect(mockGetStats).not.toHaveBeenCalled();
  });

  it('returns 200 with stats on success', async () => {
    adminAuthOk();
    mockGetStats.mockResolvedValue({ totalUsers: 3, totalVaultSizeBytes: 4096, loginsLast7Days: 12 });
    const res = await handler(makeEvent(API_PATHS.ADMIN_STATS, 'GET'));
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body).data;
    expect(data.totalUsers).toBe(3);
    expect(data.totalVaultSizeBytes).toBe(4096);
    expect(data.loginsLast7Days).toBe(12);
  });

  it('returns 403 when PoW fails', async () => {
    mockValidatePow.mockReturnValue({
      valid: false,
      errorResponse: { statusCode: 403, body: '{"error":"PoW"}', headers: {} },
    });
    const res = await handler(makeEvent(API_PATHS.ADMIN_STATS, 'GET'));
    expect(res.statusCode).toBe(403);
    expect(mockGetStats).not.toHaveBeenCalled();
  });
});
