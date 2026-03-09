/**
 * Kill Switch Lambda Handler
 *
 * Triggered by SNS when a CloudWatch alarm fires (API Gateway sustained at
 * steady-state throttle limit for 3 consecutive minutes — likely bot attack).
 *
 * Sets all Lambda function reserved concurrency to 0, which causes API Gateway
 * to return 429 for all requests without invoking any Lambda. Then schedules
 * automatic re-enablement 4 hours later via EventBridge Scheduler.
 *
 * Idempotent — safe to trigger multiple times.
 *
 * Recovery (manual): see BOTPROTECTION.md or run:
 *   aws lambda put-function-concurrency --function-name passvault-challenge-prod --reserved-concurrent-executions 5
 *   aws lambda put-function-concurrency --function-name passvault-auth-prod     --reserved-concurrent-executions 3
 *   aws lambda put-function-concurrency --function-name passvault-admin-prod    --reserved-concurrent-executions 2
 *   aws lambda put-function-concurrency --function-name passvault-vault-prod    --reserved-concurrent-executions 5
 *   aws lambda put-function-concurrency --function-name passvault-health-prod   --reserved-concurrent-executions 2
 */

import {
  LambdaClient,
  PutFunctionConcurrencyCommand,
  GetFunctionConcurrencyCommand,
} from '@aws-sdk/client-lambda';
import {
  SchedulerClient,
  CreateScheduleCommand,
  FlexibleTimeWindowMode,
} from '@aws-sdk/client-scheduler';

const lambdaClient = new LambdaClient({});
const schedulerClient = new SchedulerClient({});

interface SnsRecord {
  Sns: { Message: string };
}

export async function handler(event: { Records: SnsRecord[] }): Promise<void> {
  for (const record of event.Records) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(record.Sns.Message) as Record<string, unknown>;
    } catch {
      console.error('Failed to parse SNS message:', record.Sns.Message);
      continue;
    }

    const state = message['NewStateValue'];
    if (state !== 'ALARM') {
      console.log(`Ignoring SNS message with state: ${state ?? '(none)'}`);
      continue;
    }

    console.log(`ALARM triggered: ${message['AlarmName'] ?? 'unknown'} — activating kill switch`);
    await activateKillSwitch();
  }
}

async function activateKillSwitch(): Promise<void> {
  const functionArns = (process.env.FUNCTION_ARNS ?? '').split(',').filter(Boolean);
  const reEnableFunctionArn = process.env.REENABLE_FUNCTION_ARN;
  const schedulerRoleArn = process.env.SCHEDULER_ROLE_ARN;
  const schedulerGroupName = process.env.SCHEDULER_GROUP_NAME;

  if (!functionArns.length || !reEnableFunctionArn || !schedulerRoleArn || !schedulerGroupName) {
    throw new Error(
      'Missing required env vars: FUNCTION_ARNS, REENABLE_FUNCTION_ARN, SCHEDULER_ROLE_ARN, SCHEDULER_GROUP_NAME',
    );
  }

  // Idempotency check: if first function already has 0 concurrency, skip
  const firstName = functionArns[0].split(':').pop()!;
  const existing = await lambdaClient.send(
    new GetFunctionConcurrencyCommand({ FunctionName: functionArns[0] }),
  );
  if (existing.ReservedConcurrentExecutions === 0) {
    console.log('Kill switch already active — concurrency already 0, skipping');
  } else {
    // Set all functions to 0 concurrency
    await Promise.all(
      functionArns.map((arn) =>
        lambdaClient.send(
          new PutFunctionConcurrencyCommand({
            FunctionName: arn,
            ReservedConcurrentExecutions: 0,
          }),
        ),
      ),
    );
    console.log(`Kill switch ACTIVATED — set concurrency to 0 for ${functionArns.length} functions`);
  }

  // Schedule re-enablement after the configured delay
  const reEnableMinutes = parseInt(process.env.REENABLE_AFTER_MINUTES ?? '240', 10);
  const reEnableAt = new Date(Date.now() + reEnableMinutes * 60 * 1000);
  // EventBridge Scheduler uses UTC in format: yyyy-MM-ddTHH:mm:ss
  const scheduleExpression = `at(${reEnableAt.toISOString().slice(0, 19)})`;
  const scheduleName = `passvault-reenable-${Date.now()}`;

  try {
    await schedulerClient.send(
      new CreateScheduleCommand({
        Name: scheduleName,
        GroupName: schedulerGroupName,
        ScheduleExpression: scheduleExpression,
        ScheduleExpressionTimezone: 'UTC',
        Target: {
          Arn: reEnableFunctionArn,
          RoleArn: schedulerRoleArn,
          Input: JSON.stringify({ scheduleName, groupName: schedulerGroupName }),
        },
        FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
        // Auto-delete after execution to avoid accumulating stale schedules
        ActionAfterCompletion: 'DELETE',
      }),
    );
    console.log(`Re-enable scheduled at ${reEnableAt.toISOString()} (schedule: ${scheduleName})`);
  } catch (err) {
    // Scheduling failure is non-fatal — manual recovery is documented
    console.error('Failed to create re-enable schedule (manual recovery required):', err);
  }

  void firstName; // suppress unused warning
}
