/**
 * Digest Lambda — runs daily at 01:00 UTC via EventBridge.
 *
 * For each user with notification preferences set:
 *   - failedLoginDigest: queries login-events for failures in the relevant window,
 *     sends a summary email if any found.
 *   - vaultBackup: downloads the user's first vault from S3 and emails it as an
 *     attachment.
 *
 * Both checks honour the `lastDigestSentAt` / `lastBackupSentAt` fields on the
 * user record to avoid duplicate sends within the same frequency window.
 */

import { listAllUsers, listVaultsByUser, updateUser } from '../utils/dynamodb.js';
import { sendEmail, sendEmailWithAttachment } from '../utils/ses.js';
import { getVaultIndexFile, getVaultItemsFile } from '../utils/s3.js';
import { DYNAMODB_TABLE, FILES_BUCKET, LOGIN_EVENTS_TABLE } from '../config.js';
import type { User } from '@passvault/shared';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function windowMs(freq: string): number {
  switch (freq) {
    case 'daily':   return 24 * 60 * 60 * 1000;
    case 'weekly':  return 7 * 24 * 60 * 60 * 1000;
    case 'monthly': return 30 * 24 * 60 * 60 * 1000;
    default:        return Infinity;
  }
}

function isDue(lastSentAt: string | null | undefined, freq: string): boolean {
  if (!lastSentAt) return true;
  return Date.now() - new Date(lastSentAt).getTime() >= windowMs(freq);
}

async function getFailedLoginsSince(userId: string, since: string): Promise<number> {
  let count = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: LOGIN_EVENTS_TABLE,
        FilterExpression: 'userId = :uid AND #ts >= :since AND #ok = :false',
        ExpressionAttributeNames: { '#ts': 'timestamp', '#ok': 'success' },
        ExpressionAttributeValues: { ':uid': userId, ':since': since, ':false': false },
        Select: 'COUNT',
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      }),
    );
    count += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return count;
}

async function processFailedLoginDigest(user: User, now: Date): Promise<void> {
  const freq = user.notificationPrefs?.failedLoginDigest;
  if (!freq || freq === 'none') return;
  if (!isDue(user.lastDigestSentAt, freq)) return;

  const since = new Date(now.getTime() - windowMs(freq)).toISOString();
  const count = await getFailedLoginsSince(user.userId, since);
  if (count === 0) return;

  const period = freq === 'daily' ? 'last 24 hours' : freq === 'weekly' ? 'last 7 days' : 'last 30 days';
  await sendEmail(
    user.username,
    `PassVault: ${count} failed login attempt${count === 1 ? '' : 's'} detected`,
    `Hello,\n\nWe detected ${count} failed login attempt${count === 1 ? '' : 's'} on your PassVault account (${user.username}) in the ${period}.\n\nIf these were not you, please contact your administrator immediately.\n\n— The PassVault Team`,
  );
  await updateUser(user.userId, { lastDigestSentAt: now.toISOString() });
}

async function processVaultBackup(user: User, now: Date): Promise<void> {
  const freq = user.notificationPrefs?.vaultBackup;
  if (!freq || freq === 'none' || freq === 'on_save') return;
  if (!isDue(user.lastBackupSentAt, freq)) return;

  const vaults = await listVaultsByUser(user.userId);
  if (vaults.length === 0) return;

  // Send the first vault as backup (most users have only one)
  const vault = vaults[0];
  const [indexFile, itemsFile] = await Promise.all([
    getVaultIndexFile(vault.vaultId),
    getVaultItemsFile(vault.vaultId),
  ]);
  if (indexFile === null && itemsFile === null) return;
  const content = JSON.stringify({
    encryptedIndex: indexFile?.content || '',
    encryptedItems: itemsFile?.content || '',
  });

  const date = now.toISOString().slice(0, 10);
  const safeName = vault.displayName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `passvault-${safeName}-${date}.json`;

  await sendEmailWithAttachment(
    user.username,
    `PassVault: Vault backup — ${vault.displayName} (${date})`,
    `Hello,\n\nPlease find your encrypted vault backup attached.\n\nThis file is encrypted with your master password and is safe to store.\n\n— The PassVault Team`,
    { filename, content, contentType: 'application/json' },
  );
  await updateUser(user.userId, { lastBackupSentAt: now.toISOString() });
}

export async function handler(): Promise<void> {
  if (!process.env.SENDER_EMAIL) {
    console.log('SENDER_EMAIL not set — skipping digest run');
    return;
  }

  const now = new Date();
  const users = await listAllUsers();

  const tasks = users
    .filter(u => u.status === 'active' && u.notificationPrefs)
    .flatMap(u => [
      processFailedLoginDigest(u, now).catch(err =>
        console.error(`Digest failed for user ${u.userId}:`, err),
      ),
      processVaultBackup(u, now).catch(err =>
        console.error(`Vault backup failed for user ${u.userId}:`, err),
      ),
    ]);

  await Promise.allSettled(tasks);
  console.log(`Digest run complete. Processed ${users.length} users.`);
}
