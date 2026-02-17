import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { FILES_BUCKET, CONFIG_BUCKET } from '../config.js';

const s3 = new S3Client({});

export async function getVaultFile(userId: string): Promise<{ content: string; lastModified: string } | null> {
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

export async function putVaultFile(userId: string, encryptedContent: string): Promise<string> {
  const now = new Date().toISOString();
  await s3.send(
    new PutObjectCommand({
      Bucket: FILES_BUCKET,
      Key: `user-${userId}.enc`,
      Body: encryptedContent,
      ContentType: 'application/octet-stream',
    }),
  );
  return now;
}

export async function getAdminPassword(): Promise<string | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: CONFIG_BUCKET,
        Key: 'admin-initial-password.txt',
      }),
    );
    const content = (await result.Body?.transformToString()) || '';
    return content.trim();
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null;
    throw err;
  }
}
