import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-wafv2', () => ({
  WAFV2Client: vi.fn(() => ({ send: mockSend })),
  GetWebACLCommand: vi.fn(),
  UpdateWebACLCommand: vi.fn(),
}));

import { handler } from '../../lib/kill-switch-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_VARS = {
  WAF_ACL_NAME: 'passvault-waf-prod',
  WAF_ACL_ID: 'test-acl-id',
  KILL_SWITCH_RULE: 'KillSwitchBlock',
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

const BASE_VISIBILITY = {
  CloudWatchMetricsEnabled: true,
  MetricName: 'test',
  SampledRequestsEnabled: false,
};

const WEBACL_COUNT_MODE = {
  WebACL: {
    Rules: [
      {
        Name: 'KillSwitchBlock',
        Priority: 0,
        Action: { Count: {} },
        Statement: { ByteMatchStatement: {} },
        VisibilityConfig: BASE_VISIBILITY,
      },
    ],
    DefaultAction: { Allow: {} },
    VisibilityConfig: BASE_VISIBILITY,
  },
  LockToken: 'test-lock-token',
};

const WEBACL_BLOCK_MODE = {
  ...WEBACL_COUNT_MODE,
  WebACL: {
    ...WEBACL_COUNT_MODE.WebACL,
    Rules: [
      {
        Name: 'KillSwitchBlock',
        Priority: 0,
        Action: { Block: {} },
        Statement: { ByteMatchStatement: {} },
        VisibilityConfig: BASE_VISIBILITY,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('kill-switch handler', () => {
  beforeEach(() => {
    Object.assign(process.env, ENV_VARS);
    mockSend.mockReset();
  });

  afterEach(() => {
    for (const key of Object.keys(ENV_VARS)) {
      delete process.env[key];
    }
  });

  it('ignores a non-ALARM SNS message (state=OK)', async () => {
    await handler(snsEvent('OK'));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('ignores a non-ALARM SNS message (state=INSUFFICIENT_DATA)', async () => {
    await handler(snsEvent('INSUFFICIENT_DATA'));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('calls GetWebACL and UpdateWebACL when state is ALARM', async () => {
    mockSend
      .mockResolvedValueOnce(WEBACL_COUNT_MODE) // GetWebACL
      .mockResolvedValueOnce({}); // UpdateWebACL
    await handler(snsEvent('ALARM'));
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('is idempotent: skips UpdateWebACL when kill switch already active', async () => {
    mockSend.mockResolvedValueOnce(WEBACL_BLOCK_MODE); // GetWebACL — already blocking
    await handler(snsEvent('ALARM'));
    // Only GetWebACL is called; UpdateWebACL is skipped
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('throws when WAF_ACL_NAME env var is missing', async () => {
    delete process.env.WAF_ACL_NAME;
    await expect(handler(snsEvent('ALARM'))).rejects.toThrow('Missing required env vars');
  });

  it('throws when WAF_ACL_ID env var is missing', async () => {
    delete process.env.WAF_ACL_ID;
    await expect(handler(snsEvent('ALARM'))).rejects.toThrow('Missing required env vars');
  });

  it('throws when KILL_SWITCH_RULE env var is missing', async () => {
    delete process.env.KILL_SWITCH_RULE;
    await expect(handler(snsEvent('ALARM'))).rejects.toThrow('Missing required env vars');
  });

  it('throws when GetWebACL returns no WebACL object', async () => {
    mockSend.mockResolvedValueOnce({ LockToken: 'token' }); // WebACL absent
    await expect(handler(snsEvent('ALARM'))).rejects.toThrow('GetWebACL returned no WebACL');
  });

  it('throws when GetWebACL returns no LockToken', async () => {
    mockSend.mockResolvedValueOnce({ WebACL: WEBACL_COUNT_MODE.WebACL }); // LockToken absent
    await expect(handler(snsEvent('ALARM'))).rejects.toThrow('GetWebACL returned no WebACL');
  });

  it('throws when the kill switch rule name is not found in the WebACL', async () => {
    const noMatchWebACL = {
      WebACL: {
        ...WEBACL_COUNT_MODE.WebACL,
        Rules: [{ Name: 'SomeOtherRule', Priority: 99, Action: { Count: {} }, Statement: {}, VisibilityConfig: BASE_VISIBILITY }],
      },
      LockToken: 'token',
    };
    mockSend.mockResolvedValueOnce(noMatchWebACL);
    await expect(handler(snsEvent('ALARM'))).rejects.toThrow('not found in WebACL');
  });

  it('silently skips a non-JSON SNS message without throwing', async () => {
    const badEvent = { Records: [{ Sns: { Message: 'not-valid-json' } }] };
    await expect(handler(badEvent)).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
