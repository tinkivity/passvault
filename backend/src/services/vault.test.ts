import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERRORS, LIMITS } from '@passvault/shared';

vi.mock('../utils/s3.js', () => ({
  getVaultFile: vi.fn(),
  putVaultFile: vi.fn().mockResolvedValue('2024-06-01T12:00:00.000Z'),
  getVaultFileSize: vi.fn(),
}));

vi.mock('../utils/dynamodb.js', () => ({
  getUserById: vi.fn(),
}));

import { getVault, putVault, downloadVault } from './vault.js';
import { getVaultFile, putVaultFile } from '../utils/s3.js';
import { getUserById } from '../utils/dynamodb.js';
import type { User } from '@passvault/shared';

const mockGetFile = vi.mocked(getVaultFile);
const mockPutFile = vi.mocked(putVaultFile);
const mockGetUser = vi.mocked(getUserById);

function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: 'user-1',
    username: 'alice',
    passwordHash: '$2b$12$hash',
    oneTimePasswordHash: null,
    role: 'user',
    status: 'active',
    totpSecret: null,
    totpEnabled: false,
    encryptionSalt: 'base64salt==',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastLoginAt: null,
    createdBy: 'admin-1',
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  };
}

// ── getVault() ────────────────────────────────────────────────────────────────

describe('getVault', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty content when no file exists', async () => {
    mockGetFile.mockResolvedValue(null);
    const result = await getVault('user-1');
    expect(result.response?.encryptedContent).toBe('');
    expect(result.error).toBeUndefined();
  });

  it('returns file content when the file exists', async () => {
    mockGetFile.mockResolvedValue({
      content: 'encrypted-blob',
      lastModified: '2024-06-01T12:00:00.000Z',
    });
    const result = await getVault('user-1');
    expect(result.response?.encryptedContent).toBe('encrypted-blob');
    expect(result.response?.lastModified).toBe('2024-06-01T12:00:00.000Z');
  });
});

// ── putVault() ────────────────────────────────────────────────────────────────

describe('putVault', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when the content exceeds the maximum size', async () => {
    const oversized = 'x'.repeat(LIMITS.MAX_FILE_SIZE_BYTES + 1);
    const result = await putVault('user-1', { encryptedContent: oversized });
    expect(result.error).toBe(ERRORS.FILE_TOO_LARGE);
    expect(result.statusCode).toBe(400);
    expect(mockPutFile).not.toHaveBeenCalled();
  });

  it('stores the content and returns lastModified on success', async () => {
    const result = await putVault('user-1', { encryptedContent: 'valid-encrypted-blob' });
    expect(result.error).toBeUndefined();
    expect(result.response?.success).toBe(true);
    expect(result.response?.lastModified).toBe('2024-06-01T12:00:00.000Z');
    expect(mockPutFile).toHaveBeenCalledWith('user-1', 'valid-encrypted-blob');
  });

  it('accepts an empty string (wiping vault)', async () => {
    const result = await putVault('user-1', { encryptedContent: '' });
    expect(result.error).toBeUndefined();
    expect(mockPutFile).toHaveBeenCalled();
  });
});

// ── downloadVault() ───────────────────────────────────────────────────────────

describe('downloadVault', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when user does not exist', async () => {
    mockGetUser.mockResolvedValue(null);
    const result = await downloadVault('unknown-id');
    expect(result.error).toBe(ERRORS.NOT_FOUND);
    expect(result.statusCode).toBe(404);
  });

  it('returns full metadata and empty content when file does not exist', async () => {
    mockGetUser.mockResolvedValue(makeUser());
    mockGetFile.mockResolvedValue(null);
    const result = await downloadVault('user-1');
    expect(result.error).toBeUndefined();
    expect(result.response?.encryptedContent).toBe('');
    expect(result.response?.encryptionSalt).toBe('base64salt==');
    expect(result.response?.username).toBe('alice');
    expect(result.response?.algorithm).toBeDefined();
    expect(result.response?.parameters).toBeDefined();
  });

  it('returns file content when file exists', async () => {
    mockGetUser.mockResolvedValue(makeUser());
    mockGetFile.mockResolvedValue({
      content: 'encrypted-data',
      lastModified: '2024-06-01T12:00:00.000Z',
    });
    const result = await downloadVault('user-1');
    expect(result.response?.encryptedContent).toBe('encrypted-data');
    expect(result.response?.lastModified).toBe('2024-06-01T12:00:00.000Z');
  });

  it('includes correct Argon2 and AES parameters in download metadata', async () => {
    mockGetUser.mockResolvedValue(makeUser());
    mockGetFile.mockResolvedValue(null);
    const result = await downloadVault('user-1');
    const params = result.response?.parameters;
    expect(params?.argon2.memory).toBe(65536);
    expect(params?.argon2.iterations).toBe(3);
    expect(params?.aes.keySize).toBe(256);
  });
});
