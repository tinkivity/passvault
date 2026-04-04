import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import {
  ERRORS,
  LIMITS,
  ARGON2_PARAMS,
  AES_PARAMS,
  ENCRYPTION_ALGORITHM,
  SALT_LENGTH,
  type VaultGetResponse,
  type VaultGetIndexResponse,
  type VaultGetItemsResponse,
  type VaultPutRequest,
  type VaultPutResponse,
  type VaultDownloadResponse,
  type VaultSummary,
  type CreateVaultRequest,
  type WarningCodeDefinition,
} from '@passvault/shared';

import { getVaultIndexFile, getVaultItemsFile, putVaultSplitFiles, deleteVaultSplitFiles, getLegacyVaultFile, migrateLegacyVaultFile } from '../utils/s3.js';
import { getUserById, createVaultRecord, getVaultRecord, listVaultsByUser, deleteVaultRecord, updateVaultDisplayName } from '../utils/dynamodb.js';
import { sendEmailWithAttachment } from '../utils/ses.js';
import { recordAuditEvent } from '../utils/audit.js';

// Hardcoded warning code catalog — returned by GET /api/config/warning-codes.
// Stored in DynamoDB only if extended; for now served statically.
const WARNING_CODE_CATALOG: WarningCodeDefinition[] = [
  {
    code: 'duplicate_password',
    label: 'Duplicate Password',
    description: 'This password is used by another item in your vault.',
    severity: 'warning',
  },
  {
    code: 'too_simple_password',
    label: 'Password Too Simple',
    description: 'This password does not meet the minimum security requirements.',
    severity: 'warning',
  },
  {
    code: 'breached_password',
    label: 'Breached Password',
    description: 'This password has appeared in a known data breach',
    severity: 'critical',
  },
];

async function ensureMigrated(userId: string, vault: { vaultId: string; userId: string; displayName: string; createdAt: string }): Promise<void> {
  // If split index key already exists, nothing to do.
  const existing = await getVaultIndexFile(vault.vaultId);
  if (existing !== null) return;

  // Check for legacy key — migrate to split format (store the single blob as items, empty index).
  const legacy = await getLegacyVaultFile(userId);
  if (legacy !== null) {
    // Migrate: old single blob becomes items file, empty index.
    // The legacy file contains encrypted content that the frontend will re-save in split format.
    await putVaultSplitFiles(vault.vaultId, '', legacy.content);
    await migrateLegacyVaultFile(userId, vault.vaultId);
  }
}

export async function listVaults(userId: string): Promise<{ response?: VaultSummary[]; error?: string; statusCode?: number }> {
  const vaults = await listVaultsByUser(userId);
  return { response: vaults };
}

export async function createVault(
  userId: string,
  request: CreateVaultRequest,
): Promise<{ response?: VaultSummary; error?: string; statusCode?: number }> {
  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };

  const planLimit = LIMITS.VAULT_LIMITS[user.plan] ?? 1;
  const existing = await listVaultsByUser(userId);
  if (existing.length >= planLimit) {
    return { error: ERRORS.VAULT_LIMIT_REACHED, statusCode: 403 };
  }

  const vaultId = uuidv4();
  const encryptionSalt = randomBytes(SALT_LENGTH).toString('base64');
  await createVaultRecord(vaultId, userId, request.displayName, encryptionSalt);
  await putVaultSplitFiles(vaultId, '', '');

  const vault: VaultSummary = {
    vaultId,
    displayName: request.displayName,
    createdAt: new Date().toISOString(),
    encryptionSalt,
  };

  recordAuditEvent({
    category: 'vault_operations',
    action: 'vault_created',
    userId,
    details: { vaultId, displayName: request.displayName },
  }).catch(err => console.error('Failed to record audit event:', err));

  return { response: vault };
}

export async function deleteVault(
  userId: string,
  vaultId: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  const vault = await getVaultRecord(vaultId);
  if (!vault || vault.userId !== userId) {
    return { error: ERRORS.VAULT_NOT_FOUND, statusCode: 404 };
  }

  const existing = await listVaultsByUser(userId);
  if (existing.length <= 1) {
    return { error: ERRORS.CANNOT_DELETE_LAST_VAULT, statusCode: 400 };
  }

  await deleteVaultSplitFiles(vaultId);
  await deleteVaultRecord(vaultId);

  recordAuditEvent({
    category: 'vault_operations',
    action: 'vault_deleted',
    userId,
    details: { vaultId },
  }).catch(err => console.error('Failed to record audit event:', err));

  return { response: { success: true } };
}

export async function getVault(userId: string, vaultId: string): Promise<{ response?: VaultGetResponse; error?: string; statusCode?: number }> {
  const vault = await getVaultRecord(vaultId);
  if (!vault || vault.userId !== userId) {
    return { error: ERRORS.VAULT_NOT_FOUND, statusCode: 404 };
  }

  // Auto-migrate legacy S3 key if needed
  await ensureMigrated(userId, vault);

  const [indexFile, itemsFile] = await Promise.all([
    getVaultIndexFile(vaultId),
    getVaultItemsFile(vaultId),
  ]);
  const lastModified = indexFile?.lastModified || itemsFile?.lastModified || new Date().toISOString();
  return {
    response: {
      encryptedIndex: indexFile?.content || '',
      encryptedItems: itemsFile?.content || '',
      lastModified,
    },
  };
}

export async function getVaultIndex(userId: string, vaultId: string): Promise<{ response?: VaultGetIndexResponse; error?: string; statusCode?: number }> {
  const vault = await getVaultRecord(vaultId);
  if (!vault || vault.userId !== userId) {
    return { error: ERRORS.VAULT_NOT_FOUND, statusCode: 404 };
  }

  await ensureMigrated(userId, vault);

  const indexFile = await getVaultIndexFile(vaultId);
  return {
    response: {
      encryptedIndex: indexFile?.content || '',
      lastModified: indexFile?.lastModified || new Date().toISOString(),
    },
  };
}

export async function getVaultItems(userId: string, vaultId: string): Promise<{ response?: VaultGetItemsResponse; error?: string; statusCode?: number }> {
  const vault = await getVaultRecord(vaultId);
  if (!vault || vault.userId !== userId) {
    return { error: ERRORS.VAULT_NOT_FOUND, statusCode: 404 };
  }

  await ensureMigrated(userId, vault);

  const itemsFile = await getVaultItemsFile(vaultId);
  return {
    response: {
      encryptedItems: itemsFile?.content || '',
      lastModified: itemsFile?.lastModified || new Date().toISOString(),
    },
  };
}

export async function putVault(
  userId: string,
  vaultId: string,
  request: VaultPutRequest,
): Promise<{ response?: VaultPutResponse; error?: string; statusCode?: number }> {
  const vault = await getVaultRecord(vaultId);
  if (!vault || vault.userId !== userId) {
    return { error: ERRORS.VAULT_NOT_FOUND, statusCode: 404 };
  }

  const contentSize = Buffer.byteLength(request.encryptedIndex, 'utf-8') + Buffer.byteLength(request.encryptedItems, 'utf-8');
  if (contentSize > LIMITS.MAX_FILE_SIZE_BYTES) {
    return { error: ERRORS.FILE_TOO_LARGE, statusCode: 400 };
  }

  const lastModified = await putVaultSplitFiles(vaultId, request.encryptedIndex, request.encryptedItems);

  recordAuditEvent({
    category: 'vault_operations',
    action: 'vault_saved',
    userId,
    details: { vaultId },
  }).catch(err => console.error('Failed to record audit event:', err));

  return {
    response: {
      success: true,
      lastModified,
    },
  };
}

export async function downloadVault(
  userId: string,
  vaultId: string,
): Promise<{ response?: VaultDownloadResponse; error?: string; statusCode?: number }> {
  const user = await getUserById(userId);
  if (!user) {
    return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  }

  const vault = await getVaultRecord(vaultId);
  if (!vault || vault.userId !== userId) {
    return { error: ERRORS.VAULT_NOT_FOUND, statusCode: 404 };
  }

  await ensureMigrated(userId, vault);
  const [indexFile, itemsFile] = await Promise.all([
    getVaultIndexFile(vaultId),
    getVaultItemsFile(vaultId),
  ]);
  const lastModified = indexFile?.lastModified || itemsFile?.lastModified || new Date().toISOString();

  return {
    response: {
      encryptedIndex: indexFile?.content || '',
      encryptedItems: itemsFile?.content || '',
      encryptionSalt: vault.encryptionSalt,
      algorithm: ENCRYPTION_ALGORITHM,
      parameters: {
        argon2: {
          memory: ARGON2_PARAMS.memory,
          iterations: ARGON2_PARAMS.iterations,
          parallelism: ARGON2_PARAMS.parallelism,
          hashLength: ARGON2_PARAMS.hashLength,
        },
        aes: {
          keySize: AES_PARAMS.keyLength,
          ivSize: AES_PARAMS.ivLength * 8,
          tagSize: AES_PARAMS.tagLength,
        },
      },
      lastModified,
      username: user.username,
    },
  };
}

export async function sendVaultEmail(
  userId: string,
  vaultId: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  if (!process.env.SENDER_EMAIL) {
    return { error: 'Email sending is not available in this environment', statusCode: 503 };
  }

  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  // username IS the email
  if (!user.username || !user.username.includes('@')) {
    return { error: ERRORS.NO_EMAIL_ADDRESS, statusCode: 400 };
  }

  const downloadResult = await downloadVault(userId, vaultId);
  if (downloadResult.error || !downloadResult.response) {
    return { error: downloadResult.error || 'Failed to retrieve vault', statusCode: downloadResult.statusCode || 500 };
  }

  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const filename = `passvault-${user.username}-${date}.vault`;

  await sendEmailWithAttachment(
    user.username,
    'Your PassVault encrypted vault export',
    [
      `Your encrypted vault is attached as ${filename}.`,
      ``,
      `Exported:  ${now}`,
      `Username:  ${user.username}`,
    ].join('\n'),
    {
      filename,
      content: JSON.stringify(downloadResult.response, null, 2),
      contentType: 'application/octet-stream',
    },
  );

  return { response: { success: true } };
}

export async function renameVault(
  userId: string,
  vaultId: string,
  displayName: string,
): Promise<{ response?: VaultSummary; error?: string; statusCode?: number }> {
  if (!displayName.trim()) return { error: 'Display name is required', statusCode: 400 };
  const vault = await getVaultRecord(vaultId);
  if (!vault || vault.userId !== userId) {
    return { error: ERRORS.VAULT_NOT_FOUND, statusCode: 404 };
  }
  await updateVaultDisplayName(vaultId, displayName.trim());

  recordAuditEvent({
    category: 'vault_operations',
    action: 'vault_renamed',
    userId,
    details: { vaultId, displayName: displayName.trim() },
  }).catch(err => console.error('Failed to record audit event:', err));

  return { response: { ...vault, displayName: displayName.trim() } };
}

export async function getWarningCodes(): Promise<{ response?: WarningCodeDefinition[]; error?: string; statusCode?: number }> {
  return { response: WARNING_CODE_CATALOG };
}
