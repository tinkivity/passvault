import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as path from 'path';
import { Construct } from 'constructs';

interface KillSwitchConstructProps {
  // The CLOUDFRONT-scoped WAF WebACL managed by SecurityConstruct.
  webAcl: wafv2.CfnWebACL;
  // SNS topic from MonitoringConstruct. The Lambda subscribes to this topic.
  alertTopic: sns.Topic;
  // Retention for the kill switch Lambda's log group.
  logRetentionDays: logs.RetentionDays;
}

export class KillSwitchConstruct extends Construct {
  public readonly killSwitchFn: lambda.Function;

  constructor(scope: Construct, id: string, props: KillSwitchConstructProps) {
    super(scope, id);

    const { webAcl, alertTopic, logRetentionDays } = props;

    // WAF ACL name — the CfnWebACL.name property is the WAF resource name string
    const webAclName = webAcl.name as string;

    // -------------------------------------------------------------------------
    // Log group (explicit, with DESTROY removal policy)
    // -------------------------------------------------------------------------

    const logGroup = new logs.LogGroup(this, 'KillSwitchLogs', {
      logGroupName: '/aws/lambda/passvault-kill-switch',
      retention: logRetentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // -------------------------------------------------------------------------
    // Kill switch Lambda
    //
    // NodejsFunction auto-bundles the handler + @aws-sdk/client-wafv2 via esbuild.
    // The handler targets us-east-1 for WAF API calls because CLOUDFRONT-scoped
    // WebACLs always live in the global us-east-1 endpoint.
    // -------------------------------------------------------------------------

    this.killSwitchFn = new lambda_nodejs.NodejsFunction(this, 'KillSwitchFn', {
      functionName: 'passvault-kill-switch',
      entry: path.join(__dirname, '../kill-switch-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      logGroup,
      environment: {
        WAF_ACL_NAME: webAclName,
        WAF_ACL_ID: webAcl.attrId,
        KILL_SWITCH_RULE: 'KillSwitchBlock',
      },
      bundling: {
        // Bundle @aws-sdk/client-wafv2 — Node 22 Lambda runtime does not
        // include AWS SDK v3 packages, so they must be bundled explicitly.
        externalModules: [],
        minify: true,
        sourceMap: false,
      },
    });

    // -------------------------------------------------------------------------
    // IAM — allow the Lambda to read and update the WAF WebACL
    // -------------------------------------------------------------------------

    this.killSwitchFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'WafKillSwitch',
        actions: ['wafv2:GetWebACL', 'wafv2:UpdateWebACL'],
        // CLOUDFRONT-scoped WAF ARNs always reference us-east-1
        resources: [webAcl.attrArn],
      }),
    );

    // -------------------------------------------------------------------------
    // Subscribe Lambda to the alert topic
    // -------------------------------------------------------------------------

    alertTopic.addSubscription(new sns_subscriptions.LambdaSubscription(this.killSwitchFn));
  }
}
