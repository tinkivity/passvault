import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';

// Maintenance page returned by the kill switch (≤4 KB WAF limit).
// Displayed when all traffic is blocked due to a detected attack.
const MAINTENANCE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PassVault \u2014 Unavailable</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;color:#111827;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#fff;border-radius:16px;padding:48px 40px;max-width:440px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1),0 8px 32px rgba(0,0,0,.06)}.lock{font-size:3rem;margin-bottom:20px;display:block}h1{font-size:1.375rem;font-weight:600;margin-bottom:12px}p{color:#6b7280;line-height:1.65;margin-bottom:10px}p:last-of-type{margin-bottom:0}.tag{display:inline-block;margin-top:28px;padding:6px 14px;background:#fef3c7;color:#92400e;border-radius:99px;font-size:.75rem;font-weight:500}</style></head><body><div class="card"><span class="lock">\uD83D\uDD12</span><h1>Temporarily Unavailable</h1><p>PassVault is temporarily offline. Your data is safe and has not been affected.</p><p>Please try again later or contact your administrator.</p><span class="tag">503 Service Unavailable</span></div></body></html>`;

export class SecurityConstruct extends Construct {
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, config: EnvironmentConfig) {
    super(scope, id);

    const env = config.environment;

    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `passvault-waf-${env}`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `passvault-waf-${env}`,
        sampledRequestsEnabled: true,
      },

      // Custom response body returned by KillSwitchBlock when activated.
      // The kill switch Lambda flips the rule action to Block and references
      // this key in its customResponse. Must be defined here even when the
      // rule is in Count mode so the key is always available.
      customResponseBodies: {
        maintenance: {
          contentType: 'TEXT_HTML',
          content: MAINTENANCE_HTML,
        },
      },

      rules: [
        // Rule 0: Kill switch — priority 0, deployed as Count (no traffic impact).
        // Activated by the kill switch Lambda which flips action to Block (503).
        // To deactivate: WAF Console (us-east-1) → Web ACLs → passvault-waf-prod
        //   → Rules → KillSwitchBlock → Edit → change Block → Count → Save.
        {
          name: 'KillSwitchBlock',
          priority: 0,
          action: { count: {} },
          statement: {
            byteMatchStatement: {
              searchString: '/',
              fieldToMatch: { uriPath: {} },
              textTransformations: [{ priority: 0, type: 'NONE' }],
              positionalConstraint: 'STARTS_WITH',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `passvault-waf-${env}-kill-switch`,
            sampledRequestsEnabled: true,
          },
        },

        // Rule 1: AWS Managed Bot Control
        {
          name: 'AWSManagedBotControl',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesBotControlRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `passvault-waf-${env}-bot-control`,
            sampledRequestsEnabled: true,
          },
        },

        // Rule 2: AWS Managed Known Bad Inputs (SQLi, XSS)
        {
          name: 'AWSManagedKnownBadInputs',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `passvault-waf-${env}-bad-inputs`,
            sampledRequestsEnabled: true,
          },
        },

        // Rule 3: Rate limiting (100 requests per 5 minutes per IP)
        {
          name: 'RateLimit',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 100,
              evaluationWindowSec: 300,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `passvault-waf-${env}-rate-limit`,
            sampledRequestsEnabled: true,
          },
        },
      ],
    });
  }
}
