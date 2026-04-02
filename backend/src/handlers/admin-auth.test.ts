import { describe, it, expect, vi, beforeEach } from 'vitest';
import { API_PATHS, ERRORS } from '@passvault/shared';

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

vi.mock('../middleware/pow.js', () => ({
  validatePow: vi.fn().mockReturnValue({ valid: true, errorResponse: null }),
}));

vi.mock('../middleware/honeypot.js', () => ({
  validateHoneypot: vi.fn().mockReturnValue({ valid: true, errorResponse: null }),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn(),
  requireAdminActive: vi.fn(),
}));

vi.mock('../services/admin.js', () => ({
  adminLogin: vi.fn(),
  adminChangePassword: vi.fn(),
}));

vi.mock('../services/passkey.js', () => ({
  generateChallengeJwt: vi.fn().mockResolvedValue('challenge.jwt.token'),
  verifyChallengeJwt: vi.fn().mockResolvedValue('base64urlchallenge'),
  generatePasskeyToken: vi.fn().mockResolvedValue('passkey.jwt.token'),
  verifyPasskeyAssertion: vi.fn(),
  verifyPasskeyAttestation: vi.fn(),
}));

vi.mock('../utils/dynamodb.js', () => ({
  getUserByCredentialId: vi.fn(),
  updateUser: vi.fn().mockResolvedValue(undefined),
}));

import { handler } from './admin-auth.js';
import { adminLogin, adminChangePassword } from '../services/admin.js';
import { verifyPasskeyAttestation } from '../services/passkey.js';
import { requireAuth } from '../middleware/auth.js';
import { validatePow } from '../middleware/pow.js';
import { validateHoneypot } from '../middleware/honeypot.js';
import { updateUser } from '../utils/dynamodb.js';
import { config } from '../config.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { TokenPayload } from '../utils/jwt.js';

const mockAdminLogin = vi.mocked(adminLogin);
const mockChangePassword = vi.mocked(adminChangePassword);
const mockRequireAuth = vi.mocked(requireAuth);
const mockValidatePow = vi.mocked(validatePow);
const mockValidateHoneypot = vi.mocked(validateHoneypot);
const mockVerifyPasskeyAttestation = vi.mocked(verifyPasskeyAttestation);

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
): APIGatewayProxyEvent {
  return {
    path,
    httpMethod: method,
    headers: { Authorization: 'Bearer tok' },
    body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
    queryStringParameters: null,
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
    mockRequireAuth.mockResolvedValue({ user: { ...adminUser, role: 'user' }, errorResponse: null });
    const res = await handler(makeEvent(API_PATHS.ADMIN_CHANGE_PASSWORD, 'POST', { newPassword: 'Str0ng!Passw0rd' }));
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when status is locked', async () => {
    authOk({ ...adminUser, status: 'locked' });
    const res = await handler(makeEvent(API_PATHS.ADMIN_CHANGE_PASSWORD, 'POST', { newPassword: 'Str0ng!Passw0rd' }));
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on success', async () => {
    authOk(pendingAdmin);
    mockChangePassword.mockResolvedValue({ response: { success: true } });
    const res = await handler(makeEvent(API_PATHS.ADMIN_CHANGE_PASSWORD, 'POST', { newPassword: 'Str0ng!Passw0rd' }));
    expect(res.statusCode).toBe(200);
  });
});

// ── GET /admin/passkey/challenge ──────────────────────────────────────────────

describe('GET /admin/passkey/challenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns challengeJwt', async () => {
    const res = await handler(makeEvent(API_PATHS.ADMIN_PASSKEY_CHALLENGE, 'GET'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.challengeJwt).toBe('challenge.jwt.token');
  });
});

// ── GET /admin/passkey/register/challenge ─────────────────────────────────────

describe('GET /admin/passkey/register/challenge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = true;
  });

  it('returns 404 when passkeyRequired is false', async () => {
    config.features.passkeyRequired = false;
    mockRequireAuth.mockResolvedValue({ user: { ...adminUser, status: 'pending_passkey_setup' }, errorResponse: null });
    const res = await handler(makeEvent(API_PATHS.ADMIN_PASSKEY_REGISTER_CHALLENGE, 'GET'));
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when status is not pending_passkey_setup', async () => {
    authOk(adminUser);
    const res = await handler(makeEvent(API_PATHS.ADMIN_PASSKEY_REGISTER_CHALLENGE, 'GET'));
    expect(res.statusCode).toBe(400);
  });

  it('returns challengeJwt for admin with pending_passkey_setup', async () => {
    mockRequireAuth.mockResolvedValue({ user: { ...adminUser, status: 'pending_passkey_setup' }, errorResponse: null });
    const res = await handler(makeEvent(API_PATHS.ADMIN_PASSKEY_REGISTER_CHALLENGE, 'GET'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.challengeJwt).toBe('challenge.jwt.token');
  });
});

// ── POST /admin/passkey/register ──────────────────────────────────────────────

describe('POST /admin/passkey/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = true;
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('sets status to active on successful registration', async () => {
    mockRequireAuth.mockResolvedValue({ user: { ...adminUser, status: 'pending_passkey_setup' }, errorResponse: null });
    mockVerifyPasskeyAttestation.mockResolvedValue({
      verified: true, credentialId: 'cred-1', publicKey: 'pubkey', counter: 0, aaguid: 'aaguid', transports: ['internal'],
    });
    const res = await handler(makeEvent(API_PATHS.ADMIN_PASSKEY_REGISTER, 'POST', {
      challengeJwt: 'valid',
      attestation: { id: 'cred-1', rawId: 'cred-1', response: {}, type: 'public-key', clientExtensionResults: {} },
    }));
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(updateUser)).toHaveBeenCalledWith('admin-1', expect.objectContaining({ status: 'active' }));
  });
});
