import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { FILES_BUCKET } from '../config.js';

const s3 = new S3Client({});

// New key format: vault-{vaultId}.enc
// Legacy format (pre-migration): user-{userId}.enc

export async function getVaultFile(vaultId: string): Promise<{ content: string; lastModified: string } | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: FILES_BUCKET,
        Key: `vault-${vaultId}.enc`,
      }),
    );
    const content = (await result.Body?.transformToString()) || '';
    const lastModified = result.LastModified?.toISOString() || new Date().toISOString();
    return { content, lastModified };
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null;
    throw err;
  }
}

export async function putVaultFile(vaultId: string, encryptedContent: string): Promise<string> {
  const now = new Date().toISOString();
  await s3.send(
    new PutObjectCommand({
      Bucket: FILES_BUCKET,
      Key: `vault-${vaultId}.enc`,
      Body: encryptedContent,
      ContentType: 'application/octet-stream',
    }),
  );
  return now;
}

export async function deleteVaultFile(vaultId: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: FILES_BUCKET,
      Key: `vault-${vaultId}.enc`,
    }),
  );
}

export async function getVaultFileSize(vaultId: string): Promise<number | null> {
  try {
    const result = await s3.send(
      new HeadObjectCommand({
        Bucket: FILES_BUCKET,
        Key: `vault-${vaultId}.enc`,
      }),
    );
    return result.ContentLength ?? null;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NotFound') return null;
    throw err;
  }
}

/** Check if the old user-{userId}.enc key exists (for migration). */
export async function getLegacyVaultFile(userId: string): Promise<{ content: string; lastModified: string } | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: FILES_BUCKET,
        Key: `user-${userId}.enc`,
      }),
    );
    const content = (await result.Body?.transformToString()) || '';
    const lastModified = result.LastModified?.toISOString() || new Date().toISOString();
    return { content, lastModified };
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null;
    throw err;
  }
}

/** Copy legacy user-{userId}.enc to vault-{vaultId}.enc and delete original. */
export async function migrateLegacyVaultFile(userId: string, vaultId: string): Promise<void> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: FILES_BUCKET,
      CopySource: `${FILES_BUCKET}/user-${userId}.enc`,
      Key: `vault-${vaultId}.enc`,
    }),
  );
  await s3.send(
    new DeleteObjectCommand({
      Bucket: FILES_BUCKET,
      Key: `user-${userId}.enc`,
    }),
  );
}

/** Delete legacy vault file (for user deletion before migration). */
export async function deleteLegacyVaultFile(userId: string): Promise<void> {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: FILES_BUCKET,
        Key: `user-${userId}.enc`,
      }),
    );
  } catch {
    // ignore if not found
  }
}
