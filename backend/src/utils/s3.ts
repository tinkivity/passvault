import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { FILES_BUCKET } from '../config.js';

const s3 = new S3Client({});

// Split key format: vault-{vaultId}-index.enc + vault-{vaultId}-items.enc
// Legacy format (pre-migration): user-{userId}.enc

async function getS3File(key: string): Promise<{ content: string; lastModified: string } | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: FILES_BUCKET, Key: key }),
    );
    const content = (await result.Body?.transformToString()) || '';
    const lastModified = result.LastModified?.toISOString() || new Date().toISOString();
    return { content, lastModified };
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null;
    throw err;
  }
}

async function putS3File(key: string, body: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: FILES_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/octet-stream',
    }),
  );
}

async function deleteS3File(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: FILES_BUCKET, Key: key }),
  );
}

async function headS3File(key: string): Promise<number | null> {
  try {
    const result = await s3.send(
      new HeadObjectCommand({ Bucket: FILES_BUCKET, Key: key }),
    );
    return result.ContentLength ?? null;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NotFound') return null;
    throw err;
  }
}

// ── Split vault files ─────────────────────────────────────────────────────────

export async function getVaultIndexFile(vaultId: string): Promise<{ content: string; lastModified: string } | null> {
  return getS3File(`vault-${vaultId}-index.enc`);
}

export async function getVaultItemsFile(vaultId: string): Promise<{ content: string; lastModified: string } | null> {
  return getS3File(`vault-${vaultId}-items.enc`);
}

export async function putVaultSplitFiles(vaultId: string, encryptedIndex: string, encryptedItems: string): Promise<string> {
  const now = new Date().toISOString();
  await Promise.all([
    putS3File(`vault-${vaultId}-index.enc`, encryptedIndex),
    putS3File(`vault-${vaultId}-items.enc`, encryptedItems),
  ]);
  return now;
}

export async function deleteVaultSplitFiles(vaultId: string): Promise<void> {
  await Promise.all([
    deleteS3File(`vault-${vaultId}-index.enc`),
    deleteS3File(`vault-${vaultId}-items.enc`),
  ]);
}

export async function getVaultFileSize(vaultId: string): Promise<number | null> {
  const [indexSize, itemsSize] = await Promise.all([
    headS3File(`vault-${vaultId}-index.enc`),
    headS3File(`vault-${vaultId}-items.enc`),
  ]);
  if (indexSize === null && itemsSize === null) return null;
  return (indexSize ?? 0) + (itemsSize ?? 0);
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
