/**
 * Kill Switch Lambda Handler
 *
 * Triggered by SNS when a CloudWatch alarm fires (traffic spike detected).
 * Flips the WAF KillSwitchBlock rule from Count → Block, returning a 503
 * maintenance page to all clients. Idempotent — safe to trigger multiple times.
 *
 * Recovery: AWS Console → WAF & Shield (us-east-1) → Web ACLs →
 *   passvault-waf-prod → Rules → KillSwitchBlock → Edit → change Block → Count
 */

import { WAFV2Client, GetWebACLCommand, UpdateWebACLCommand } from '@aws-sdk/client-wafv2';

// CLOUDFRONT-scoped WAF always lives in us-east-1 regardless of stack region
const wafClient = new WAFV2Client({ region: 'us-east-1' });

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

    // CloudWatch alarm notifications include NewStateValue
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
  const name = process.env.WAF_ACL_NAME;
  const id = process.env.WAF_ACL_ID;
  const killSwitchRuleName = process.env.KILL_SWITCH_RULE;

  if (!name || !id || !killSwitchRuleName) {
    throw new Error('Missing required env vars: WAF_ACL_NAME, WAF_ACL_ID, KILL_SWITCH_RULE');
  }

  const scope = 'CLOUDFRONT' as const;

  // Fetch current WebACL configuration — LockToken required for UpdateWebACL
  const getRes = await wafClient.send(new GetWebACLCommand({ Name: name, Scope: scope, Id: id }));

  if (!getRes.WebACL || !getRes.LockToken) {
    throw new Error('GetWebACL returned no WebACL or LockToken');
  }

  const { WebACL: webAcl, LockToken: lockToken } = getRes;
  const rules = [...(webAcl.Rules ?? [])];
  const ruleIdx = rules.findIndex((r) => r.Name === killSwitchRuleName);

  if (ruleIdx === -1) {
    throw new Error(`Kill switch rule "${killSwitchRuleName}" not found in WebACL`);
  }

  // Idempotent: already blocking
  if (rules[ruleIdx].Action?.Block) {
    console.log('Kill switch already active — no update needed');
    return;
  }

  // Flip: Count → Block with 503 maintenance page
  rules[ruleIdx] = {
    ...rules[ruleIdx],
    Action: {
      Block: {
        CustomResponse: {
          ResponseCode: 503,
          CustomResponseBodyKey: 'maintenance',
        },
      },
    },
  };

  await wafClient.send(
    new UpdateWebACLCommand({
      Name: name,
      Scope: scope,
      Id: id,
      LockToken: lockToken,
      DefaultAction: webAcl.DefaultAction!,
      Rules: rules,
      VisibilityConfig: webAcl.VisibilityConfig!,
      CustomResponseBodies: webAcl.CustomResponseBodies,
      Description: webAcl.Description,
      CaptchaConfig: webAcl.CaptchaConfig,
      ChallengeConfig: webAcl.ChallengeConfig,
      TokenDomains: webAcl.TokenDomains,
    }),
  );

  console.log('Kill switch ACTIVATED — all traffic blocked with 503 maintenance page');
}
