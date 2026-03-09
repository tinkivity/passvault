import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';
import { StorageConstruct } from './constructs/storage.js';
import { BackendConstruct } from './constructs/backend.js';
import { FrontendConstruct } from './constructs/frontend.js';
import { MonitoringConstruct } from './constructs/monitoring.js';
import { KillSwitchConstruct } from './constructs/kill-switch.js';

interface PassVaultStackProps extends cdk.StackProps {
  certificate?: acm.ICertificate;
  domain?: string;
}

export class PassVaultStack extends cdk.Stack {
  constructor(scope: Construct, id: string, config: EnvironmentConfig, props?: PassVaultStackProps) {
    super(scope, id, props);

    // Alert email for SNS subscription. Provide via:
    //   cdk deploy --context alertEmail=you@example.com
    // Required for kill switch email notifications. A confirmation email will
    // be sent to this address after deploy — click the link to activate it.
    const alertEmail = this.node.tryGetContext('alertEmail') as string | undefined;

    // 1. Storage: DynamoDB + S3 buckets
    const storage = new StorageConstruct(this, 'Storage', config);

    // 2. Backend: Lambdas + API Gateway
    const backend = new BackendConstruct(this, 'Backend', { config, storage });

    // 3. Frontend: CloudFront (when enabled)
    let frontend: FrontendConstruct | undefined;
    if (config.features.cloudFrontEnabled) {
      frontend = new FrontendConstruct(this, 'Frontend', {
        config,
        frontendBucket: storage.frontendBucket,
        api: backend.api,
        certificate: props?.certificate,
        domain: props?.domain,
      });
    }

    // M1: Set CORS origin on all Lambdas. In dev (no CloudFront) we keep '*'.
    // In beta/prod the frontend is served from CloudFront — lock the origin.
    const frontendOrigin = frontend
      ? `https://${frontend.distribution.distributionDomainName}`
      : '*';
    for (const fn of [
      backend.challengeFn,
      backend.authFn,
      backend.adminFn,
      backend.vaultFn,
      backend.healthFn,
    ]) {
      fn.addEnvironment('FRONTEND_ORIGIN', frontendOrigin);
    }

    // 4. Monitoring: CloudWatch dashboard + alarms + SNS alerts (prod only)
    let monitoring: MonitoringConstruct | undefined;
    if (config.environment === 'prod') {
      monitoring = new MonitoringConstruct(this, 'Monitoring', {
        config,
        api: backend.api,
        lambdaFunctions: [
          backend.challengeFn,
          backend.authFn,
          backend.adminFn,
          backend.vaultFn,
          backend.healthFn,
        ],
        usersTable: storage.usersTable,
        alertEmail,
      });
    }

    // 5. Kill switch: Lambda concurrency kill + EventBridge auto-recovery
    //
    // Prod: triggered automatically by the sustained-traffic alarm (API GW at
    //   steady-state throttle limit for 3+ minutes). Restores after 4 hours.
    //   Original reserved concurrency: challenge=5, auth=3, admin=2, vault=5, health=2
    //
    // Beta: no CloudWatch alarm — triggered manually by publishing an SNS ALARM
    //   message to the KillSwitchTopicArn stack output. Restores after 3 minutes
    //   (short window suitable for testing). Beta functions have no reserved
    //   concurrency (limit=0 means DeleteFunctionConcurrency on restore).
    if (config.features.killSwitchEnabled) {
      // Beta gets a standalone SNS topic (no alarm subscription).
      // Prod uses the monitoring alertTopic (alarm-connected).
      let killSwitchTopic: sns.Topic;
      if (config.environment === 'beta') {
        killSwitchTopic = new sns.Topic(this, 'KillSwitchTopic', {
          topicName: `passvault-${config.environment}-kill-switch`,
          displayName: `PassVault ${config.environment} Kill Switch`,
        });
        if (alertEmail) {
          killSwitchTopic.addSubscription(new sns_subscriptions.EmailSubscription(alertEmail));
        }
      } else {
        // prod — monitoring must exist
        killSwitchTopic = monitoring!.alertTopic;
      }

      const originalConcurrency =
        config.environment === 'prod' ? [5, 3, 2, 5, 2] : [0, 0, 0, 0, 0];

      new KillSwitchConstruct(this, 'KillSwitch', {
        lambdaFunctions: [
          backend.challengeFn,
          backend.authFn,
          backend.adminFn,
          backend.vaultFn,
          backend.healthFn,
        ],
        originalConcurrency,
        alertTopic: killSwitchTopic,
        logRetentionDays: config.monitoring.logRetentionDays as logs.RetentionDays,
        environment: config.environment,
        reEnableMinutes: config.monitoring.killSwitchReEnableMinutes,
      });
    }

    // Stack outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: backend.api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'UsersTableName', {
      value: storage.usersTable.tableName,
    });

    new cdk.CfnOutput(this, 'FilesBucketName', {
      value: storage.filesBucket.bucketName,
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: storage.frontendBucket.bucketName,
    });

    if (frontend) {
      new cdk.CfnOutput(this, 'CloudFrontUrl', {
        value: `https://${frontend.distribution.distributionDomainName}`,
        description: 'CloudFront distribution URL',
      });
    }

    if (monitoring) {
      new cdk.CfnOutput(this, 'AlertTopicArn', {
        value: monitoring.alertTopic.topicArn,
        description: 'SNS topic for sustained-traffic alarms and cost alerts',
      });
    }

    // Beta: output the kill switch topic ARN so it can be used with `aws sns publish`
    // to manually activate the kill switch during testing.
    if (config.environment === 'beta' && config.features.killSwitchEnabled) {
      new cdk.CfnOutput(this, 'KillSwitchTopicArn', {
        value: `arn:aws:sns:${config.region}:${this.account}:passvault-${config.environment}-kill-switch`,
        description:
          'Publish an ALARM message here to manually activate the kill switch (beta testing)',
      });
    }
  }
}
