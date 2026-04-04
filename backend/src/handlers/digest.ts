/**
 * Digest Lambda — runs daily at 01:00 UTC via EventBridge.
 *
 * For each user with notification preferences set:
 *   - vaultBackup: downloads the user's first vault from S3 and emails it as an
 *     attachment (weekly or monthly).
 *
 * Checks honour the `lastBackupSentAt` field on the user record to avoid
 * duplicate sends within the same frequency window.
 */

import { listAllUsers, listVaultsByUser, updateUser } from '../utils/dynamodb.js';
import { sendEmailWithAttachment } from '../utils/ses.js';
import { getVaultFile } from '../utils/s3.js';
import type { User } from '@passvault/shared';

function windowMs(freq: string): number {
  switch (freq) {
    case 'weekly':  return 7 * 24 * 60 * 60 * 1000;
    case 'monthly': return 30 * 24 * 60 * 60 * 1000;
    default:        return Infinity;
  }
}

function isDue(lastSentAt: string | null | undefined, freq: string): boolean {
  if (!lastSentAt) return true;
  return Date.now() - new Date(lastSentAt).getTime() >= windowMs(freq);
}

async function processVaultBackup(user: User, now: Date): Promise<void> {
  const freq = user.notificationPrefs?.vaultBackup;
  if (!freq || freq === 'none') return;
  if (!isDue(user.lastBackupSentAt, freq)) return;

  const vaults = await listVaultsByUser(user.userId);
  if (vaults.length === 0) return;

  // Send the first vault as backup (most users have only one)
  const vault = vaults[0];
  const vaultFile = await getVaultFile(vault.vaultId);
  if (vaultFile === null) return;
  const content = vaultFile.content;

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
    .map(u =>
      processVaultBackup(u, now).catch(err =>
        console.error(`Vault backup failed for user ${u.userId}:`, err),
      ),
    );

  await Promise.allSettled(tasks);
  console.log(`Digest run complete. Processed ${users.length} users.`);
}
