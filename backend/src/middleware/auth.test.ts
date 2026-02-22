import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({
  config: {
    environment: 'dev',
    features: { powEnabled: false, honeypotEnabled: true, totpRequired: false },
    session: { adminTokenExpiryHours: 24, userTokenExpiryMinutes: 30 },
  },
  getJwtSecret: vi.fn().mockResolvedValue('test-secret-long-enough-for-hs256'),
  DYNAMODB_TABLE: 'test-table',
  FILES_BUCKET: 'test-bucket',
}));

vi.mock('../utils/jwt.js', () => ({
  verifyToken: vi.fn(),
}));

import { extractToken, authenticate, requireAuth, requireRole } from './auth.js';
import { verifyToken } from '../utils/jwt.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { TokenPayload } from '../utils/jwt.js';

const mockVerify = vi.mocked(verifyToken);

const activeUser: TokenPayload = {
  userId: 'user-1',
  username: 'alice',
  role: 'user',
  status: 'active',
};

const adminUser: TokenPayload = {
  userId: 'admin-1',
  username: 'admin',
  role: 'admin',
  status: 'active',
};

function makeEvent(headers: Record<string, string> = {}): APIGatewayProxyEvent {
  return {
    path: '/',
    httpMethod: 'GET',
    headers,
    body: null,
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/',
    isBase64Encoded: false,
  };
}

describe('extractToken', () => {
  it('returns null when Authorization header is absent', () => {
    expect(extractToken(makeEvent())).toBeNull();
  });

  it('returns null for a non-Bearer scheme', () => {
    expect(extractToken(makeEvent({ Authorization: 'Basic dXNlcjpwYXNz' }))).toBeNull();
  });

  it('returns null when Bearer value is missing', () => {
    expect(extractToken(makeEvent({ Authorization: 'Bearer' }))).toBeNull();
  });

  it('extracts the token from a valid Bearer header', () => {
    const token = extractToken(makeEvent({ Authorization: 'Bearer my.jwt.token' }));
    expect(token).toBe('my.jwt.token');
  });

  it('accepts lowercase authorization header', () => {
    const token = extractToken(makeEvent({ authorization: 'Bearer my.jwt.token' }));
    expect(token).toBe('my.jwt.token');
  });
});

describe('authenticate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no token is present', async () => {
    const result = await authenticate(makeEvent());
    expect(result).toBeNull();
  });

  it('returns the payload for a valid token', async () => {
    mockVerify.mockResolvedValue(activeUser);
    const result = await authenticate(makeEvent({ Authorization: 'Bearer valid.token' }));
    expect(result).toEqual(activeUser);
  });

  it('returns null when verifyToken throws (expired / tampered)', async () => {
    mockVerify.mockRejectedValue(new Error('jwt expired'));
    const result = await authenticate(makeEvent({ Authorization: 'Bearer bad.token' }));
    expect(result).toBeNull();
  });
});

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no token is present', async () => {
    const { user, errorResponse } = await requireAuth(makeEvent());
    expect(user).toBeNull();
    expect(errorResponse?.statusCode).toBe(401);
  });

  it('returns the user payload when authenticated', async () => {
    mockVerify.mockResolvedValue(activeUser);
    const { user, errorResponse } = await requireAuth(
      makeEvent({ Authorization: 'Bearer valid.token' }),
    );
    expect(errorResponse).toBeNull();
    expect(user?.userId).toBe('user-1');
  });
});

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const { errorResponse } = await requireRole(makeEvent(), 'admin');
    expect(errorResponse?.statusCode).toBe(401);
  });

  it('returns 403 when the user has the wrong role', async () => {
    mockVerify.mockResolvedValue(activeUser); // role: 'user'
    const { errorResponse } = await requireRole(
      makeEvent({ Authorization: 'Bearer token' }),
      'admin',
    );
    expect(errorResponse?.statusCode).toBe(403);
  });

  it('succeeds when the user has the correct role', async () => {
    mockVerify.mockResolvedValue(adminUser);
    const { user, errorResponse } = await requireRole(
      makeEvent({ Authorization: 'Bearer token' }),
      'admin',
    );
    expect(errorResponse).toBeNull();
    expect(user?.role).toBe('admin');
  });
});
