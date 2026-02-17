import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { User } from '@passvault/shared';
import { DYNAMODB_TABLE } from '../config.js';

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

export async function listAllUsers(): Promise<User[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: DYNAMODB_TABLE,
    }),
  );
  return (result.Items as User[]) || [];
}
