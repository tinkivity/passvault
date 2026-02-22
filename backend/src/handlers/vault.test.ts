import { describe, it, expect, vi, beforeEach } from 'vitest';
import { API_PATHS, ERRORS } from '@passvault/shared';

vi.mock('../config.js', () => ({
  config: {
    environment: 'dev',
    features: { powEnabled: false, honeypotEnabled: true, totpRequired: false },
    session: { adminTokenExpiryHours: 24, userTokenExpiryMinutes: 30 },
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
}));

vi.mock('../services/vault.js', () => ({
  getVault: vi.fn(),
  putVault: vi.fn(),
  downloadVault: vi.fn(),
}));

import { handler } from './vault.js';
import { getVault, putVault, downloadVault } from '../services/vault.js';
import { requireAuth } from '../middleware/auth.js';
import { validatePow } from '../middleware/pow.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { TokenPayload } from '../utils/jwt.js';

const mockGetVault = vi.mocked(getVault);
const mockPutVault = vi.mocked(putVault);
const mockDownload = vi.mocked(downloadVault);
const mockRequireAuth = vi.mocked(requireAuth);
const mockValidatePow = vi.mocked(validatePow);

const activeUser: TokenPayload = {
  userId: 'user-1',
  username: 'alice',
  role: 'user',
  status: 'active',
};

const inactiveUser: TokenPayload = { ...activeUser, status: 'pending_first_login' };

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

function authOk(user = activeUser) {
  mockRequireAuth.mockResolvedValue({ user, errorResponse: null });
}

function authFail(statusCode = 401) {
  mockRequireAuth.mockResolvedValue({
    user: null,
    errorResponse: { statusCode, body: '{"error":"Unauthorized"}', headers: {} },
  });
}

// ── Routing ───────────────────────────────────────────────────────────────────

describe('routing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 for an unknown path', async () => {
    const res = await handler(makeEvent('/vault/unknown', 'DELETE'));
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /vault ────────────────────────────────────────────────────────────────

describe('GET /vault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 403 when PoW fails', async () => {
    mockValidatePow.mockReturnValue({
      valid: false,
      errorResponse: { statusCode: 403, body: '{"error":"PoW"}', headers: {} },
    });
    const res = await handler(makeEvent(API_PATHS.VAULT, 'GET'));
    expect(res.statusCode).toBe(403);
    expect(mockGetVault).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    authFail();
    const res = await handler(makeEvent(API_PATHS.VAULT, 'GET'));
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when user status is not active', async () => {
    authOk(inactiveUser);
    const res = await handler(makeEvent(API_PATHS.VAULT, 'GET'));
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with vault content', async () => {
    authOk();
    mockGetVault.mockResolvedValue({
      response: { encryptedContent: 'blob', lastModified: '2024-01-01T00:00:00.000Z' },
    });
    const res = await handler(makeEvent(API_PATHS.VAULT, 'GET'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.encryptedContent).toBe('blob');
  });
});

// ── PUT /vault ────────────────────────────────────────────────────────────────

describe('PUT /vault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 401 when unauthenticated', async () => {
    authFail();
    const res = await handler(makeEvent(API_PATHS.VAULT, 'PUT', { encryptedContent: 'x' }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when user is not active', async () => {
    authOk(inactiveUser);
    const res = await handler(makeEvent(API_PATHS.VAULT, 'PUT', { encryptedContent: 'x' }));
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when content is too large', async () => {
    authOk();
    mockPutVault.mockResolvedValue({ error: ERRORS.FILE_TOO_LARGE, statusCode: 400 });
    const res = await handler(makeEvent(API_PATHS.VAULT, 'PUT', { encryptedContent: 'huge' }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on successful save', async () => {
    authOk();
    mockPutVault.mockResolvedValue({
      response: { success: true, lastModified: '2024-06-01T12:00:00.000Z' },
    });
    const res = await handler(makeEvent(API_PATHS.VAULT, 'PUT', { encryptedContent: 'data' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.success).toBe(true);
  });

  it('returns 400 for invalid JSON body', async () => {
    authOk();
    const res = await handler(makeEvent(API_PATHS.VAULT, 'PUT', 'not valid json'));
    expect(res.statusCode).toBe(400);
    expect(mockPutVault).not.toHaveBeenCalled();
  });

  it('returns 400 for non-object body (array)', async () => {
    authOk();
    const res = await handler(makeEvent(API_PATHS.VAULT, 'PUT', '[1,2,3]'));
    expect(res.statusCode).toBe(400);
    expect(mockPutVault).not.toHaveBeenCalled();
  });
});

// ── GET /vault/download ───────────────────────────────────────────────────────

describe('GET /vault/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePow.mockReturnValue({ valid: true, errorResponse: null });
  });

  it('returns 401 when unauthenticated', async () => {
    authFail();
    const res = await handler(makeEvent(API_PATHS.VAULT_DOWNLOAD, 'GET'));
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with download package on success', async () => {
    authOk();
    mockDownload.mockResolvedValue({
      response: {
        encryptedContent: 'data',
        encryptionSalt: 'salt',
        algorithm: 'argon2id+aes-256-gcm',
        parameters: { argon2: { memory: 65536, iterations: 3, parallelism: 4, hashLength: 32 }, aes: { keySize: 256, ivSize: 96, tagSize: 128 } },
        lastModified: '2024-06-01T12:00:00.000Z',
        username: 'alice',
      },
    });
    const res = await handler(makeEvent(API_PATHS.VAULT_DOWNLOAD, 'GET'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.username).toBe('alice');
  });
});
