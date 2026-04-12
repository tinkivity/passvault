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

import { gzipSync } from 'zlib';
import { listAllUsers, listVaultsByUser, updateUser } from '../utils/dynamodb.js';
import { sendEmailWithAttachment } from '../utils/ses.js';
import { renderEmail, resolveGreeting } from '../utils/email-templates.js';
import { resolveLanguage } from '../utils/language.js';
import { signUnsubscribeToken } from '../utils/jwt.js';
import { getVaultIndexFile, getVaultItemsFile } from '../utils/s3.js';
import type { User } from '@passvault/shared';

function windowMs(freq: string): number {
  switch (freq) {
    case 'weekly':    return 7 * 24 * 60 * 60 * 1000;
    case 'monthly':   return 30 * 24 * 60 * 60 * 1000;
    case 'quarterly': return 90 * 24 * 60 * 60 * 1000;
    default:          return Infinity;
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
  const filename = `passvault-${safeName}-${date}.json.gz`;

  // Gzip-compress the vault backup
  const compressed = gzipSync(Buffer.from(content, 'utf-8'));

  // Generate a 72-hour unsubscribe token
  const frontendUrl = process.env.FRONTEND_URL || '';
  let unsubscribeUrl = `${frontendUrl}/ui`;
  try {
    const unsubToken = await signUnsubscribeToken(user.userId);
    unsubscribeUrl = `${frontendUrl}/unsubscribe?token=${unsubToken}`;
  } catch (err) {
    console.error('Failed to generate unsubscribe token:', err);
  }

  const lang = resolveLanguage(user.preferredLanguage);
  const { subject, html, plainText } = await renderEmail('vault-backup', lang, {
    userName: resolveGreeting(user),
    vaultName: vault.displayName,
    backupDate: date,
    unsubscribeUrl,
    currentFrequency: freq,
  });

  await sendEmailWithAttachment(
    user.username,
    subject,
    plainText,
    { filename, content: compressed.toString('base64'), contentType: 'application/gzip' },
    html,
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
