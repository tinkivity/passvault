import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';
import { StorageConstruct } from './constructs/storage.js';
import { BackendConstruct } from './constructs/backend.js';
import { SecurityConstruct } from './constructs/security.js';
import { FrontendConstruct } from './constructs/frontend.js';
import { MonitoringConstruct } from './constructs/monitoring.js';

export class PassVaultStack extends cdk.Stack {
  constructor(scope: Construct, id: string, config: EnvironmentConfig, props?: cdk.StackProps) {
    super(scope, id, props);

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
      });
    }

    // 5. Monitoring: CloudWatch dashboard + alarms (prod only)
    if (config.environment === 'prod') {
      new MonitoringConstruct(this, 'Monitoring', {
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

    new cdk.CfnOutput(this, 'ConfigBucketName', {
      value: storage.configBucket.bucketName,
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
  }
}
