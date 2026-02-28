import { describe, it, expect, beforeEach } from 'vitest';
import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { StorageConstruct } from '../../lib/constructs/storage.js';
import { devConfig, prodConfig } from '@passvault/shared';

function makeStack() {
  const app = new App();
  return new Stack(app, 'TestStack', {
    env: { account: '123456789012', region: 'eu-central-1' },
  });
}

describe('StorageConstruct (dev)', () => {
  let template: Template;

  beforeEach(() => {
    const stack = makeStack();
    new StorageConstruct(stack, 'Storage', devConfig);
    template = Template.fromStack(stack);
  });

  it('creates a DynamoDB table named passvault-users-dev', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'passvault-users-dev',
    });
  });

  it('uses PAY_PER_REQUEST billing', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('creates the username GSI', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'username-index',
          KeySchema: Match.arrayWith([
            Match.objectLike({ AttributeName: 'username', KeyType: 'HASH' }),
          ]),
        }),
      ]),
    });
  });

  it('retains the DynamoDB table on stack deletion', () => {
    const tables = template.findResources('AWS::DynamoDB::Table');
    const table = Object.values(tables)[0];
    expect(table.DeletionPolicy).toBe('Retain');
  });

  it('does not enable PITR in dev', () => {
    const tables = template.findResources('AWS::DynamoDB::Table', {
      Properties: { TableName: 'passvault-users-dev' },
    });
    const table = Object.values(tables)[0];
    expect(table.Properties.PointInTimeRecoverySpecification).toBeUndefined();
  });

  it('does not enable versioning on S3 buckets in dev', () => {
    const versioned = template.findResources('AWS::S3::Bucket', {
      Properties: { VersioningConfiguration: { Status: 'Enabled' } },
    });
    expect(Object.keys(versioned)).toHaveLength(0);
  });

  it('creates exactly 2 S3 buckets', () => {
    template.resourceCountIs('AWS::S3::Bucket', 2);
  });

  it('blocks all public access on S3 buckets', () => {
    const publicBuckets = template.findResources('AWS::S3::Bucket', {
      Properties: {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
        },
      },
    });
    expect(Object.keys(publicBuckets)).toHaveLength(0);
  });
});

describe('StorageConstruct (prod)', () => {
  let template: Template;

  beforeEach(() => {
    const stack = makeStack();
    new StorageConstruct(stack, 'Storage', prodConfig);
    template = Template.fromStack(stack);
  });

  it('creates a DynamoDB table named passvault-users-prod', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'passvault-users-prod',
    });
  });

  it('enables PITR in prod', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });
  });

  it('enables versioning on exactly one S3 bucket in prod', () => {
    const versioned = template.findResources('AWS::S3::Bucket', {
      Properties: { VersioningConfiguration: { Status: 'Enabled' } },
    });
    expect(Object.keys(versioned)).toHaveLength(1);
  });
});
