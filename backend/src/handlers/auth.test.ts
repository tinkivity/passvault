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
  listPasskeyCredentials: vi.fn().mockResolvedValue([]),
  createPasskeyCredential: vi.fn().mockResolvedValue(undefined),
  updatePasskeyCounter: vi.fn().mockResolvedValue(undefined),
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
    config.features.passkeyRequired = false;
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
    const res = await handler(makeEvent(API_PATHS.AUTH_CHANGE_PASSWORD, 'POST', { newPassword: 'Str0ng!Passw0rd' }));
    expect(mockChangePassword).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /auth/passkey/challenge', async () => {
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_CHALLENGE, 'GET'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.challengeJwt).toBe('challenge.jwt.token');
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.features.passkeyRequired = false;
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
    config.features.passkeyRequired = false;
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

// ── Passkey endpoints ─────────────────────────────────────────────────────────

import { generateChallengeJwt, verifyChallengeJwt, generatePasskeyToken, verifyPasskeyAssertion, verifyPasskeyAttestation } from '../services/passkey.js';
import { getUserByCredentialId, updateUser } from '../utils/dynamodb.js';

const mockGetUserByCredentialId = vi.mocked(getUserByCredentialId);
const mockVerifyPasskeyAssertion = vi.mocked(verifyPasskeyAssertion);
const mockVerifyPasskeyAttestation = vi.mocked(verifyPasskeyAttestation);

describe('GET /auth/passkey/challenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns challengeJwt', async () => {
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_CHALLENGE, 'GET'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.challengeJwt).toBe('challenge.jwt.token');
  });
});

describe('POST /auth/passkey/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
    mockValidateHoneypot.mockReturnValue({ valid: true, errorResponse: null });
    vi.mocked(verifyChallengeJwt).mockResolvedValue('base64urlchallenge');
  });

  it('returns 403 when PoW fails', async () => {
    mockValidatePow.mockReturnValue({ valid: false, errorResponse: { statusCode: 403, body: '{}', headers: {} } });
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_VERIFY, 'POST', {}));
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 when challengeJwt is invalid', async () => {
    vi.mocked(verifyChallengeJwt).mockRejectedValue(new Error('expired'));
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_VERIFY, 'POST', {
      challengeJwt: 'bad',
      assertion: { id: 'cred-1', rawId: 'cred-1', response: {}, type: 'public-key', clientExtensionResults: {} },
    }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when credential not found', async () => {
    mockGetUserByCredentialId.mockResolvedValue(null);
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_VERIFY, 'POST', {
      challengeJwt: 'valid',
      assertion: { id: 'cred-1', rawId: 'cred-1', response: {}, type: 'public-key', clientExtensionResults: {} },
    }));
    expect(res.statusCode).toBe(401);
  });

  it('returns passkeyToken on successful verification', async () => {
    mockGetUserByCredentialId.mockResolvedValue({
      user: {
        userId: 'user-1', username: 'alice', encryptionSalt: 'salt',
        role: 'user', status: 'active', passwordHash: '', oneTimePasswordHash: null,
        createdAt: '', lastLoginAt: null, createdBy: null, failedLoginAttempts: 0, lockedUntil: null,
        plan: 'free' as const, otpExpiresAt: null,
      },
      credential: {
        credentialId: 'cred-1', userId: 'user-1', name: 'My Key', publicKey: 'pubkey',
        counter: 0, transports: null, aaguid: '', createdAt: '2024-01-01T00:00:00Z',
      },
    });
    mockVerifyPasskeyAssertion.mockResolvedValue({ verified: true, newCounter: 1 });
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_VERIFY, 'POST', {
      challengeJwt: 'valid',
      assertion: { id: 'cred-1', rawId: 'cred-1', response: {}, type: 'public-key', clientExtensionResults: {} },
    }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.passkeyToken).toBe('passkey.jwt.token');
    expect(JSON.parse(res.body).data.username).toBe('alice');
  });
});

describe('GET /auth/passkey/register/challenge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ user: null, errorResponse: { statusCode: 401, body: '{}', headers: {} } });
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_REGISTER_CHALLENGE, 'GET'));
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when status is not active or pending_first_login', async () => {
    mockRequireAuth.mockResolvedValue({ user: { ...mockUser, status: 'locked' }, errorResponse: null });
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_REGISTER_CHALLENGE, 'GET'));
    expect(res.statusCode).toBe(403);
  });

  it('returns challengeJwt when user is active', async () => {
    mockRequireAuth.mockResolvedValue({ user: activeUser, errorResponse: null });
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_REGISTER_CHALLENGE, 'GET'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.challengeJwt).toBe('challenge.jwt.token');
  });
});

describe('POST /auth/passkey/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
    vi.mocked(verifyChallengeJwt).mockResolvedValue('base64urlchallenge');
  });

  it('returns 400 when attestation is invalid', async () => {
    mockRequireAuth.mockResolvedValue({ user: activeUser, errorResponse: null });
    mockVerifyPasskeyAttestation.mockResolvedValue({ verified: false, credentialId: '', publicKey: '', counter: 0, aaguid: '', transports: [] });
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_REGISTER, 'POST', {
      challengeJwt: 'valid',
      attestation: { id: 'cred-1', rawId: 'cred-1', response: {}, type: 'public-key', clientExtensionResults: {} },
    }));
    expect(res.statusCode).toBe(400);
  });

  it('creates passkey credential on successful registration', async () => {
    mockRequireAuth.mockResolvedValue({ user: activeUser, errorResponse: null });
    mockVerifyPasskeyAttestation.mockResolvedValue({
      verified: true, credentialId: 'cred-1', publicKey: 'pubkey', counter: 0, aaguid: 'aaguid', transports: ['internal'],
    });
    const { createPasskeyCredential } = await import('../utils/dynamodb.js');
    const res = await handler(makeEvent(API_PATHS.AUTH_PASSKEY_REGISTER, 'POST', {
      challengeJwt: 'valid',
      attestation: { id: 'cred-1', rawId: 'cred-1', response: {}, type: 'public-key', clientExtensionResults: {} },
    }));
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(createPasskeyCredential)).toHaveBeenCalledWith(expect.objectContaining({
      credentialId: 'cred-1',
      userId: 'user-1',
    }));
  });
});
