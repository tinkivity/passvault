import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import type { User, VaultSummary } from '@passvault/shared';
import { DYNAMODB_TABLE, LOGIN_EVENTS_TABLE, VAULTS_TABLE } from '../config.js';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export async function getUserById(userId: string): Promise<User | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: { userId },
    }),
  );
  return (result.Item as User) || null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      IndexName: 'username-index',
      KeyConditionExpression: 'username = :u',
      ExpressionAttributeValues: { ':u': username },
    }),
  );
  return (result.Items?.[0] as User) || null;
}

export async function createUser(user: User): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: user,
      ConditionExpression: 'attribute_not_exists(userId)',
    }),
  );
}

export async function updateUser(
  userId: string,
  updates: Partial<Omit<User, 'userId'>>,
): Promise<void> {
  const keys = Object.keys(updates) as Array<keyof typeof updates>;
  if (keys.length === 0) return;

  const expressionParts: string[] = [];
  const expressionValues: Record<string, unknown> = {};
  const expressionNames: Record<string, string> = {};

  for (const key of keys) {
    const attrName = `#${key}`;
    const attrValue = `:${key}`;
    expressionNames[attrName] = key;
    expressionValues[attrValue] = updates[key];
    expressionParts.push(`${attrName} = ${attrValue}`);
  }

  await docClient.send(
    new UpdateCommand({
      TableName: DYNAMODB_TABLE,
      Key: { userId },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
    }),
  );
}

export async function getUserByCredentialId(credentialId: string): Promise<User | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: DYNAMODB_TABLE,
      FilterExpression: '#cid = :cid',
      ExpressionAttributeNames: { '#cid': 'passkeyCredentialId' },
      ExpressionAttributeValues: { ':cid': credentialId },
    }),
  );
  return (result.Items?.[0] as User) || null;
}

export async function deleteUser(userId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: DYNAMODB_TABLE,
      Key: { userId },
    }),
  );
}

export async function listAllUsers(): Promise<User[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: DYNAMODB_TABLE,
    }),
  );
  return (result.Items as User[]) || [];
}

export async function recordLoginEvent(eventId: string, userId: string, username: string, success: boolean): Promise<void> {
  const now = new Date();
  const expiresAt = Math.floor(now.getTime() / 1000) + 90 * 24 * 60 * 60; // 90 days TTL
  await docClient.send(
    new PutCommand({
      TableName: LOGIN_EVENTS_TABLE,
      Item: {
        eventId,
        userId,
        username,
        timestamp: now.toISOString(),
        success,
        expiresAt,
      },
    }),
  );
}

export async function updateLoginEventLogout(eventId: string, logoutAt: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: LOGIN_EVENTS_TABLE,
      Key: { eventId },
      UpdateExpression: 'SET logoutAt = :l',
      ExpressionAttributeValues: { ':l': logoutAt },
    }),
  );
}

export async function getLoginEvents(limit: number): Promise<Array<{
  eventId: string; userId: string; username: string;
  timestamp: string; success: boolean; logoutAt?: string;
}>> {
  const items: Array<Record<string, unknown>> = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: LOGIN_EVENTS_TABLE,
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      }),
    );
    items.push(...((result.Items ?? []) as Array<Record<string, unknown>>));
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return items.slice(0, limit) as Array<{
    eventId: string; userId: string; username: string;
    timestamp: string; success: boolean; logoutAt?: string;
  }>;
}

export async function getLoginCountSince(isoTimestamp: string): Promise<number> {
  let count = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: LOGIN_EVENTS_TABLE,
        FilterExpression: '#ts >= :since',
        ExpressionAttributeNames: { '#ts': 'timestamp' },
        ExpressionAttributeValues: { ':since': isoTimestamp },
        Select: 'COUNT',
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      }),
    );
    count += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return count;
}

// ---- Vault CRUD -----------------------------------------------------------

export async function createVaultRecord(vaultId: string, userId: string, displayName: string): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: VAULTS_TABLE,
      Item: {
        vaultId,
        userId,
        displayName,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(vaultId)',
    }),
  );
}

export async function getVaultRecord(vaultId: string): Promise<{ vaultId: string; userId: string; displayName: string; createdAt: string } | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: VAULTS_TABLE,
      Key: { vaultId },
    }),
  );
  return (result.Item as { vaultId: string; userId: string; displayName: string; createdAt: string }) || null;
}

export async function listVaultsByUser(userId: string): Promise<VaultSummary[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: VAULTS_TABLE,
      IndexName: 'byUser',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }),
  );
  return ((result.Items ?? []) as VaultSummary[]).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  );
}

export async function deleteVaultRecord(vaultId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: VAULTS_TABLE,
      Key: { vaultId },
    }),
  );
}
