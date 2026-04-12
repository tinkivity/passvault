/**
 * Kill Switch Re-enable Lambda Handler
 *
 * Triggered by EventBridge Scheduler 4 hours after the kill switch activates.
 * Restores each Lambda function's reserved concurrency to its original value,
 * allowing normal traffic to resume.
 *
 * The schedule uses ActionAfterCompletion: DELETE so it self-cleans after firing.
 *
 * Env vars (set by KillSwitchConstruct):
 *   FUNCTION_ARNS       — comma-separated Lambda ARNs in order matching CONCURRENCY_LIMITS
 *   CONCURRENCY_LIMITS  — comma-separated original reserved concurrency values (e.g. "5,3,2,5,2")
 */

import {
  LambdaClient,
  PutFunctionConcurrencyCommand,
  DeleteFunctionConcurrencyCommand,
} from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const lambdaClient = new LambdaClient({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const AUDIT_TTL_SECONDS = 7_776_000; // 90 days

interface SchedulerPayload {
  scheduleName?: string;
  groupName?: string;
}

export async function handler(event: SchedulerPayload): Promise<void> {
  const functionArns = (process.env.FUNCTION_ARNS ?? '').split(',').filter(Boolean);
  const concurrencyLimits = (process.env.CONCURRENCY_LIMITS ?? '')
    .split(',')
    .map(Number)
    .filter((n) => !isNaN(n));

  if (!functionArns.length || concurrencyLimits.length !== functionArns.length) {
    throw new Error(
      `FUNCTION_ARNS (${functionArns.length} entries) and CONCURRENCY_LIMITS ` +
        `(${concurrencyLimits.length} entries) must be non-empty and equal length`,
    );
  }

  console.log(
    `Re-enabling ${functionArns.length} Lambda functions with original concurrency limits`,
    { scheduleName: event.scheduleName },
  );

  await Promise.all(
    functionArns.map((arn, i) => {
      // A limit of 0 means the function had no reserved concurrency — restore to unreserved pool.
      if (concurrencyLimits[i] === 0) {
        return lambdaClient.send(new DeleteFunctionConcurrencyCommand({ FunctionName: arn }));
      }
      return lambdaClient.send(
        new PutFunctionConcurrencyCommand({
          FunctionName: arn,
          ReservedConcurrentExecutions: concurrencyLimits[i],
        }),
      );
    }),
  );

  console.log('Kill switch DEACTIVATED — all Lambda functions restored to original concurrency');

  const trigger = event.scheduleName ? 'automatic' : 'manual';
  await writeAuditEvent(trigger);
}

async function writeAuditEvent(trigger: string): Promise<void> {
  const table = process.env.AUDIT_EVENTS_TABLE;
  if (!table) return;
  try {
    const now = new Date();
    await ddbClient.send(new PutCommand({
      TableName: table,
      Item: {
        eventId: randomUUID(),
        category: 'system',
        action: 'kill_switch_deactivated',
        userId: 'SYSTEM',
        timestamp: now.toISOString(),
        details: { trigger },
        expiresAt: Math.floor(now.getTime() / 1000) + AUDIT_TTL_SECONDS,
      },
    }));
    console.log(`Audit event recorded: kill_switch_deactivated (trigger=${trigger})`);
  } catch (err) {
    console.error('Failed to write audit event (non-fatal):', err);
  }
}
