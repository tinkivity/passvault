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
  type VaultPutRequest,
  type VaultPutResponse,
  type VaultDownloadResponse,
  type VaultSummary,
  type CreateVaultRequest,
  type WarningCodeDefinition,
} from '@passvault/shared';

import { getVaultFile, putVaultFile, deleteVaultFile, getLegacyVaultFile, migrateLegacyVaultFile } from '../utils/s3.js';
import { getUserById, createVaultRecord, getVaultRecord, listVaultsByUser, deleteVaultRecord, updateVaultDisplayName } from '../utils/dynamodb.js';
import { sendEmailWithAttachment } from '../utils/ses.js';

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
];

async function ensureMigrated(userId: string, vault: { vaultId: string; userId: string; displayName: string; createdAt: string }): Promise<void> {
  // If new key already exists, nothing to do.
  const existing = await getVaultFile(vault.vaultId);
  if (existing !== null) return;

  // Check for legacy key.
  const legacy = await getLegacyVaultFile(userId);
  if (legacy !== null) {
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
  await putVaultFile(vaultId, '');

  const vault: VaultSummary = {
    vaultId,
    displayName: request.displayName,
    createdAt: new Date().toISOString(),
    encryptionSalt,
  };
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

  await deleteVaultFile(vaultId);
  await deleteVaultRecord(vaultId);
  return { response: { success: true } };
}

export async function getVault(userId: string, vaultId: string): Promise<{ response?: VaultGetResponse; error?: string; statusCode?: number }> {
  const vault = await getVaultRecord(vaultId);
  if (!vault || vault.userId !== userId) {
    return { error: ERRORS.VAULT_NOT_FOUND, statusCode: 404 };
  }

  // Auto-migrate legacy S3 key if needed
  await ensureMigrated(userId, vault);

  const file = await getVaultFile(vaultId);
  return {
    response: {
      encryptedContent: file?.content || '',
      lastModified: file?.lastModified || new Date().toISOString(),
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

  const contentSize = Buffer.byteLength(request.encryptedContent, 'utf-8');
  if (contentSize > LIMITS.MAX_FILE_SIZE_BYTES) {
    return { error: ERRORS.FILE_TOO_LARGE, statusCode: 400 };
  }

  const lastModified = await putVaultFile(vaultId, request.encryptedContent);

  // Fire-and-forget vault backup email if user has on_save preference
  const user = await getUserById(userId);
  if (user?.notificationPrefs?.vaultBackup === 'on_save') {
    sendVaultEmail(userId, vaultId).catch(err => {
      console.error('Failed to send on_save vault backup email:', err);
    });
  }

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
  const file = await getVaultFile(vaultId);

  return {
    response: {
      encryptedContent: file?.content || '',
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
      lastModified: file?.lastModified || new Date().toISOString(),
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
  return { response: { ...vault, displayName: displayName.trim() } };
}

export async function getWarningCodes(): Promise<{ response?: WarningCodeDefinition[]; error?: string; statusCode?: number }> {
  return { response: WARNING_CODE_CATALOG };
}
