import { describe, it, expect, beforeEach } from 'vitest';
import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SecurityConstruct } from '../../lib/constructs/security.js';
import { prodConfig } from '@passvault/shared';

function makeStack() {
  const app = new App();
  return new Stack(app, 'TestStack', {
    env: { account: '123456789012', region: 'eu-central-1' },
  });
}

describe('SecurityConstruct', () => {
  let template: Template;

  beforeEach(() => {
    const stack = makeStack();
    new SecurityConstruct(stack, 'Security', prodConfig);
    template = Template.fromStack(stack);
  });

  it('creates exactly one WAF WebACL', () => {
    template.resourceCountIs('AWS::WAFv2::WebACL', 1);
  });

  it('names the WebACL passvault-waf-prod', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Name: 'passvault-waf-prod',
    });
  });

  it('scopes the WebACL to CLOUDFRONT', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Scope: 'CLOUDFRONT',
    });
  });

  it('defines exactly 4 WAF rules', () => {
    const webAcls = template.findResources('AWS::WAFv2::WebACL');
    const webAcl = Object.values(webAcls)[0];
    expect(webAcl.Properties.Rules).toHaveLength(4);
  });

  it('deploys KillSwitchBlock at priority 0 in Count mode', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: 'KillSwitchBlock',
          Priority: 0,
          Action: { Count: {} },
        }),
      ]),
    });
  });

  it('does not deploy KillSwitchBlock in Block mode initially', () => {
    const webAcls = template.findResources('AWS::WAFv2::WebACL');
    const webAcl = Object.values(webAcls)[0];
    const killSwitch = (webAcl.Properties.Rules as Array<{ Name: string; Action?: { Block?: unknown } }>)
      .find((r) => r.Name === 'KillSwitchBlock');
    expect(killSwitch?.Action?.Block).toBeUndefined();
  });

  it('deploys RateLimit at priority 3 in Block mode', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: 'RateLimit',
          Priority: 3,
          Action: { Block: {} },
        }),
      ]),
    });
  });

  it('configures RateLimit to 100 requests per 300 seconds per IP', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: 'RateLimit',
          Statement: {
            RateBasedStatement: {
              Limit: 100,
              EvaluationWindowSec: 300,
              AggregateKeyType: 'IP',
            },
          },
        }),
      ]),
    });
  });

  it('includes AWSManagedBotControl at priority 1', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: 'AWSManagedBotControl',
          Priority: 1,
        }),
      ]),
    });
  });

  it('includes AWSManagedKnownBadInputs at priority 2', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: 'AWSManagedKnownBadInputs',
          Priority: 2,
        }),
      ]),
    });
  });

  it('defines the maintenance custom response body with TEXT_HTML content type', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      CustomResponseBodies: {
        maintenance: {
          ContentType: 'TEXT_HTML',
        },
      },
    });
  });

  it('uses the default Allow action for unmatched requests', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      DefaultAction: { Allow: {} },
    });
  });
});
