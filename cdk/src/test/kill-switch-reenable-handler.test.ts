import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const { mockLambdaSend, mockDdbSend, mockSnsSend, MockPutCommand } = vi.hoisted(() => ({
  mockLambdaSend: vi.fn(),
  mockDdbSend: vi.fn(),
  mockSnsSend: vi.fn(),
  MockPutCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(() => ({ send: mockLambdaSend })),
  PutFunctionConcurrencyCommand: vi.fn(),
  DeleteFunctionConcurrencyCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn(() => ({ send: mockSnsSend })),
  PublishCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockDdbSend })) },
  PutCommand: MockPutCommand,
}));

import { handler } from '../../lib/kill-switch-reenable-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FN_ARNS = [
  'arn:aws:lambda:eu-central-1:123:function:challenge',
  'arn:aws:lambda:eu-central-1:123:function:auth',
].join(',');

const ENV_VARS = {
  FUNCTION_ARNS: FN_ARNS,
  CONCURRENCY_LIMITS: '5,3',
  AUDIT_EVENTS_TABLE: 'passvault-audit-test',
  ALERT_TOPIC_ARN: 'arn:aws:sns:eu-central-1:123:passvault-beta-kill-switch',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('kill-switch re-enable handler', () => {
  beforeEach(() => {
    Object.assign(process.env, ENV_VARS);
    mockLambdaSend.mockReset();
    mockDdbSend.mockReset();
    mockSnsSend.mockReset();
    MockPutCommand.mockClear();
    mockLambdaSend.mockResolvedValue({});
    mockDdbSend.mockResolvedValue({});
    mockSnsSend.mockResolvedValue({});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const key of Object.keys(ENV_VARS)) {
      delete process.env[key];
    }
    vi.restoreAllMocks();
  });

  it('restores concurrency for all functions', async () => {
    await handler({});

    // PutFunctionConcurrency called for each function (limits > 0)
    expect(mockLambdaSend).toHaveBeenCalledTimes(2);
  });

  it('uses DeleteFunctionConcurrency when limit is 0', async () => {
    process.env.CONCURRENCY_LIMITS = '0,0';

    await handler({});

    // DeleteFunctionConcurrency called for each function
    expect(mockLambdaSend).toHaveBeenCalledTimes(2);
  });

  it('writes audit event with trigger=automatic when scheduleName is present', async () => {
    await handler({ scheduleName: 'passvault-reenable-12345', groupName: 'test-group' });

    expect(MockPutCommand).toHaveBeenCalledTimes(1);
    const item = MockPutCommand.mock.calls[0][0].Item;
    expect(item.action).toBe('kill_switch_deactivated');
    expect(item.details.trigger).toBe('automatic');
    expect(item.category).toBe('system');
    expect(item.userId).toBe('SYSTEM');
  });

  it('writes audit event with trigger=manual when no scheduleName', async () => {
    await handler({});

    const item = MockPutCommand.mock.calls[0][0].Item;
    expect(item.details.trigger).toBe('manual');
  });

  it('does not throw when audit write fails', async () => {
    mockDdbSend.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

    await expect(handler({})).resolves.toBeUndefined();
  });

  it('throws on mismatched FUNCTION_ARNS and CONCURRENCY_LIMITS', async () => {
    process.env.CONCURRENCY_LIMITS = '5';

    await expect(handler({})).rejects.toThrow('must be non-empty and equal length');
  });

  it('skips audit write when AUDIT_EVENTS_TABLE is not set', async () => {
    delete process.env.AUDIT_EVENTS_TABLE;

    await handler({});

    expect(MockPutCommand).not.toHaveBeenCalled();
  });

  it('publishes recovery notification to SNS', async () => {
    await handler({ scheduleName: 'passvault-reenable-12345' });

    expect(mockSnsSend).toHaveBeenCalledTimes(1);
  });

  it('skips SNS notification when ALERT_TOPIC_ARN is not set', async () => {
    delete process.env.ALERT_TOPIC_ARN;

    await handler({});

    expect(mockSnsSend).not.toHaveBeenCalled();
  });

  it('does not throw when SNS publish fails', async () => {
    mockSnsSend.mockRejectedValueOnce(new Error('SNS unavailable'));

    await expect(handler({})).resolves.toBeUndefined();
  });
});
