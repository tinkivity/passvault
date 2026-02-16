import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';

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
      rules: [
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
