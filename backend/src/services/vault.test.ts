import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ERRORS, LIMITS } from '@passvault/shared';

vi.mock('../utils/s3.js', () => ({
  getVaultIndexFile: vi.fn(),
  getVaultItemsFile: vi.fn(),
  putVaultSplitFiles: vi.fn().mockResolvedValue('2024-06-01T12:00:00.000Z'),
  getVaultFileSize: vi.fn(),
  getLegacyVaultFile: vi.fn().mockResolvedValue(null),
  migrateLegacyVaultFile: vi.fn().mockResolvedValue(undefined),
  deleteVaultSplitFiles: vi.fn().mockResolvedValue(undefined),
  deleteLegacyVaultFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/dynamodb.js', () => ({
  getUserById: vi.fn(),
  getVaultRecord: vi.fn(),
  listVaultsByUser: vi.fn().mockResolvedValue([]),
  createVaultRecord: vi.fn().mockResolvedValue(undefined),
  deleteVaultRecord: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/ses.js', () => ({
  sendEmailWithAttachment: vi.fn().mockResolvedValue(undefined),
}));

import { getVault, getVaultIndex, getVaultItems, putVault, downloadVault, sendVaultEmail, createVault, deleteVault } from './vault.js';
import { getVaultIndexFile, getVaultItemsFile, putVaultSplitFiles } from '../utils/s3.js';
import { getUserById, getVaultRecord, listVaultsByUser, createVaultRecord } from '../utils/dynamodb.js';
import { sendEmailWithAttachment } from '../utils/ses.js';
import type { User } from '@passvault/shared';

const mockGetIndexFile = vi.mocked(getVaultIndexFile);
const mockGetItemsFile = vi.mocked(getVaultItemsFile);
const mockPutSplitFiles = vi.mocked(putVaultSplitFiles);
const mockGetUser = vi.mocked(getUserById);
const mockGetVaultRecord = vi.mocked(getVaultRecord);
const mockListVaultsByUser = vi.mocked(listVaultsByUser);
const mockCreateVaultRecord = vi.mocked(createVaultRecord);
const mockSendEmailWithAttachment = vi.mocked(sendEmailWithAttachment);

const VAULT_RECORD = { vaultId: 'vault-1', userId: 'user-1', displayName: 'Personal Vault', encryptionSalt: 'vault-salt==', createdAt: '2024-01-01T00:00:00.000Z' };

function makeUser(overrides: Partial<User> = {}): User {
  return {
    userId: 'user-1',
    username: 'alice@example.com',
    passwordHash: '$2b$12$hash',
    oneTimePasswordHash: null,
    role: 'user',
    status: 'active',
    encryptionSalt: 'base64salt==',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastLoginAt: null,
    createdBy: 'admin-1',
    failedLoginAttempts: 0,
    lockedUntil: null,
    plan: 'free' as const,
    otpExpiresAt: null,
    ...overrides,
  };
}

// ── getVault() ────────────────────────────────────────────────────────────────

describe('getVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVaultRecord.mockResolvedValue(VAULT_RECORD);
  });

  it('returns empty content when no files exist', async () => {
    mockGetIndexFile.mockResolvedValue(null);
    mockGetItemsFile.mockResolvedValue(null);
    const result = await getVault('user-1', 'vault-1');
    expect(result.response?.encryptedIndex).toBe('');
    expect(result.response?.encryptedItems).toBe('');
    expect(result.error).toBeUndefined();
  });

  it('returns file content when both files exist', async () => {
    mockGetIndexFile.mockResolvedValue({ content: 'encrypted-index', lastModified: '2024-06-01T12:00:00.000Z' });
    mockGetItemsFile.mockResolvedValue({ content: 'encrypted-items', lastModified: '2024-06-01T12:00:00.000Z' });
    const result = await getVault('user-1', 'vault-1');
    expect(result.response?.encryptedIndex).toBe('encrypted-index');
    expect(result.response?.encryptedItems).toBe('encrypted-items');
    expect(result.response?.lastModified).toBe('2024-06-01T12:00:00.000Z');
  });

  it('returns 404 when vault record not found', async () => {
    mockGetVaultRecord.mockResolvedValue(null);
    const result = await getVault('user-1', 'vault-1');
    expect(result.statusCode).toBe(404);
  });

  it('returns 404 when vault belongs to different user', async () => {
    mockGetVaultRecord.mockResolvedValue({ ...VAULT_RECORD, userId: 'other-user' });
    const result = await getVault('user-1', 'vault-1');
    expect(result.statusCode).toBe(404);
  });
});

// ── getVaultIndex() ──────────────────────────────────────────────────────────

describe('getVaultIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVaultRecord.mockResolvedValue(VAULT_RECORD);
  });

  it('returns encrypted index when file exists', async () => {
    mockGetIndexFile.mockResolvedValue({ content: 'encrypted-index', lastModified: '2024-06-01T12:00:00.000Z' });
    const result = await getVaultIndex('user-1', 'vault-1');
    expect(result.response?.encryptedIndex).toBe('encrypted-index');
    expect(result.response?.lastModified).toBe('2024-06-01T12:00:00.000Z');
  });

  it('returns empty when no index file exists', async () => {
    mockGetIndexFile.mockResolvedValue(null);
    const result = await getVaultIndex('user-1', 'vault-1');
    expect(result.response?.encryptedIndex).toBe('');
  });

  it('returns 404 when vault record not found', async () => {
    mockGetVaultRecord.mockResolvedValue(null);
    const result = await getVaultIndex('user-1', 'vault-1');
    expect(result.statusCode).toBe(404);
  });
});

// ── getVaultItems() ──────────────────────────────────────────────────────────

describe('getVaultItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVaultRecord.mockResolvedValue(VAULT_RECORD);
  });

  it('returns encrypted items when file exists', async () => {
    mockGetItemsFile.mockResolvedValue({ content: 'encrypted-items', lastModified: '2024-06-01T12:00:00.000Z' });
    const result = await getVaultItems('user-1', 'vault-1');
    expect(result.response?.encryptedItems).toBe('encrypted-items');
    expect(result.response?.lastModified).toBe('2024-06-01T12:00:00.000Z');
  });

  it('returns empty when no items file exists', async () => {
    mockGetItemsFile.mockResolvedValue(null);
    const result = await getVaultItems('user-1', 'vault-1');
    expect(result.response?.encryptedItems).toBe('');
  });

  it('returns 404 when vault belongs to different user', async () => {
    mockGetVaultRecord.mockResolvedValue({ ...VAULT_RECORD, userId: 'other-user' });
    const result = await getVaultItems('user-1', 'vault-1');
    expect(result.statusCode).toBe(404);
  });
});

// ── putVault() ────────────────────────────────────────────────────────────────

describe('putVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVaultRecord.mockResolvedValue(VAULT_RECORD);
  });

  it('returns 400 when the combined content exceeds the maximum size', async () => {
    const oversized = 'x'.repeat(LIMITS.MAX_FILE_SIZE_BYTES + 1);
    const result = await putVault('user-1', 'vault-1', { encryptedIndex: oversized, encryptedItems: '' });
    expect(result.error).toBe(ERRORS.FILE_TOO_LARGE);
    expect(result.statusCode).toBe(400);
    expect(mockPutSplitFiles).not.toHaveBeenCalled();
  });

  it('stores both files and returns lastModified on success', async () => {
    const result = await putVault('user-1', 'vault-1', { encryptedIndex: 'idx-blob', encryptedItems: 'items-blob' });
    expect(result.error).toBeUndefined();
    expect(result.response?.success).toBe(true);
    expect(result.response?.lastModified).toBe('2024-06-01T12:00:00.000Z');
    expect(mockPutSplitFiles).toHaveBeenCalledWith('vault-1', 'idx-blob', 'items-blob');
  });

  it('accepts empty strings (wiping vault)', async () => {
    const result = await putVault('user-1', 'vault-1', { encryptedIndex: '', encryptedItems: '' });
    expect(result.error).toBeUndefined();
    expect(mockPutSplitFiles).toHaveBeenCalled();
  });

  it('returns 404 when vault record not found', async () => {
    mockGetVaultRecord.mockResolvedValue(null);
    const result = await putVault('user-1', 'vault-1', { encryptedIndex: 'a', encryptedItems: 'b' });
    expect(result.statusCode).toBe(404);
  });
});

// ── downloadVault() ───────────────────────────────────────────────────────────

describe('downloadVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVaultRecord.mockResolvedValue(VAULT_RECORD);
  });

  it('returns 404 when user does not exist', async () => {
    mockGetUser.mockResolvedValue(null);
    const result = await downloadVault('unknown-id', 'vault-1');
    expect(result.error).toBe(ERRORS.NOT_FOUND);
    expect(result.statusCode).toBe(404);
  });

  it('returns full metadata and empty content when files do not exist', async () => {
    mockGetUser.mockResolvedValue(makeUser());
    mockGetIndexFile.mockResolvedValue(null);
    mockGetItemsFile.mockResolvedValue(null);
    const result = await downloadVault('user-1', 'vault-1');
    expect(result.error).toBeUndefined();
    expect(result.response?.encryptedIndex).toBe('');
    expect(result.response?.encryptedItems).toBe('');
    expect(result.response?.encryptionSalt).toBe('vault-salt==');
    expect(result.response?.username).toBe('alice@example.com');
    expect(result.response?.algorithm).toBeDefined();
    expect(result.response?.parameters).toBeDefined();
  });

  it('returns file content when files exist', async () => {
    mockGetUser.mockResolvedValue(makeUser());
    mockGetIndexFile.mockResolvedValue({ content: 'enc-idx', lastModified: '2024-06-01T12:00:00.000Z' });
    mockGetItemsFile.mockResolvedValue({ content: 'enc-items', lastModified: '2024-06-01T12:00:00.000Z' });
    const result = await downloadVault('user-1', 'vault-1');
    expect(result.response?.encryptedIndex).toBe('enc-idx');
    expect(result.response?.encryptedItems).toBe('enc-items');
    expect(result.response?.lastModified).toBe('2024-06-01T12:00:00.000Z');
  });

  it('includes correct Argon2 and AES parameters in download metadata', async () => {
    mockGetUser.mockResolvedValue(makeUser());
    mockGetIndexFile.mockResolvedValue(null);
    mockGetItemsFile.mockResolvedValue(null);
    const result = await downloadVault('user-1', 'vault-1');
    const params = result.response?.parameters;
    expect(params?.argon2.memory).toBe(65536);
    expect(params?.argon2.iterations).toBe(3);
    expect(params?.aes.keySize).toBe(256);
  });
});

// ── sendVaultEmail() ──────────────────────────────────────────────────────────

describe('sendVaultEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SENDER_EMAIL = 'noreply@example.com';
    mockGetVaultRecord.mockResolvedValue(VAULT_RECORD);
  });

  afterEach(() => {
    delete process.env.SENDER_EMAIL;
  });

  it('returns 503 when SENDER_EMAIL is not set', async () => {
    delete process.env.SENDER_EMAIL;
    const result = await sendVaultEmail('user-1', 'vault-1');
    expect(result.statusCode).toBe(503);
    expect(mockSendEmailWithAttachment).not.toHaveBeenCalled();
  });

  it('returns 404 when user does not exist', async () => {
    mockGetUser.mockResolvedValue(null);
    const result = await sendVaultEmail('user-1', 'vault-1');
    expect(result.statusCode).toBe(404);
    expect(mockSendEmailWithAttachment).not.toHaveBeenCalled();
  });

  it('sends vault as an attachment and returns success', async () => {
    mockGetUser.mockResolvedValue(makeUser({ username: 'alice@example.com' }));
    mockGetIndexFile.mockResolvedValue({ content: 'enc-idx', lastModified: '2024-06-01T12:00:00.000Z' });
    mockGetItemsFile.mockResolvedValue({ content: 'enc-items', lastModified: '2024-06-01T12:00:00.000Z' });
    const result = await sendVaultEmail('user-1', 'vault-1');
    expect(result.response?.success).toBe(true);
    expect(mockSendEmailWithAttachment).toHaveBeenCalledWith(
      'alice@example.com',
      expect.stringContaining('vault'),
      expect.any(String),
      expect.objectContaining({
        filename: expect.stringMatching(/^passvault-alice@example\.com-\d{4}-\d{2}-\d{2}\.vault$/),
        contentType: 'application/octet-stream',
        content: expect.any(String),
      }),
    );
  });
});

// ── createVault() ─────────────────────────────────────────────────────────────

describe('createVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPutSplitFiles.mockResolvedValue('2024-06-01T12:00:00.000Z');
  });

  it('returns 404 when user not found', async () => {
    mockGetUser.mockResolvedValue(null);
    const result = await createVault('unknown', { displayName: 'Work Vault' });
    expect(result.statusCode).toBe(404);
    expect(mockCreateVaultRecord).not.toHaveBeenCalled();
  });

  it('returns 403 when free plan limit (1 vault) is already reached', async () => {
    mockGetUser.mockResolvedValue(makeUser({ plan: 'free' }));
    mockListVaultsByUser.mockResolvedValue([VAULT_RECORD]);
    const result = await createVault('user-1', { displayName: 'Second Vault' });
    expect(result.error).toBe(ERRORS.VAULT_LIMIT_REACHED);
    expect(result.statusCode).toBe(403);
    expect(mockCreateVaultRecord).not.toHaveBeenCalled();
  });

  it('creates a vault for a free user with 0 existing vaults', async () => {
    mockGetUser.mockResolvedValue(makeUser({ plan: 'free' }));
    mockListVaultsByUser.mockResolvedValue([]);
    const result = await createVault('user-1', { displayName: 'Personal Vault' });
    expect(result.error).toBeUndefined();
    expect(result.response?.displayName).toBe('Personal Vault');
    expect(result.response?.vaultId).toBeTruthy();
    expect(result.response?.encryptionSalt).toBeTruthy();
    expect(mockCreateVaultRecord).toHaveBeenCalledWith(expect.any(String), 'user-1', 'Personal Vault', expect.any(String));
  });

  it('allows pro users to create up to 10 vaults', async () => {
    mockGetUser.mockResolvedValue(makeUser({ plan: 'pro' }));
    const nineVaults = Array.from({ length: 9 }, (_, i) => ({ ...VAULT_RECORD, vaultId: `v${i}` }));
    mockListVaultsByUser.mockResolvedValue(nineVaults);
    const result = await createVault('user-1', { displayName: 'Vault 10' });
    expect(result.error).toBeUndefined();
    expect(result.response?.displayName).toBe('Vault 10');
  });

  it('blocks pro users when 10 vaults already exist', async () => {
    mockGetUser.mockResolvedValue(makeUser({ plan: 'pro' }));
    const tenVaults = Array.from({ length: LIMITS.VAULT_LIMITS['pro'] }, (_, i) => ({ ...VAULT_RECORD, vaultId: `v${i}` }));
    mockListVaultsByUser.mockResolvedValue(tenVaults);
    const result = await createVault('user-1', { displayName: 'Too Many' });
    expect(result.statusCode).toBe(403);
  });
});

// ── deleteVault() ─────────────────────────────────────────────────────────────

describe('deleteVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVaultRecord.mockResolvedValue(VAULT_RECORD);
  });

  it('returns 404 when vault not found', async () => {
    mockGetVaultRecord.mockResolvedValue(null);
    const result = await deleteVault('user-1', 'vault-1');
    expect(result.statusCode).toBe(404);
  });

  it('returns 404 when vault belongs to a different user', async () => {
    mockGetVaultRecord.mockResolvedValue({ ...VAULT_RECORD, userId: 'other-user' });
    const result = await deleteVault('user-1', 'vault-1');
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when user only has one vault (cannot delete last)', async () => {
    mockListVaultsByUser.mockResolvedValue([VAULT_RECORD]);
    const result = await deleteVault('user-1', 'vault-1');
    expect(result.error).toBe(ERRORS.CANNOT_DELETE_LAST_VAULT);
    expect(result.statusCode).toBe(400);
  });

  it('deletes vault when user has more than one', async () => {
    mockListVaultsByUser.mockResolvedValue([
      VAULT_RECORD,
      { ...VAULT_RECORD, vaultId: 'vault-2' },
    ]);
    const result = await deleteVault('user-1', 'vault-1');
    expect(result.response?.success).toBe(true);
  });
});
