import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';

export class StorageConstruct extends Construct {
  public readonly usersTable: dynamodb.Table;
  public readonly loginEventsTable: dynamodb.Table;
  public readonly vaultsTable: dynamodb.Table;
  public readonly passkeyCredentialsTable: dynamodb.Table;
  public readonly filesBucket: s3.Bucket;
  public readonly frontendBucket: s3.Bucket;

  constructor(scope: Construct, id: string, config: EnvironmentConfig) {
    super(scope, id);

    const env = config.environment;

    // DynamoDB users table
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `passvault-users-${env}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: env === 'prod' ? { pointInTimeRecoveryEnabled: true } : undefined,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'username-index',
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
    });

    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'registrationToken-index',
      partitionKey: { name: 'registrationToken', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['userId', 'status', 'registrationTokenExpiresAt', 'username'],
    });

    // DynamoDB login events table (for admin dashboard metrics)
    // TTL auto-expires records after 90 days to keep costs minimal.
    this.loginEventsTable = new dynamodb.Table(this, 'LoginEventsTable', {
      tableName: `passvault-login-events-${env}`,
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB vaults table (multi-vault support)
    this.vaultsTable = new dynamodb.Table(this, 'VaultsTable', {
      tableName: `passvault-vaults-${env}`,
      partitionKey: { name: 'vaultId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.vaultsTable.addGlobalSecondaryIndex({
      indexName: 'byUser',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });

    // DynamoDB passkey credentials table (multi-passkey support)
    this.passkeyCredentialsTable = new dynamodb.Table(this, 'PasskeyCredentialsTable', {
      tableName: `passvault-passkey-credentials-${env}`,
      partitionKey: { name: 'credentialId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.passkeyCredentialsTable.addGlobalSecondaryIndex({
      indexName: 'byUser',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });

    // S3: encrypted user vault files
    this.filesBucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: undefined, // auto-generated with random suffix
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: env === 'prod',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
    });
    // Prod: keep only the last 3 noncurrent versions of vault files
    if (env === 'prod') {
      this.filesBucket.addLifecycleRule({
        noncurrentVersionExpiration: cdk.Duration.days(1),
        noncurrentVersionsToRetain: 3,
      });
    }
    // Explicit tag so cleanup.sh can find this bucket after `cdk destroy`.
    // CloudFormation's automatic aws:cloudformation:* tags are removed from
    // retained resources on stack deletion; this custom tag is not.
    cdk.Tags.of(this.filesBucket).add('passvault:env', env);

    // S3: frontend static assets
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });
  }
}
