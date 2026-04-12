import { describe, it, expect, beforeEach } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PassVaultStack } from '../../lib/passvault-stack.js';
import { validatePlusAddressContext } from '../../lib/validate-context.js';
import { devConfig, betaConfig } from '@passvault/shared';

function makeDevTemplate() {
  const app = new App({ context: { adminEmail: 'admin@example.com' } });
  const stack = new PassVaultStack(app, 'TestStack', devConfig, {
    env: { account: '123456789012', region: 'eu-central-1' },
  });
  return Template.fromStack(stack);
}

describe('PassVaultStack (dev)', () => {
  let template: Template;

  beforeEach(() => {
    template = makeDevTemplate();
  });

  it('creates no WAF WebACL (not managed by CDK — CloudFront flat-rate plan used instead)', () => {
    template.resourceCountIs('AWS::WAFv2::WebACL', 0);
  });

  it('creates no CloudFront distribution (cloudFrontEnabled=false in dev)', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 0);
  });

  it('creates no SNS topic (killSwitchEnabled=false and monitoring disabled in dev)', () => {
    template.resourceCountIs('AWS::SNS::Topic', 0);
  });

  it('outputs the AdminEmail', () => {
    template.hasOutput('AdminEmail', {});
  });

  it('outputs the ApiUrl', () => {
    template.hasOutput('ApiUrl', {});
  });

  it('outputs the UsersTableName', () => {
    template.hasOutput('UsersTableName', {});
  });

  it('outputs the FilesBucketName', () => {
    template.hasOutput('FilesBucketName', {});
  });

  it('outputs the FrontendBucketName', () => {
    template.hasOutput('FrontendBucketName', {});
  });

  it('does not output CloudFrontUrl in dev', () => {
    const outputs = template.findOutputs('CloudFrontUrl');
    expect(Object.keys(outputs)).toHaveLength(0);
  });

  it('does not output AlertTopicArn in dev', () => {
    const outputs = template.findOutputs('AlertTopicArn');
    expect(Object.keys(outputs)).toHaveLength(0);
  });

  it('does not output PlusAddress when plusAddress prop is unset', () => {
    const outputs = template.findOutputs('PlusAddress');
    expect(Object.keys(outputs)).toHaveLength(0);
  });
});

describe('validatePlusAddressContext', () => {
  it('accepts unset plusAddress (dev path)', () => {
    expect(() => validatePlusAddressContext({})).not.toThrow();
    expect(() => validatePlusAddressContext({ domain: 'example.com' })).not.toThrow();
  });

  it('rejects plusAddress without domain', () => {
    expect(() =>
      validatePlusAddressContext({ plusAddress: 'ops@example.com' }),
    ).toThrow(/requires "domain"/);
  });

  it('rejects malformed plusAddress', () => {
    expect(() =>
      validatePlusAddressContext({ domain: 'example.com', plusAddress: 'not-an-email' }),
    ).toThrow(/valid email/);
  });

  it('rejects plusAddress whose domain mismatches domain context', () => {
    expect(() =>
      validatePlusAddressContext({ domain: 'example.com', plusAddress: 'ops@other.com' }),
    ).toThrow(/must match "domain" context/);
  });

  it('accepts matching plusAddress + domain', () => {
    expect(() =>
      validatePlusAddressContext({ domain: 'example.com', plusAddress: 'ops@example.com' }),
    ).not.toThrow();
  });
});

describe('PassVaultStack — plusAddress plumbing', () => {
  it('emits PlusAddress and Domain CfnOutputs when both are set', () => {
    const app = new App({ context: { adminEmail: 'admin@example.com' } });
    const stack = new PassVaultStack(app, 'TestStackPlus', betaConfig, {
      env: { account: '123456789012', region: 'eu-central-1' },
      domain: 'example.com',
      plusAddress: 'ops@example.com',
    });
    const template = Template.fromStack(stack);
    template.hasOutput('PlusAddress', { Value: 'ops@example.com' });
    template.hasOutput('Domain', { Value: 'example.com' });
  });
});
