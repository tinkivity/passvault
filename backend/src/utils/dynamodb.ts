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
import type { User, VaultSummary, PasskeyCredential } from '@passvault/shared';
import { DYNAMODB_TABLE, LOGIN_EVENTS_TABLE, VAULTS_TABLE, PASSKEY_CREDENTIALS_TABLE } from '../config.js';
import { encryptDisplayName, decryptDisplayName } from './crypto.js';

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

export async function getUserByEmailChangeToken(token: string): Promise<User | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: DYNAMODB_TABLE,
      FilterExpression: 'emailChangeToken = :token',
      ExpressionAttributeValues: { ':token': token },
      Limit: 1,
    }),
  );
  return (result.Items?.[0] as User) ?? null;
}

export async function getUserByEmailChangeLockToken(token: string): Promise<User | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: DYNAMODB_TABLE,
      FilterExpression: 'emailChangeLockToken = :token',
      ExpressionAttributeValues: { ':token': token },
      Limit: 1,
    }),
  );
  return (result.Items?.[0] as User) ?? null;
}

export async function getUserByRegistrationToken(token: string): Promise<Pick<User, 'userId' | 'status' | 'registrationTokenExpiresAt' | 'username'> | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      IndexName: 'registrationToken-index',
      KeyConditionExpression: 'registrationToken = :token',
      ExpressionAttributeValues: { ':token': token },
      Limit: 1,
    }),
  );
  return (result.Items?.[0] as Pick<User, 'userId' | 'status' | 'registrationTokenExpiresAt' | 'username'>) ?? null;
}

export async function getUserByCredentialId(credentialId: string): Promise<{ user: User; credential: PasskeyCredential } | null> {
  const credential = await getPasskeyCredential(credentialId);
  if (!credential) return null;
  const user = await getUserById(credential.userId);
  if (!user) return null;
  return { user, credential };
}

// ── Passkey credentials CRUD ─────────────────────────────────────────────────

export async function createPasskeyCredential(credential: PasskeyCredential): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: PASSKEY_CREDENTIALS_TABLE,
      Item: credential,
      ConditionExpression: 'attribute_not_exists(credentialId)',
    }),
  );
}

export async function getPasskeyCredential(credentialId: string): Promise<PasskeyCredential | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: PASSKEY_CREDENTIALS_TABLE,
      Key: { credentialId },
    }),
  );
  return (result.Item as PasskeyCredential) ?? null;
}

export async function listPasskeyCredentials(userId: string): Promise<PasskeyCredential[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: PASSKEY_CREDENTIALS_TABLE,
      IndexName: 'byUser',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }),
  );
  return (result.Items as PasskeyCredential[]) ?? [];
}

export async function deletePasskeyCredential(credentialId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: PASSKEY_CREDENTIALS_TABLE,
      Key: { credentialId },
    }),
  );
}

export async function updatePasskeyCounter(credentialId: string, newCounter: number): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: PASSKEY_CREDENTIALS_TABLE,
      Key: { credentialId },
      UpdateExpression: 'SET #c = :c',
      ExpressionAttributeNames: { '#c': 'counter' },
      ExpressionAttributeValues: { ':c': newCounter },
    }),
  );
}

export async function renamePasskeyCredential(credentialId: string, name: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: PASSKEY_CREDENTIALS_TABLE,
      Key: { credentialId },
      UpdateExpression: 'SET #n = :n',
      ExpressionAttributeNames: { '#n': 'name' },
      ExpressionAttributeValues: { ':n': name },
    }),
  );
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

export async function recordLoginEvent(
  eventId: string,
  userId: string,
  success: boolean,
  passkeyCredentialId?: string,
  passkeyName?: string,
): Promise<void> {
  const now = new Date();
  const expiresAt = Math.floor(now.getTime() / 1000) + 90 * 24 * 60 * 60; // 90 days TTL
  const item: Record<string, unknown> = {
    eventId,
    userId,
    timestamp: now.toISOString(),
    success,
    expiresAt,
  };
  if (passkeyCredentialId) item.passkeyCredentialId = passkeyCredentialId;
  if (passkeyName) item.passkeyName = passkeyName;
  await docClient.send(
    new PutCommand({ TableName: LOGIN_EVENTS_TABLE, Item: item }),
  );
}

export async function updateLoginEventLogout(eventId: string, logoutAt: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: LOGIN_EVENTS_TABLE,
      Key: { eventId },
      UpdateExpression: 'SET logoutAt = :l',
      ExpressionAttributeValues: { ':l': logoutAt },
      ConditionExpression: 'attribute_exists(eventId)',
    }),
  );
}

export async function getLoginEvents(limit: number): Promise<Array<{
  eventId: string; userId: string;
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
    eventId: string; userId: string;
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

export async function createVaultRecord(vaultId: string, userId: string, displayName: string, encryptionSalt: string): Promise<void> {
  const encryptedDisplayName = await encryptDisplayName(displayName);
  await docClient.send(
    new PutCommand({
      TableName: VAULTS_TABLE,
      Item: {
        vaultId,
        userId,
        displayName: encryptedDisplayName,
        encryptionSalt,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(vaultId)',
    }),
  );
}

export async function getVaultRecord(vaultId: string): Promise<{ vaultId: string; userId: string; displayName: string; encryptionSalt: string; createdAt: string } | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: VAULTS_TABLE,
      Key: { vaultId },
    }),
  );
  if (!result.Item) return null;
  const item = result.Item as { vaultId: string; userId: string; displayName: string; encryptionSalt: string; createdAt: string };
  return { ...item, displayName: await decryptDisplayName(item.displayName) };
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
  const items = (result.Items ?? []) as VaultSummary[];
  const decrypted = await Promise.all(
    items.map(async (v) => ({ ...v, displayName: await decryptDisplayName(v.displayName) })),
  );
  return decrypted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateVaultDisplayName(vaultId: string, displayName: string): Promise<void> {
  const encryptedDisplayName = await encryptDisplayName(displayName);
  await docClient.send(
    new UpdateCommand({
      TableName: VAULTS_TABLE,
      Key: { vaultId },
      UpdateExpression: 'SET displayName = :dn',
      ExpressionAttributeValues: { ':dn': encryptedDisplayName },
    }),
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
