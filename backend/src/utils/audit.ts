import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import type { AuditCategory, AuditAction, AuditConfig, AuditEvent, AuditEventSummary, AuditQueryParams, AuditQueryResponse } from '@passvault/shared';
import { DEFAULT_AUDIT_CONFIG } from '@passvault/shared';
import { AUDIT_EVENTS_TABLE, CONFIG_TABLE } from '../config.js';
import { listAllUsers } from './dynamodb.js';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

// ── Config cache (60s TTL — config changes propagate within a minute) ───────

let cachedConfig: AuditConfig | undefined;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5_000; // 5s — short TTL so config changes propagate quickly across Lambdas

export async function getAuditConfig(): Promise<AuditConfig> {
  if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL_MS) return cachedConfig;
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: CONFIG_TABLE,
        Key: { configKey: 'auditConfig' },
      }),
    );
    if (result.Item?.config) {
      cachedConfig = result.Item.config as AuditConfig;
      cacheTimestamp = Date.now();
      return cachedConfig;
    }
  } catch (err) {
    console.error('Failed to read audit config, using defaults:', err);
  }
  cachedConfig = { ...DEFAULT_AUDIT_CONFIG };
  cacheTimestamp = Date.now();
  return cachedConfig;
}

export async function updateAuditConfig(config: AuditConfig): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: CONFIG_TABLE,
      Item: {
        configKey: 'auditConfig',
        config,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  cachedConfig = config;
}

/** Reset in-memory cache (useful for testing). */
export function invalidateAuditConfigCache(): void {
  cachedConfig = undefined;
}

// ── Record events ───────────────────────────────────────────────────────────

export interface RecordAuditEventInput {
  category: AuditCategory;
  action: AuditAction;
  userId: string;
  performedBy?: string;
  details?: Record<string, string>;
}

export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  const config = await getAuditConfig();
  if (!config[input.category]) return; // category disabled

  const now = new Date();
  const event: AuditEvent = {
    eventId: randomUUID(),
    category: input.category,
    action: input.action,
    userId: input.userId,
    performedBy: input.performedBy,
    timestamp: now.toISOString(),
    details: input.details,
    expiresAt: Math.floor(now.getTime() / 1000) + TTL_SECONDS,
  };

  await docClient.send(
    new PutCommand({
      TableName: AUDIT_EVENTS_TABLE,
      Item: event,
    }),
  );
}

// ── Query events ────────────────────────────────────────────────────────────

export async function queryAuditEvents(
  params: AuditQueryParams = {},
): Promise<AuditQueryResponse> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  // If a category is specified, use the GSI for efficient querying with cursor pagination
  if (params.category) {
    const result = await queryByCategory(params.category, {
      from: params.from,
      to: params.to,
      action: params.action,
      userId: params.userId,
      limit,
      nextToken: params.nextToken,
      sort: params.sort,
    });
    const events = await enrichWithUsernames(result.events);
    return { events, nextToken: result.nextToken };
  }

  // No category filter — query all 4 categories in parallel, merge, sort
  // No cursor pagination for cross-category queries — cap at limit
  const categories: AuditCategory[] = ['authentication', 'admin_actions', 'vault_operations', 'system'];
  const results = await Promise.all(
    categories.map(cat => queryByCategory(cat, {
      from: params.from,
      to: params.to,
      action: params.action,
      userId: params.userId,
      limit,
      sort: params.sort,
    })),
  );
  const merged = results.flatMap(r => r.events);
  const ascending = params.sort === 'asc';
  merged.sort((a, b) => ascending
    ? a.timestamp.localeCompare(b.timestamp)
    : b.timestamp.localeCompare(a.timestamp),
  );

  const events = await enrichWithUsernames(merged.slice(0, limit));
  return { events };
}

interface QueryByCategoryOptions {
  from?: string;
  to?: string;
  action?: string;
  userId?: string;
  limit: number;
  nextToken?: string;
  sort?: 'asc' | 'desc';
}

async function queryByCategory(
  category: AuditCategory,
  opts: QueryByCategoryOptions,
): Promise<{ events: AuditEventSummary[]; nextToken?: string }> {
  const { from, to, action, userId, limit, nextToken, sort } = opts;

  let keyCondition = 'category = :cat';
  const exprValues: Record<string, unknown> = { ':cat': category };
  const exprNames: Record<string, string> = {};

  if (from && to) {
    keyCondition += ' AND #ts BETWEEN :from AND :to';
    exprValues[':from'] = from;
    exprValues[':to'] = to;
    exprNames['#ts'] = 'timestamp';
  } else if (from) {
    keyCondition += ' AND #ts >= :from';
    exprValues[':from'] = from;
    exprNames['#ts'] = 'timestamp';
  } else if (to) {
    keyCondition += ' AND #ts <= :to';
    exprValues[':to'] = to;
    exprNames['#ts'] = 'timestamp';
  }

  // Build FilterExpression for action and userId
  const filterParts: string[] = [];
  if (action) {
    filterParts.push('#act = :act');
    exprValues[':act'] = action;
    exprNames['#act'] = 'action';
  }
  if (userId) {
    filterParts.push('userId = :uid');
    exprValues[':uid'] = userId;
  }
  const filterExpression = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

  // Decode nextToken (base64 JSON → DynamoDB key)
  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (nextToken) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
    } catch {
      // Invalid token — ignore, start from beginning
    }
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: AUDIT_EVENTS_TABLE,
      IndexName: 'byCategoryTimestamp',
      KeyConditionExpression: keyCondition,
      ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
      ExpressionAttributeValues: exprValues,
      FilterExpression: filterExpression,
      ScanIndexForward: sort === 'asc',
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  const events: AuditEventSummary[] = ((result.Items ?? []) as AuditEvent[]).map(ev => ({
    eventId: ev.eventId,
    category: ev.category,
    action: ev.action,
    userId: ev.userId,
    performedBy: ev.performedBy,
    timestamp: ev.timestamp,
    details: ev.details,
  }));

  // Encode LastEvaluatedKey as base64 JSON for the next page cursor
  const encodedNextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  return { events, nextToken: encodedNextToken };
}

async function enrichWithUsernames(events: AuditEventSummary[]): Promise<AuditEventSummary[]> {
  if (events.length === 0) return events;

  const users = await listAllUsers();
  const usernameMap = new Map(users.map(u => [u.userId, u.username]));

  return events.map(ev => ({
    ...ev,
    username: usernameMap.get(ev.userId),
    performedByUsername: ev.performedBy ? usernameMap.get(ev.performedBy) : undefined,
  }));
}
