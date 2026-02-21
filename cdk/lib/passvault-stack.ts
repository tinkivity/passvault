import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';
import { StorageConstruct } from './constructs/storage.js';
import { BackendConstruct } from './constructs/backend.js';
import { SecurityConstruct } from './constructs/security.js';
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

    // 3. Security: WAF (prod only)
    let security: SecurityConstruct | undefined;
    if (config.features.wafEnabled) {
      security = new SecurityConstruct(this, 'Security', config);
    }

    // 4. Frontend: CloudFront (when enabled)
    let frontend: FrontendConstruct | undefined;
    if (config.features.cloudFrontEnabled) {
      frontend = new FrontendConstruct(this, 'Frontend', {
        config,
        frontendBucket: storage.frontendBucket,
        api: backend.api,
        webAcl: security?.webAcl,
        certificate: props?.certificate,
        domain: props?.domain,
      });
    }

    // 5. Monitoring: CloudWatch dashboard + alarms + SNS alerts (prod only)
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

    // 6. Kill switch: WAF flip Lambda + SNS subscription (prod only, requires WAF + monitoring)
    if (security && monitoring) {
      new KillSwitchConstruct(this, 'KillSwitch', {
        webAcl: security.webAcl,
        alertTopic: monitoring.alertTopic,
        logRetentionDays: config.monitoring.logRetentionDays as logs.RetentionDays,
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
        description: 'SNS topic for traffic spike alarms and cost alerts',
      });
    }
  }
}
