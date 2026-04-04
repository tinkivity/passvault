#!/usr/bin/env npx tsx
/**
 * SIT cleanup helper.
 *
 * Removes the SIT admin and any users they created during the test run.
 * Also cleans up associated vault files and login event records.
 *
 * Required env vars:
 *   ENVIRONMENT      — dev or beta
 *   SIT_ADMIN_EMAIL  — email of the SIT admin to clean up
 *   DYNAMODB_TABLE   — users table name
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getEnvironmentConfig } from '@passvault/shared';

const ENV = process.env.ENVIRONMENT ?? 'dev';
const config = getEnvironmentConfig(ENV);
const REGION = config.region;

const USERS_TABLE = process.env.DYNAMODB_TABLE ?? `passvault-users-${ENV}`;
const VAULTS_TABLE = process.env.VAULTS_TABLE_NAME ?? `passvault-vaults-${ENV}`;
const FILES_BUCKET = process.env.FILES_BUCKET ?? '';
const LOGIN_EVENTS_TABLE = process.env.LOGIN_EVENTS_TABLE_NAME ?? `passvault-login-events-${ENV}`;

const SIT_ADMIN_EMAIL = process.env.SIT_ADMIN_EMAIL;
if (!SIT_ADMIN_EMAIL) {
  console.error('Error: SIT_ADMIN_EMAIL is required.');
  process.exit(1);
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

interface CleanupSummary {
  usersDeleted: number;
  vaultsDeleted: number;
  filesDeleted: number;
  loginEventsDeleted: number;
}

async function findUserByUsername(username: string): Promise<{ userId: string } | undefined> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'username-index',
      KeyConditionExpression: 'username = :u',
      ExpressionAttributeValues: { ':u': username },
      Limit: 1,
    }),
  );
  if (result.Items && result.Items.length > 0) {
    return result.Items[0] as { userId: string };
  }
  return undefined;
}

async function findUsersCreatedBy(adminUserId: string): Promise<Array<{ userId: string; username: string }>> {
  // Scan for users with createdBy = adminUserId
  // This is acceptable for SIT cleanup — small table, infrequent operation
  const users: Array<{ userId: string; username: string }> = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'createdBy = :cb',
        ExpressionAttributeValues: { ':cb': adminUserId },
        ExclusiveStartKey: lastKey,
      }),
    );
    if (result.Items) {
      users.push(...(result.Items as Array<{ userId: string; username: string }>));
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return users;
}

async function findVaultsByUser(userId: string): Promise<Array<{ vaultId: string }>> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: VAULTS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }),
  );
  return (result.Items ?? []) as Array<{ vaultId: string }>;
}

async function deleteVaultFiles(vaultIds: string[]): Promise<number> {
  if (!FILES_BUCKET || vaultIds.length === 0) return 0;
  let deleted = 0;
  for (const vaultId of vaultIds) {
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: FILES_BUCKET,
          Key: `vault-${vaultId}.enc`,
        }),
      );
      deleted++;
    } catch {
      // File may not exist
    }
  }
  return deleted;
}

async function deleteVaultRecords(vaultIds: string[]): Promise<number> {
  let deleted = 0;
  for (const vaultId of vaultIds) {
    try {
      await dynamo.send(
        new DeleteCommand({
          TableName: VAULTS_TABLE,
          Key: { vaultId },
        }),
      );
      deleted++;
    } catch {
      // Record may not exist
    }
  }
  return deleted;
}

async function deleteUser(userId: string): Promise<void> {
  await dynamo.send(
    new DeleteCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }),
  );
}

async function deleteLoginEvents(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  let deleted = 0;

  for (const userId of userIds) {
    try {
      const result = await dynamo.send(
        new QueryCommand({
          TableName: LOGIN_EVENTS_TABLE,
          IndexName: 'userId-index',
          KeyConditionExpression: 'userId = :uid',
          ExpressionAttributeValues: { ':uid': userId },
        }),
      );

      if (result.Items && result.Items.length > 0) {
        // Batch delete in groups of 25
        const items = result.Items as Array<{ eventId: string }>;
        for (let i = 0; i < items.length; i += 25) {
          const batch = items.slice(i, i + 25);
          await dynamo.send(
            new BatchWriteCommand({
              RequestItems: {
                [LOGIN_EVENTS_TABLE]: batch.map(item => ({
                  DeleteRequest: { Key: { eventId: item.eventId } },
                })),
              },
            }),
          );
          deleted += batch.length;
        }
      }
    } catch {
      // Login events table may not exist or index may differ
    }
  }

  return deleted;
}

async function main() {
  console.log(`\nSIT Cleanup`);
  console.log(`  Environment : ${ENV}`);
  console.log(`  Admin email : ${SIT_ADMIN_EMAIL}`);
  console.log(`  Users table : ${USERS_TABLE}`);
  console.log(`  Vaults table: ${VAULTS_TABLE}`);
  console.log('');

  const summary: CleanupSummary = {
    usersDeleted: 0,
    vaultsDeleted: 0,
    filesDeleted: 0,
    loginEventsDeleted: 0,
  };

  // Find the SIT admin
  const admin = await findUserByUsername(SIT_ADMIN_EMAIL!);
  if (!admin) {
    console.log(`  SIT admin "${SIT_ADMIN_EMAIL}" not found — nothing to clean up.`);
    return;
  }

  const adminUserId = admin.userId;
  const allUserIds = [adminUserId];

  // Find users created by the SIT admin
  const createdUsers = await findUsersCreatedBy(adminUserId);
  console.log(`  Found ${createdUsers.length} user(s) created by SIT admin.`);

  // Delete vault files and records for each user
  for (const user of createdUsers) {
    const vaults = await findVaultsByUser(user.userId);
    const vaultIds = vaults.map(v => v.vaultId);

    summary.filesDeleted += await deleteVaultFiles(vaultIds);
    summary.vaultsDeleted += await deleteVaultRecords(vaultIds);

    await deleteUser(user.userId);
    summary.usersDeleted++;
    allUserIds.push(user.userId);
  }

  // Delete SIT admin's own vaults (if any)
  const adminVaults = await findVaultsByUser(adminUserId);
  const adminVaultIds = adminVaults.map(v => v.vaultId);
  summary.filesDeleted += await deleteVaultFiles(adminVaultIds);
  summary.vaultsDeleted += await deleteVaultRecords(adminVaultIds);

  // Delete the SIT admin
  await deleteUser(adminUserId);
  summary.usersDeleted++;

  // Clean up login events for all users
  summary.loginEventsDeleted = await deleteLoginEvents(allUserIds);

  console.log(`  Cleanup summary:`);
  console.log(`    Users deleted        : ${summary.usersDeleted}`);
  console.log(`    Vaults deleted       : ${summary.vaultsDeleted}`);
  console.log(`    Vault files deleted  : ${summary.filesDeleted}`);
  console.log(`    Login events deleted : ${summary.loginEventsDeleted}`);
  console.log('');
}

main().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
