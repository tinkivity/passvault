import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import type { AuditCategory, AuditAction, AuditConfig, AuditEvent, AuditEventSummary } from '@passvault/shared';
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

export interface QueryAuditEventsOptions {
  category?: AuditCategory;
  from?: string;   // ISO 8601
  to?: string;     // ISO 8601
  limit?: number;
}

export async function queryAuditEvents(
  options: QueryAuditEventsOptions = {},
): Promise<AuditEventSummary[]> {
  const maxResults = Math.min(options.limit ?? 500, 500);

  // If a category is specified, use the GSI for efficient querying
  if (options.category) {
    const events = await queryByCategory(options.category, options.from, options.to, maxResults);
    return enrichWithUsernames(events);
  }

  // No category filter — query all 4 categories in parallel and merge
  const categories: AuditCategory[] = ['authentication', 'admin_actions', 'vault_operations', 'system'];
  const results = await Promise.all(
    categories.map(cat => queryByCategory(cat, options.from, options.to, maxResults)),
  );
  const merged = results.flat();
  merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Enrich with usernames
  return enrichWithUsernames(merged.slice(0, maxResults));
}

async function queryByCategory(
  category: AuditCategory,
  from?: string,
  to?: string,
  limit: number = 500,
): Promise<AuditEventSummary[]> {
  let keyCondition = 'category = :cat';
  const exprValues: Record<string, unknown> = { ':cat': category };

  if (from && to) {
    keyCondition += ' AND #ts BETWEEN :from AND :to';
    exprValues[':from'] = from;
    exprValues[':to'] = to;
  } else if (from) {
    keyCondition += ' AND #ts >= :from';
    exprValues[':from'] = from;
  } else if (to) {
    keyCondition += ' AND #ts <= :to';
    exprValues[':to'] = to;
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: AUDIT_EVENTS_TABLE,
      IndexName: 'byCategoryTimestamp',
      KeyConditionExpression: keyCondition,
      ExpressionAttributeNames: (from || to) ? { '#ts': 'timestamp' } : undefined,
      ExpressionAttributeValues: exprValues,
      ScanIndexForward: false, // descending by timestamp
      Limit: limit,
    }),
  );

  return ((result.Items ?? []) as AuditEvent[]).map(ev => ({
    eventId: ev.eventId,
    category: ev.category,
    action: ev.action,
    userId: ev.userId,
    performedBy: ev.performedBy,
    timestamp: ev.timestamp,
    details: ev.details,
  }));
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
