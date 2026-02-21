import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the SSM fetch in config so tests don't need real AWS credentials
vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  return {
    ...actual,
    getJwtSecret: vi.fn().mockResolvedValue('test-secret-that-is-long-enough-for-hs256'),
  };
});

import { signToken, verifyToken } from './jwt.js';
import { getJwtSecret } from '../config.js';

const mockGetJwtSecret = vi.mocked(getJwtSecret);

const basePayload = {
  userId: 'user-123',
  username: 'testuser',
  role: 'user' as const,
  status: 'active' as const,
};

describe('signToken / verifyToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJwtSecret.mockResolvedValue('test-secret-that-is-long-enough-for-hs256');
  });

  it('signs and verifies a user token round-trip', async () => {
    const token = await signToken(basePayload);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT structure

    const decoded = await verifyToken(token);
    expect(decoded.userId).toBe(basePayload.userId);
    expect(decoded.username).toBe(basePayload.username);
    expect(decoded.role).toBe(basePayload.role);
    expect(decoded.status).toBe(basePayload.status);
  });

  it('signs and verifies an admin token round-trip', async () => {
    const adminPayload = { ...basePayload, role: 'admin' as const };
    const token = await signToken(adminPayload);
    const decoded = await verifyToken(token);
    expect(decoded.role).toBe('admin');
  });

  it('throws when verifying a token signed with a different secret', async () => {
    const token = await signToken(basePayload);

    // Switch secret for verification
    mockGetJwtSecret.mockResolvedValueOnce('completely-different-secret-value-x');

    await expect(verifyToken(token)).rejects.toThrow();
  });

  it('throws when verifying a tampered token', async () => {
    const token = await signToken(basePayload);
    const parts = token.split('.');
    // Corrupt the payload segment
    const tampered = `${parts[0]}.${parts[1]}x.${parts[2]}`;
    await expect(verifyToken(tampered)).rejects.toThrow();
  });

  it('fetches the secret via getJwtSecret on each call (caching delegated to config)', async () => {
    await signToken(basePayload);
    await verifyToken(await signToken(basePayload));
    // signToken called twice, verifyToken called once — getJwtSecret called 3 times
    expect(mockGetJwtSecret).toHaveBeenCalledTimes(3);
  });
});

describe('getJwtSecret (config)', () => {
  it('throws if JWT_SECRET_PARAM env var is missing', async () => {
    // Restore the real implementation for this test only
    const { getJwtSecret: realGetJwtSecret } = await vi.importActual<typeof import('../config.js')>('../config.js');
    const originalParam = process.env.JWT_SECRET_PARAM;
    delete process.env.JWT_SECRET_PARAM;
    await expect(realGetJwtSecret()).rejects.toThrow('JWT_SECRET_PARAM env var is required');
    if (originalParam !== undefined) process.env.JWT_SECRET_PARAM = originalParam;
  });
});
