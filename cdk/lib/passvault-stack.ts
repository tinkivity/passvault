import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';
import { StorageConstruct } from './constructs/storage.js';
import { BackendConstruct } from './constructs/backend.js';
import { FrontendConstruct } from './constructs/frontend.js';
import { MonitoringConstruct } from './constructs/monitoring.js';
import { KillSwitchConstruct } from './constructs/kill-switch.js';
import { SesNotifierConstruct } from './constructs/ses-notifier.js';

interface PassVaultStackProps extends cdk.StackProps {
  certificate?: acm.ICertificate;
  domain?: string;
  plusAddress?: string;
}

export class PassVaultStack extends cdk.Stack {
  constructor(scope: Construct, id: string, config: EnvironmentConfig, props?: PassVaultStackProps) {
    super(scope, id, props);

    // Precondition reminder — SES domain verification must have completed out-of-band.
    // CDK cannot check this synchronously; the warning fires at synth/deploy time.
    if (props?.domain) {
      console.warn(
        `[passvault-stack] Reminder: "${props.domain}" must be a Verified SES identity ` +
          `in this account/region before \`cdk deploy\`. Run the SES send-email smoke ` +
          `test described in cdk/DEPLOYMENT.md first if you haven't already.`,
      );
    }

    // Admin email — used as the initial administrator username and as the SES alert recipient.
    // Required for all stacks. Provide via:
    //   cdk deploy --context adminEmail=you@example.com
    const adminEmail = this.node.tryGetContext('adminEmail') as string | undefined;
    if (!adminEmail) {
      throw new Error('CDK context variable "adminEmail" is required. Pass --context adminEmail=you@example.com');
    }

    // 1. Storage: DynamoDB + S3 buckets
    const storage = new StorageConstruct(this, 'Storage', config);

    // 2. Backend: Lambdas + API Gateway
    const backend = new BackendConstruct(this, 'Backend', { config, storage, domain: props?.domain });

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
    // FRONTEND_URL is the full URL used by email templates for logo, buttons,
    // and verification links. Prefers the custom domain when configured so that
    // email links point to the user-facing URL, not the raw CloudFront domain.
    // Empty in dev (no CloudFront).
    const frontendUrl = frontend
      ? `https://${frontend.customDomain ?? frontend.distribution.distributionDomainName}`
      : '';
    for (const fn of [
      backend.challengeFn,
      backend.authFn,
      backend.adminAuthFn,
      backend.adminMgmtFn,
      backend.vaultFn,
      backend.healthFn,
      backend.digestFn,
    ]) {
      fn.addEnvironment('FRONTEND_ORIGIN', frontendOrigin);
      fn.addEnvironment('FRONTEND_URL', frontendUrl);
    }

    // 4. Monitoring: CloudWatch dashboard + alarms + SNS topic (prod only)
    let monitoring: MonitoringConstruct | undefined;
    if (config.environment === 'prod') {
      monitoring = new MonitoringConstruct(this, 'Monitoring', {
        config,
        api: backend.api,
        lambdaFunctions: [
          backend.challengeFn,
          backend.authFn,
          backend.adminAuthFn,
          backend.adminMgmtFn,
          backend.vaultFn,
          backend.healthFn,
        ],
        usersTable: storage.usersTable,
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
    let killSwitchTopic: sns.Topic | undefined;
    if (config.features.killSwitchEnabled) {
      // Beta gets a standalone SNS topic (no alarm subscription).
      // Prod uses the monitoring alertTopic (alarm-connected).
      if (config.environment === 'beta') {
        killSwitchTopic = new sns.Topic(this, 'KillSwitchTopic', {
          topicName: `passvault-${config.environment}-kill-switch`,
          displayName: `PassVault ${config.environment} Kill Switch`,
        });
      } else {
        // prod — monitoring must exist
        killSwitchTopic = monitoring!.alertTopic;
      }

      // originalConcurrency order: challenge, auth, admin-auth, admin-mgmt, vault, health
      const originalConcurrency =
        config.environment === 'prod' ? [5, 3, 3, 2, 5, 2] : [0, 0, 0, 0, 0, 0];

      const killSwitchFunctions = [
        backend.challengeFn,
        backend.authFn,
        backend.adminAuthFn,
        backend.adminMgmtFn,
        backend.vaultFn,
        backend.healthFn,
      ];

      new KillSwitchConstruct(this, 'KillSwitch', {
        lambdaFunctions: killSwitchFunctions,
        originalConcurrency,
        alertTopic: killSwitchTopic,
        logRetentionDays: config.monitoring.logRetentionDays as logs.RetentionDays,
        environment: config.environment,
        reEnableMinutes: config.monitoring.killSwitchReEnableMinutes,
        auditEventsTable: storage.auditEventsTable,
      });

      new cdk.CfnOutput(this, 'KillSwitchFunctionNames', {
        value: killSwitchFunctions.map(fn => fn.functionName).join(','),
        description: 'Comma-separated Lambda function names controlled by the kill switch',
      });
      new cdk.CfnOutput(this, 'KillSwitchExpectedConcurrency', {
        value: originalConcurrency.join(','),
        description: 'Comma-separated original reserved concurrency values (0 = unreserved pool)',
      });
    }

    // 6. SES email notifier (beta + prod when domain + alertEmail are provided)
    //
    // Sends alerts from alerts@{subdomain}.{domain}:
    //   prod: alerts@pv.example.com
    //   beta: alerts@beta.pv.example.com
    //
    // Subscribes to whichever SNS topic the environment uses:
    //   prod → monitoring.alertTopic (CloudWatch alarm + budget notifications)
    //   beta → KillSwitchTopic (manual kill switch trigger)
    //
    // All Route53 DNS records (DKIM, SPF, MX, DMARC) are created on deploy
    // and destroyed on cdk destroy.
    if (killSwitchTopic && props?.domain) {
      const senderDomain = `${config.subdomain}.${props.domain}`;
      const sesNotifier = new SesNotifierConstruct(this, 'SesNotifier', {
        topic: killSwitchTopic,
        alertEmail: adminEmail,
        senderDomain,
        rootDomain: props.domain,
        environment: config.environment,
        logRetentionDays: config.monitoring.logRetentionDays as logs.RetentionDays,
      });

      // Grant SES transactional send to admin, auth, vault Lambdas.
      // The ses-notifier Lambda keeps alerts@{senderDomain}; transactional uses noreply@.
      //
      // NOTE: When a recipient address is itself a verified SES identity in the
      // account (e.g. a test address added to bypass sandbox restrictions), SES
      // checks IAM on the recipient identity ARN in addition to the sender ARN.
      // Using a wildcard resource avoids having to enumerate every recipient identity.
      const transactionalSender = `noreply@${senderDomain}`;
      for (const fn of [backend.adminAuthFn, backend.adminMgmtFn, backend.authFn, backend.vaultFn, backend.digestFn]) {
        fn.addToRolePolicy(new iam.PolicyStatement({
          actions: ['ses:SendEmail', 'ses:SendRawEmail'],
          resources: [`arn:aws:ses:${this.region}:${this.account}:identity/*`],
        }));
        fn.addEnvironment('SENDER_EMAIL', transactionalSender);
      }
    }

    // Stack outputs
    new cdk.CfnOutput(this, 'AdminEmail', {
      value: adminEmail,
      description: 'Initial administrator username (email address)',
    });

    // Beta/prod: persist the deploy-time domain and plus-address as stack
    // outputs so scripts/qualify.sh can resume against an already-deployed
    // stack without the operator having to re-pass the same flags.
    if (props?.domain) {
      new cdk.CfnOutput(this, 'Domain', {
        value: props.domain,
        description: 'Root domain passed at deploy time (--context domain=<d>).',
      });
    }
    if (props?.plusAddress) {
      new cdk.CfnOutput(this, 'PlusAddress', {
        value: props.plusAddress,
        description:
          'Qualification mailbox. Scripts build test-user addresses as local+<tag>@domain.',
      });
    }

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
