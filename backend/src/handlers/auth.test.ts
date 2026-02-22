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

vi.mock('../services/auth.js', () => ({
  login: vi.fn(),
  changePassword: vi.fn(),
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

import { handler } from './auth.js';
import { login, changePassword } from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { validatePow } from '../middleware/pow.js';
import { validateHoneypot } from '../middleware/honeypot.js';
import { config } from '../config.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { TokenPayload } from '../utils/jwt.js';

const mockLogin = vi.mocked(login);
const mockChangePassword = vi.mocked(changePassword);
const mockRequireAuth = vi.mocked(requireAuth);
const mockValidatePow = vi.mocked(validatePow);
const mockValidateHoneypot = vi.mocked(validateHoneypot);

const mockUser: TokenPayload = {
  userId: 'user-1',
  username: 'alice',
  role: 'user',
  status: 'pending_first_login',
};

const activeUser: TokenPayload = { ...mockUser, status: 'active' };

function makeEvent(
  path: string,
  method: string,
  body?: object | string,
  headers: Record<string, string> = {},
): APIGatewayProxyEvent {
  return {
    path,
    httpMethod: method,
    headers,
    body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: path,
    isBase64Encoded: false,
  };
}

// ── Routing ───────────────────────────────────────────────────────────────────

describe('routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
    mockValidateHoneypot.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 404 for an unknown path', async () => {
    const res = await handler(makeEvent('/auth/unknown', 'POST'));
    expect(res.statusCode).toBe(404);
  });

  it('routes POST /auth/login', async () => {
    mockLogin.mockResolvedValue({ response: { token: 'tok', role: 'user', username: 'alice', encryptionSalt: 'salt' } });
    const res = await handler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', { username: 'alice', password: 'pass' }));
    expect(mockLogin).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('routes POST /auth/change-password', async () => {
    mockRequireAuth.mockResolvedValue({ user: mockUser, errorResponse: null });
    mockChangePassword.mockResolvedValue({ response: { success: true } });
    const res = await handler(makeEvent(API_PATHS.AUTH_CHANGE_PASSWORD, 'POST', { newPassword: 'Strong1!' }));
    expect(mockChangePassword).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
    mockValidateHoneypot.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 403 when PoW fails', async () => {
    mockValidatePow.mockReturnValue({
      valid: false,
      errorResponse: { statusCode: 403, body: '{"error":"PoW required"}', headers: {} },
    });
    const res = await handler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', {}));
    expect(res.statusCode).toBe(403);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('returns 403 when honeypot fails', async () => {
    mockValidateHoneypot.mockReturnValue({
      valid: false,
      errorResponse: { statusCode: 403, body: '{"error":"Forbidden"}', headers: {} },
    });
    const res = await handler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', {}));
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 when credentials are invalid', async () => {
    mockLogin.mockResolvedValue({ error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 });
    const res = await handler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', { username: 'x', password: 'y' }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with token on success', async () => {
    mockLogin.mockResolvedValue({
      response: { token: 'jwt.token', role: 'user', username: 'alice', encryptionSalt: 'salt' },
    });
    const res = await handler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', { username: 'alice', password: 'pass' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.token).toBe('jwt.token');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await handler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', 'not valid json'));
    expect(res.statusCode).toBe(400);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('returns 400 for non-object body (null)', async () => {
    const res = await handler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', 'null'));
    expect(res.statusCode).toBe(400);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('returns 400 for array body', async () => {
    const res = await handler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', '[1,2,3]'));
    expect(res.statusCode).toBe(400);
    expect(mockLogin).not.toHaveBeenCalled();
  });
});

// ── POST /auth/change-password ────────────────────────────────────────────────

describe('POST /auth/change-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({
      user: null,
      errorResponse: { statusCode: 401, body: '{"error":"Unauthorized"}', headers: {} },
    });
    const res = await handler(makeEvent(API_PATHS.AUTH_CHANGE_PASSWORD, 'POST', {}));
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when user status is not pending_first_login', async () => {
    mockRequireAuth.mockResolvedValue({ user: activeUser, errorResponse: null });
    const res = await handler(makeEvent(API_PATHS.AUTH_CHANGE_PASSWORD, 'POST', { newPassword: 'new' }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on success', async () => {
    mockRequireAuth.mockResolvedValue({ user: mockUser, errorResponse: null });
    mockChangePassword.mockResolvedValue({ response: { success: true } });
    const res = await handler(makeEvent(API_PATHS.AUTH_CHANGE_PASSWORD, 'POST', { newPassword: 'StrongPass123!' }));
    expect(res.statusCode).toBe(200);
  });
});

// ── TOTP endpoints ────────────────────────────────────────────────────────────

describe('TOTP endpoints — totpRequired: false (dev/beta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = false;
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 404 for POST /auth/totp/setup', async () => {
    const res = await handler(makeEvent(API_PATHS.AUTH_TOTP_SETUP, 'POST'));
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for POST /auth/totp/verify', async () => {
    const res = await handler(makeEvent(API_PATHS.AUTH_TOTP_VERIFY, 'POST'));
    expect(res.statusCode).toBe(404);
  });
});

describe('TOTP endpoints — totpRequired: true (prod)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.totpRequired = true;
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 401 for POST /auth/totp/setup when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({
      user: null,
      errorResponse: { statusCode: 401, body: '{}', headers: {} },
    });
    const res = await handler(makeEvent(API_PATHS.AUTH_TOTP_SETUP, 'POST'));
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 for POST /auth/totp/setup when pending_totp_setup', async () => {
    mockRequireAuth.mockResolvedValue({
      user: { ...mockUser, status: 'pending_totp_setup' },
      errorResponse: null,
    });
    // updateUser is already mocked via vi.mock('../utils/dynamodb.js')
    const res = await handler(makeEvent(API_PATHS.AUTH_TOTP_SETUP, 'POST'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.secret).toBe('TOTP_SECRET');
  });
});
