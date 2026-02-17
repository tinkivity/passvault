import {
  ERRORS,
  LIMITS,
  ARGON2_PARAMS,
  AES_PARAMS,
  ENCRYPTION_ALGORITHM,
  type VaultGetResponse,
  type VaultPutRequest,
  type VaultPutResponse,
  type VaultDownloadResponse,
} from '@passvault/shared';
import { getVaultFile, putVaultFile } from '../utils/s3.js';
import { getUserById } from '../utils/dynamodb.js';

export async function getVault(userId: string): Promise<{ response?: VaultGetResponse; error?: string; statusCode?: number }> {
  const file = await getVaultFile(userId);
  if (!file) {
    return {
      response: {
        encryptedContent: '',
        lastModified: new Date().toISOString(),
      },
    };
  }
  return {
    response: {
      encryptedContent: file.content,
      lastModified: file.lastModified,
    },
  };
}

export async function putVault(
  userId: string,
  request: VaultPutRequest,
): Promise<{ response?: VaultPutResponse; error?: string; statusCode?: number }> {
  // Validate file size
  const contentSize = Buffer.byteLength(request.encryptedContent, 'utf-8');
  if (contentSize > LIMITS.MAX_FILE_SIZE_BYTES) {
    return { error: ERRORS.FILE_TOO_LARGE, statusCode: 400 };
  }

  const lastModified = await putVaultFile(userId, request.encryptedContent);
  return {
    response: {
      success: true,
      lastModified,
    },
  };
}

export async function downloadVault(
  userId: string,
): Promise<{ response?: VaultDownloadResponse; error?: string; statusCode?: number }> {
  const user = await getUserById(userId);
  if (!user) {
    return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  }

  const file = await getVaultFile(userId);

  return {
    response: {
      encryptedContent: file?.content || '',
      encryptionSalt: user.encryptionSalt,
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
          ivSize: AES_PARAMS.ivLength * 8, // bytes to bits
          tagSize: AES_PARAMS.tagLength,
        },
      },
      lastModified: file?.lastModified || new Date().toISOString(),
      username: user.username,
    },
  };
}
