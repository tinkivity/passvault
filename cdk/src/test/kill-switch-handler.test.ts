import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const { mockLambdaSend, mockSchedulerSend } = vi.hoisted(() => ({
  mockLambdaSend: vi.fn(),
  mockSchedulerSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(() => ({ send: mockLambdaSend })),
  PutFunctionConcurrencyCommand: vi.fn(),
  GetFunctionConcurrencyCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-scheduler', () => ({
  SchedulerClient: vi.fn(() => ({ send: mockSchedulerSend })),
  CreateScheduleCommand: vi.fn(),
  FlexibleTimeWindowMode: { OFF: 'OFF' },
}));

import { handler } from '../../lib/kill-switch-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FN_ARNS = [
  'arn:aws:lambda:eu-central-1:123:function:challenge',
  'arn:aws:lambda:eu-central-1:123:function:auth',
].join(',');

const ENV_VARS = {
  FUNCTION_ARNS: FN_ARNS,
  REENABLE_FUNCTION_ARN: 'arn:aws:lambda:eu-central-1:123:function:reenable',
  SCHEDULER_ROLE_ARN: 'arn:aws:iam::123:role/scheduler-role',
  SCHEDULER_GROUP_NAME: 'passvault-kill-switch-prod',
  REENABLE_AFTER_MINUTES: '4',
};

function snsEvent(state: string): { Records: { Sns: { Message: string } }[] } {
  return {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({ NewStateValue: state, AlarmName: 'TestAlarm' }),
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('kill-switch handler', () => {
  beforeEach(() => {
    Object.assign(process.env, ENV_VARS);
    mockLambdaSend.mockReset();
    mockSchedulerSend.mockReset();
    mockSchedulerSend.mockResolvedValue({}); // CreateSchedule always succeeds by default
  });

  afterEach(() => {
    for (const key of Object.keys(ENV_VARS)) {
      delete process.env[key];
    }
  });

  it('ignores a non-ALARM SNS message (state=OK)', async () => {
    await handler(snsEvent('OK'));
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('ignores a non-ALARM SNS message (state=INSUFFICIENT_DATA)', async () => {
    await handler(snsEvent('INSUFFICIENT_DATA'));
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('calls PutFunctionConcurrency(0) for all functions when state is ALARM', async () => {
    // GetFunctionConcurrency returns non-zero → kill switch not yet active
    mockLambdaSend.mockResolvedValueOnce({ ReservedConcurrentExecutions: 5 }); // GetFunctionConcurrency
    mockLambdaSend.mockResolvedValue({}); // PutFunctionConcurrency for each fn

    await handler(snsEvent('ALARM'));

    // 1 GetFunctionConcurrency + 2 PutFunctionConcurrency (one per ARN in FN_ARNS)
    expect(mockLambdaSend).toHaveBeenCalledTimes(3);
  });

  it('creates an EventBridge schedule for auto re-enablement', async () => {
    mockLambdaSend.mockResolvedValueOnce({ ReservedConcurrentExecutions: 5 });
    mockLambdaSend.mockResolvedValue({});

    await handler(snsEvent('ALARM'));

    expect(mockSchedulerSend).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: skips PutFunctionConcurrency when concurrency already 0', async () => {
    // GetFunctionConcurrency returns 0 → kill switch already active
    mockLambdaSend.mockResolvedValueOnce({ ReservedConcurrentExecutions: 0 });

    await handler(snsEvent('ALARM'));

    // Only GetFunctionConcurrency is called; no PutFunctionConcurrency
    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
  });

  it('still creates schedule even when concurrency already 0 (idempotent re-schedule)', async () => {
    mockLambdaSend.mockResolvedValueOnce({ ReservedConcurrentExecutions: 0 });

    await handler(snsEvent('ALARM'));

    expect(mockSchedulerSend).toHaveBeenCalledTimes(1);
  });

  it('throws when FUNCTION_ARNS env var is missing', async () => {
    delete process.env.FUNCTION_ARNS;
    await expect(handler(snsEvent('ALARM'))).rejects.toThrow('Missing required env vars');
  });

  it('throws when REENABLE_FUNCTION_ARN env var is missing', async () => {
    delete process.env.REENABLE_FUNCTION_ARN;
    mockLambdaSend.mockResolvedValueOnce({ ReservedConcurrentExecutions: 5 });
    await expect(handler(snsEvent('ALARM'))).rejects.toThrow('Missing required env vars');
  });

  it('throws when SCHEDULER_ROLE_ARN env var is missing', async () => {
    delete process.env.SCHEDULER_ROLE_ARN;
    mockLambdaSend.mockResolvedValueOnce({ ReservedConcurrentExecutions: 5 });
    await expect(handler(snsEvent('ALARM'))).rejects.toThrow('Missing required env vars');
  });

  it('throws when SCHEDULER_GROUP_NAME env var is missing', async () => {
    delete process.env.SCHEDULER_GROUP_NAME;
    mockLambdaSend.mockResolvedValueOnce({ ReservedConcurrentExecutions: 5 });
    await expect(handler(snsEvent('ALARM'))).rejects.toThrow('Missing required env vars');
  });

  it('silently skips a non-JSON SNS message without throwing', async () => {
    const badEvent = { Records: [{ Sns: { Message: 'not-valid-json' } }] };
    await expect(handler(badEvent)).resolves.toBeUndefined();
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('does not throw when schedule creation fails (non-fatal)', async () => {
    mockLambdaSend.mockResolvedValueOnce({ ReservedConcurrentExecutions: 5 });
    mockLambdaSend.mockResolvedValue({});
    mockSchedulerSend.mockRejectedValueOnce(new Error('Scheduler unavailable'));

    // Should not throw — scheduling failure is non-fatal
    await expect(handler(snsEvent('ALARM'))).resolves.toBeUndefined();
  });
});
