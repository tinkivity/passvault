/**
 * Integration test: Admin two-step login flow (beta/prod)
 *
 * Exercises the full flow across both handlers:
 *   1. POST /api/auth/login           → requirePasskeyVerification
 *   2. GET  /api/admin/passkey/challenge → challengeJwt
 *   3. POST /api/admin/passkey/verify  → passkeyToken
 *   4. POST /api/admin/login           → final admin token
 *
 * Also covers the onboarding flow that precedes two-step login:
 *   OTP login → change password → passkey setup → two-step login
 *
 * Mock boundary: only @simplewebauthn/server verification functions are mocked.
 * Everything else (JWT, passkey tokens, routing, middleware, services) runs for real.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { API_PATHS, ERRORS } from '@passvault/shared';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => {
  const cfg = {
    environment: 'beta',
    features: {
      powEnabled: false,
      honeypotEnabled: false,
      passkeyRequired: true,
      wafEnabled: false,
      cloudFrontEnabled: true,
    },
    session: { adminTokenExpiryHours: 24, userTokenExpiryMinutes: 30, otpExpiryMinutes: 60 },
  };
  return {
    config: cfg,
    getJwtSecret: vi.fn().mockResolvedValue('test-jwt-secret-32-chars-long!!!'),
    DYNAMODB_TABLE: 'test-table',
    FILES_BUCKET: 'test-bucket',
  };
});

vi.mock('../middleware/pow.js', () => ({
  validatePow: vi.fn().mockReturnValue({ valid: true, errorResponse: null }),
}));

vi.mock('../middleware/honeypot.js', () => ({
  validateHoneypot: vi.fn().mockReturnValue({ valid: true, errorResponse: null }),
}));

// Mock DynamoDB — in-memory store for users and passkey credentials
const users = new Map<string, Record<string, unknown>>();
const usersByUsername = new Map<string, Record<string, unknown>>();
const passkeyCredentials = new Map<string, Record<string, unknown>>();
const credentialsByUser = new Map<string, Record<string, unknown>[]>();

function resetDb() {
  users.clear();
  usersByUsername.clear();
  passkeyCredentials.clear();
  credentialsByUser.clear();
}

function seedAdmin() {
  const admin = {
    userId: 'admin-1',
    username: 'admin@test.com',
    passwordHash: '', // set by hashPassword mock
    oneTimePasswordHash: '', // set by hashPassword mock
    role: 'admin',
    status: 'pending_first_login',
    encryptionSalt: 'base64salt==',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastLoginAt: null,
    createdBy: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    plan: 'free',
    otpExpiresAt: null,
  };
  users.set('admin-1', admin);
  usersByUsername.set('admin@test.com', admin);
  return admin;
}

vi.mock('../utils/dynamodb.js', () => ({
  getUserById: vi.fn(async (id: string) => users.get(id) ?? null),
  getUserByUsername: vi.fn(async (username: string) => usersByUsername.get(username) ?? null),
  updateUser: vi.fn(async (id: string, updates: Record<string, unknown>) => {
    const user = users.get(id);
    if (user) Object.assign(user, updates);
  }),
  recordLoginEvent: vi.fn().mockResolvedValue(undefined),
  listPasskeyCredentials: vi.fn(async (userId: string) => credentialsByUser.get(userId) ?? []),
  createPasskeyCredential: vi.fn(async (cred: Record<string, unknown>) => {
    passkeyCredentials.set(cred.credentialId as string, cred);
    const list = credentialsByUser.get(cred.userId as string) ?? [];
    list.push(cred);
    credentialsByUser.set(cred.userId as string, list);
  }),
  updatePasskeyCounter: vi.fn().mockResolvedValue(undefined),
  deletePasskeyCredential: vi.fn().mockResolvedValue(undefined),
  getUserByCredentialId: vi.fn(async (credId: string) => {
    const cred = passkeyCredentials.get(credId);
    if (!cred) return null;
    const user = users.get(cred.userId as string);
    if (!user) return null;
    return { user, credential: cred };
  }),
  renamePasskeyCredential: vi.fn().mockResolvedValue(undefined),
}));

// Mock crypto — use simple reversible "hashes" so we can verify passwords
vi.mock('../utils/crypto.js', () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`),
  verifyPassword: vi.fn(async (pw: string, hash: string) => hash === `hashed:${pw}`),
  generateOtp: vi.fn(() => 'test-otp-123'),
  generateSalt: vi.fn(() => 'base64salt=='),
}));

// Mock audit
vi.mock('../utils/audit.js', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock SES
vi.mock('../utils/ses.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock @simplewebauthn/server — THE SINGLE MOCK BOUNDARY for WebAuthn crypto
vi.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: vi.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 1 },
  }),
  verifyRegistrationResponse: vi.fn().mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: 'credential-id-1',
        publicKey: new Uint8Array([1, 2, 3, 4]),
        counter: 0,
      },
      aaguid: 'test-aaguid-1234',
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
    },
  }),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { handler as authHandler } from './auth.js';
import { handler as adminAuthHandler } from './admin-auth.js';
import { config } from '../config.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(
  path: string,
  method: string,
  body?: object | string,
  headers: Record<string, string> = {},
): APIGatewayProxyEvent {
  return {
    path,
    httpMethod: method,
    headers: { 'content-type': 'application/json', ...headers },
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

function parse(res: { body: string }) {
  return JSON.parse(res.body);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Admin two-step login flow (beta/prod)', () => {
  let adminToken: string;

  beforeAll(() => {
    process.env.PASSKEY_RP_ID = 'localhost';
    process.env.PASSKEY_ORIGIN = 'http://localhost';
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    config.features.passkeyRequired = true;
  });

  describe('full onboarding → two-step login', () => {
    it('step 1: admin logs in with OTP — gets requirePasswordChange', async () => {
      const admin = seedAdmin();
      admin.oneTimePasswordHash = 'hashed:otp-secret';

      const res = await authHandler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', {
        username: 'admin@test.com',
        password: 'otp-secret',
      }));

      expect(res.statusCode).toBe(200);
      const data = parse(res).data;
      expect(data.role).toBe('admin');
      expect(data.requirePasswordChange).toBe(true);
      expect(data.requirePasskeyVerification).toBeUndefined();
      adminToken = data.token;
    });

    it('step 2: admin changes password — status becomes pending_passkey_setup', async () => {
      const admin = seedAdmin();
      admin.oneTimePasswordHash = 'hashed:otp-secret';

      // Login first to get token
      const loginRes = await authHandler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', {
        username: 'admin@test.com',
        password: 'otp-secret',
      }));
      adminToken = parse(loginRes).data.token;

      // Change password
      const res = await adminAuthHandler(makeEvent(
        API_PATHS.ADMIN_CHANGE_PASSWORD,
        'POST',
        { newPassword: 'NewStr0ng!Pass99' },
        { Authorization: `Bearer ${adminToken}` },
      ));

      expect(res.statusCode).toBe(200);
      expect(parse(res).data.success).toBe(true);

      // Verify status changed
      const admin2 = users.get('admin-1')!;
      expect(admin2.status).toBe('pending_passkey_setup');
    });

    it('step 3: admin with pending_passkey_setup logs in — gets requirePasskeySetup', async () => {
      const admin = seedAdmin();
      admin.status = 'pending_passkey_setup';
      admin.passwordHash = 'hashed:MyStr0ng!Pass99';

      const res = await authHandler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', {
        username: 'admin@test.com',
        password: 'MyStr0ng!Pass99',
      }));

      expect(res.statusCode).toBe(200);
      const data = parse(res).data;
      expect(data.requirePasskeySetup).toBe(true);
      expect(data.requirePasskeyVerification).toBeUndefined();
      expect(data.requirePasswordChange).toBeUndefined();
    });

    it('step 4: admin registers passkey — status becomes active', async () => {
      const admin = seedAdmin();
      admin.status = 'pending_passkey_setup';
      admin.passwordHash = 'hashed:MyStr0ng!Pass99';

      // Login to get token
      const loginRes = await authHandler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', {
        username: 'admin@test.com',
        password: 'MyStr0ng!Pass99',
      }));
      adminToken = parse(loginRes).data.token;

      // Get register challenge
      const challengeRes = await adminAuthHandler(makeEvent(
        API_PATHS.ADMIN_PASSKEY_REGISTER_CHALLENGE,
        'GET',
        undefined,
        { Authorization: `Bearer ${adminToken}` },
      ));
      expect(challengeRes.statusCode).toBe(200);
      const { challengeJwt } = parse(challengeRes).data;

      // Register passkey
      const registerRes = await adminAuthHandler(makeEvent(
        API_PATHS.ADMIN_PASSKEY_REGISTER,
        'POST',
        {
          challengeJwt,
          attestation: {
            id: 'credential-id-1',
            rawId: 'credential-id-1',
            response: { clientDataJSON: 'mock', attestationObject: 'mock' },
            type: 'public-key',
            clientExtensionResults: {},
            transports: ['internal'],
          },
          name: 'Test MacBook',
        },
        { Authorization: `Bearer ${adminToken}` },
      ));

      expect(registerRes.statusCode).toBe(200);
      expect(parse(registerRes).data.success).toBe(true);

      // Verify status and credential
      const admin2 = users.get('admin-1')!;
      expect(admin2.status).toBe('active');
      expect(credentialsByUser.get('admin-1')?.length).toBe(1);
    });

    it('step 5: active admin with passkey logs in — gets requirePasskeyVerification', async () => {
      const admin = seedAdmin();
      admin.status = 'active';
      admin.passwordHash = 'hashed:MyStr0ng!Pass99';

      // Seed a passkey credential
      const cred = {
        credentialId: 'credential-id-1',
        userId: 'admin-1',
        name: 'Test MacBook',
        publicKey: 'pubkey-base64',
        counter: 0,
        transports: ['internal'],
        aaguid: 'test-aaguid',
        createdAt: '2024-06-01T00:00:00Z',
      };
      passkeyCredentials.set('credential-id-1', cred);
      credentialsByUser.set('admin-1', [cred]);

      const res = await authHandler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', {
        username: 'admin@test.com',
        password: 'MyStr0ng!Pass99',
      }));

      expect(res.statusCode).toBe(200);
      const data = parse(res).data;
      expect(data.requirePasskeyVerification).toBe(true);
      // Token is still issued (for the frontend to hold during step 2)
      expect(data.token).toBeTruthy();
      expect(data.role).toBe('admin');
    });

    it('step 6: admin verifies passkey — gets passkeyToken', async () => {
      const admin = seedAdmin();
      admin.status = 'active';
      admin.passwordHash = 'hashed:MyStr0ng!Pass99';

      const cred = {
        credentialId: 'credential-id-1',
        userId: 'admin-1',
        name: 'Test MacBook',
        publicKey: 'pubkey-base64',
        counter: 0,
        transports: ['internal'],
        aaguid: 'test-aaguid',
        createdAt: '2024-06-01T00:00:00Z',
      };
      passkeyCredentials.set('credential-id-1', cred);
      credentialsByUser.set('admin-1', [cred]);

      // Get admin passkey challenge
      const challengeRes = await adminAuthHandler(makeEvent(
        API_PATHS.ADMIN_PASSKEY_CHALLENGE,
        'GET',
      ));
      expect(challengeRes.statusCode).toBe(200);
      const { challengeJwt } = parse(challengeRes).data;

      // Verify passkey
      const verifyRes = await adminAuthHandler(makeEvent(
        API_PATHS.ADMIN_PASSKEY_VERIFY,
        'POST',
        {
          challengeJwt,
          assertion: {
            id: 'credential-id-1',
            rawId: 'credential-id-1',
            response: {
              clientDataJSON: 'mock',
              authenticatorData: 'mock',
              signature: 'mock',
            },
            type: 'public-key',
            clientExtensionResults: {},
          },
        },
      ));

      expect(verifyRes.statusCode).toBe(200);
      const verifyData = parse(verifyRes).data;
      expect(verifyData.passkeyToken).toBeTruthy();
      expect(verifyData.username).toBe('admin@test.com');
    });

    it('step 7: admin completes login with passkeyToken + password', async () => {
      const admin = seedAdmin();
      admin.status = 'active';
      admin.passwordHash = 'hashed:MyStr0ng!Pass99';

      const cred = {
        credentialId: 'credential-id-1',
        userId: 'admin-1',
        name: 'Test MacBook',
        publicKey: 'pubkey-base64',
        counter: 0,
        transports: ['internal'],
        aaguid: 'test-aaguid',
        createdAt: '2024-06-01T00:00:00Z',
      };
      passkeyCredentials.set('credential-id-1', cred);
      credentialsByUser.set('admin-1', [cred]);

      // Get challenge + verify passkey → passkeyToken
      const challengeRes = await adminAuthHandler(makeEvent(API_PATHS.ADMIN_PASSKEY_CHALLENGE, 'GET'));
      const { challengeJwt } = parse(challengeRes).data;

      const verifyRes = await adminAuthHandler(makeEvent(
        API_PATHS.ADMIN_PASSKEY_VERIFY,
        'POST',
        {
          challengeJwt,
          assertion: {
            id: 'credential-id-1',
            rawId: 'credential-id-1',
            response: { clientDataJSON: 'mock', authenticatorData: 'mock', signature: 'mock' },
            type: 'public-key',
            clientExtensionResults: {},
          },
        },
      ));
      const { passkeyToken } = parse(verifyRes).data;

      // Final admin login with passkeyToken + password
      const loginRes = await adminAuthHandler(makeEvent(
        API_PATHS.ADMIN_LOGIN,
        'POST',
        { passkeyToken, password: 'MyStr0ng!Pass99' },
      ));

      expect(loginRes.statusCode).toBe(200);
      const data = parse(loginRes).data;
      expect(data.token).toBeTruthy();
      expect(data.role).toBe('admin');
      expect(data.username).toBe('admin@test.com');
      // No further verification needed
      expect(data.requirePasskeyVerification).toBeUndefined();
      expect(data.requirePasswordChange).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('admin without passkeys does not get requirePasskeyVerification', async () => {
      const admin = seedAdmin();
      admin.status = 'active';
      admin.passwordHash = 'hashed:MyStr0ng!Pass99';
      // No passkey credentials seeded

      const res = await authHandler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', {
        username: 'admin@test.com',
        password: 'MyStr0ng!Pass99',
      }));

      expect(res.statusCode).toBe(200);
      const data = parse(res).data;
      expect(data.requirePasskeyVerification).toBeUndefined();
    });

    it('admin login fails with wrong password in step 7', async () => {
      const admin = seedAdmin();
      admin.status = 'active';
      admin.passwordHash = 'hashed:MyStr0ng!Pass99';

      const cred = {
        credentialId: 'credential-id-1',
        userId: 'admin-1',
        name: 'Test MacBook',
        publicKey: 'pubkey-base64',
        counter: 0,
        transports: ['internal'],
        aaguid: 'test-aaguid',
        createdAt: '2024-06-01T00:00:00Z',
      };
      passkeyCredentials.set('credential-id-1', cred);
      credentialsByUser.set('admin-1', [cred]);

      // Get passkeyToken
      const challengeRes = await adminAuthHandler(makeEvent(API_PATHS.ADMIN_PASSKEY_CHALLENGE, 'GET'));
      const { challengeJwt } = parse(challengeRes).data;
      const verifyRes = await adminAuthHandler(makeEvent(
        API_PATHS.ADMIN_PASSKEY_VERIFY,
        'POST',
        {
          challengeJwt,
          assertion: {
            id: 'credential-id-1',
            rawId: 'credential-id-1',
            response: { clientDataJSON: 'mock', authenticatorData: 'mock', signature: 'mock' },
            type: 'public-key',
            clientExtensionResults: {},
          },
        },
      ));
      const { passkeyToken } = parse(verifyRes).data;

      // Admin login with wrong password
      const loginRes = await adminAuthHandler(makeEvent(
        API_PATHS.ADMIN_LOGIN,
        'POST',
        { passkeyToken, password: 'WrongPassword123!' },
      ));

      expect(loginRes.statusCode).toBe(401);
      expect(parse(loginRes).error).toBe(ERRORS.INVALID_CREDENTIALS);
    });

    it('regular user with passkey is still blocked from password login', async () => {
      const user = {
        userId: 'user-1',
        username: 'alice@test.com',
        passwordHash: 'hashed:UserPass123!',
        oneTimePasswordHash: null,
        role: 'user',
        status: 'active',
        encryptionSalt: 'salt==',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastLoginAt: null,
        createdBy: 'admin-1',
        failedLoginAttempts: 0,
        lockedUntil: null,
        plan: 'free',
        otpExpiresAt: null,
      };
      users.set('user-1', user);
      usersByUsername.set('alice@test.com', user);

      const cred = {
        credentialId: 'user-cred-1',
        userId: 'user-1',
        name: 'User Key',
        publicKey: 'pubkey',
        counter: 0,
        transports: null,
        aaguid: 'aaguid',
        createdAt: '2024-01-01T00:00:00Z',
      };
      passkeyCredentials.set('user-cred-1', cred);
      credentialsByUser.set('user-1', [cred]);

      const res = await authHandler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', {
        username: 'alice@test.com',
        password: 'UserPass123!',
      }));

      expect(res.statusCode).toBe(401);
      expect(parse(res).error).toBe(ERRORS.INVALID_PASSKEY);
    });

    it('passkeyRequired=false (dev) — admin logs in without passkey step', async () => {
      config.features.passkeyRequired = false;

      const admin = seedAdmin();
      admin.status = 'active';
      admin.passwordHash = 'hashed:MyStr0ng!Pass99';

      const cred = {
        credentialId: 'credential-id-1',
        userId: 'admin-1',
        name: 'Test MacBook',
        publicKey: 'pubkey-base64',
        counter: 0,
        transports: ['internal'],
        aaguid: 'test-aaguid',
        createdAt: '2024-06-01T00:00:00Z',
      };
      passkeyCredentials.set('credential-id-1', cred);
      credentialsByUser.set('admin-1', [cred]);

      const res = await authHandler(makeEvent(API_PATHS.AUTH_LOGIN, 'POST', {
        username: 'admin@test.com',
        password: 'MyStr0ng!Pass99',
      }));

      expect(res.statusCode).toBe(200);
      const data = parse(res).data;
      expect(data.requirePasskeyVerification).toBeUndefined();
      expect(data.token).toBeTruthy();
    });
  });
});
