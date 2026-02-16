import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';

export class StorageConstruct extends Construct {
  public readonly usersTable: dynamodb.Table;
  public readonly filesBucket: s3.Bucket;
  public readonly configBucket: s3.Bucket;
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

    // S3: encrypted user vault files
    this.filesBucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: undefined, // auto-generated with random suffix
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: env === 'prod',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    // S3: config bucket (admin initial password)
    this.configBucket = new s3.Bucket(this, 'ConfigBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

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
