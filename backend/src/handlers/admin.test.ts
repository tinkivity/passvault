import { describe, it, expect, vi, beforeEach } from 'vitest';
import { API_PATHS, ERRORS } from '@passvault/shared';

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

vi.mock('../middleware/pow.js', () => ({
  validatePow: vi.fn().mockReturnValue({ valid: true, errorResponse: null }),
}));

vi.mock('../middleware/honeypot.js', () => ({
  validateHoneypot: vi.fn().mockReturnValue({ valid: true, errorResponse: null }),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('../services/admin.js', () => ({
  adminLogin: vi.fn(),
  adminChangePassword: vi.fn(),
  createUserInvitation: vi.fn(),
  listUsers: vi.fn(),
  downloadVault: vi.fn(),
}));

vi.mock('../services/vault.js', () => ({
  downloadVault: vi.fn(),
}));

vi.mock('../services/totp.js', () => ({
  generateSecret: vi.fn().mockReturnValue('TOTP_SECRET'),
  generateQrUri: vi.fn().mockReturnValue('otpauth://totp/...'),
  generateQrDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
  verifyCode: vi.fn(),
}));

vi.mock('../utils/dynamodb.js', () => ({
  getUserById: vi.fn(),
  updateUser: vi.fn().mockResolvedValue(undefined),
}));

import { handler } from './admin.js';
import {
  adminLogin,
  adminChangePassword,
  createUserInvitation,
  listUsers,
} from '../services/admin.js';
import { downloadVault } from '../services/vault.js';
import { requireAuth } from '../middleware/auth.js';
import { validatePow } from '../middleware/pow.js';
import { validateHoneypot } from '../middleware/honeypot.js';
import { config } from '../config.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { TokenPayload } from '../utils/jwt.js';

const mockAdminLogin = vi.mocked(adminLogin);
const mockChangePassword = vi.mocked(adminChangePassword);
const mockCreateUser = vi.mocked(createUserInvitation);
const mockListUsers = vi.mocked(listUsers);
const mockDownload = vi.mocked(downloadVault);
const mockRequireAuth = vi.mocked(requireAuth);
const mockValidatePow = vi.mocked(validatePow);
const mockValidateHoneypot = vi.mocked(validateHoneypot);

const adminUser: TokenPayload = {
  userId: 'admin-1',
  username: 'admin',
  role: 'admin',
  status: 'active',
};

const pendingAdmin: TokenPayload = { ...adminUser, status: 'pending_first_login' };

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

function authOk(user = adminUser) {
  mockRequireAuth.mockResolvedValue({ user, errorResponse: null });
}

function authFail() {
  mockRequireAuth.mockResolvedValue({
    user: null,
    errorResponse: { statusCode: 401, body: '{"error":"Unauthorized"}', headers: {} },
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

// ── POST /admin/login ─────────────────────────────────────────────────────────

describe('POST /admin/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
    mockValidateHoneypot.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 403 when PoW fails', async () => {
    mockValidatePow.mockReturnValue({
      valid: false,
      errorResponse: { statusCode: 403, body: '{"error":"PoW"}', headers: {} },
    });
    const res = await handler(makeEvent(API_PATHS.ADMIN_LOGIN, 'POST', {}));
    expect(res.statusCode).toBe(403);
    expect(mockAdminLogin).not.toHaveBeenCalled();
  });

  it('returns 401 for invalid credentials', async () => {
    mockAdminLogin.mockResolvedValue({ error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 });
    const res = await handler(makeEvent(API_PATHS.ADMIN_LOGIN, 'POST', { username: 'admin', password: 'wrong' }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with token on success', async () => {
    mockAdminLogin.mockResolvedValue({
      response: { token: 'jwt.tok', role: 'admin', username: 'admin', encryptionSalt: 'salt' },
    });
    const res = await handler(makeEvent(API_PATHS.ADMIN_LOGIN, 'POST', { username: 'admin', password: 'otp' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.token).toBe('jwt.tok');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await handler(makeEvent(API_PATHS.ADMIN_LOGIN, 'POST', 'not valid json'));
    expect(res.statusCode).toBe(400);
    expect(mockAdminLogin).not.toHaveBeenCalled();
  });

  it('returns 400 for non-object body (array)', async () => {
    const res = await handler(makeEvent(API_PATHS.ADMIN_LOGIN, 'POST', '[1,2,3]'));
    expect(res.statusCode).toBe(400);
    expect(mockAdminLogin).not.toHaveBeenCalled();
  });
});

// ── POST /admin/change-password ───────────────────────────────────────────────

describe('POST /admin/change-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 401 when unauthenticated', async () => {
    authFail();
    const res = await handler(makeEvent(API_PATHS.ADMIN_CHANGE_PASSWORD, 'POST', {}));
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when role is not admin', async () => {
    mockRequireAuth.mockResolvedValue({
      user: { ...adminUser, role: 'user' },
      errorResponse: null,
    });
    const res = await handler(makeEvent(API_PATHS.ADMIN_CHANGE_PASSWORD, 'POST', {}));
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when status is not pending_first_login', async () => {
    authOk(adminUser); // status: active
    const res = await handler(makeEvent(API_PATHS.ADMIN_CHANGE_PASSWORD, 'POST', {}));
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on success', async () => {
    authOk(pendingAdmin);
    mockChangePassword.mockResolvedValue({ response: { success: true } });
    const res = await handler(makeEvent(API_PATHS.ADMIN_CHANGE_PASSWORD, 'POST', { newPassword: 'Strong1!' }));
    expect(res.statusCode).toBe(200);
  });
});

// ── POST /admin/users ─────────────────────────────────────────────────────────

describe('POST /admin/users (create user)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 401 when unauthenticated', async () => {
    authFail();
    const res = await handler(makeEvent(API_PATHS.ADMIN_USERS, 'POST', { username: 'bob' }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when admin account is not fully set up', async () => {
    authOk(pendingAdmin);
    const res = await handler(makeEvent(API_PATHS.ADMIN_USERS, 'POST', { username: 'bob' }));
    expect(res.statusCode).toBe(403);
  });

  it('returns 201 on successful user creation', async () => {
    authOk();
    mockCreateUser.mockResolvedValue({
      response: { success: true, username: 'bob', oneTimePassword: 'OTP', userId: 'uid-2' },
    });
    const res = await handler(makeEvent(API_PATHS.ADMIN_USERS, 'POST', { username: 'bob' }));
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.username).toBe('bob');
  });
});

// ── GET /admin/users ──────────────────────────────────────────────────────────

describe('GET /admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 200 with user list', async () => {
    authOk();
    mockListUsers.mockResolvedValue({
      users: [{ userId: 'u1', username: 'alice', status: 'active', createdAt: '2024-01-01', lastLoginAt: null, vaultSizeBytes: 0 }],
    });
    const res = await handler(makeEvent(API_PATHS.ADMIN_USERS, 'GET'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.users).toHaveLength(1);
  });
});

// ── TOTP endpoints ────────────────────────────────────────────────────────────

describe('TOTP endpoints — totpRequired: false (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 404 for POST /admin/totp/setup', async () => {
    const res = await handler(makeEvent(API_PATHS.ADMIN_TOTP_SETUP, 'POST'));
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for POST /admin/totp/verify', async () => {
    const res = await handler(makeEvent(API_PATHS.ADMIN_TOTP_VERIFY, 'POST'));
    expect(res.statusCode).toBe(404);
  });
});
