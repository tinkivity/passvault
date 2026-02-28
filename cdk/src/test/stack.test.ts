import { describe, it, expect, beforeEach } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PassVaultStack } from '../../lib/passvault-stack.js';
import { devConfig } from '@passvault/shared';

function makeDevTemplate() {
  const app = new App();
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

  it('creates no WAF WebACL (wafEnabled=false in dev)', () => {
    template.resourceCountIs('AWS::WAFv2::WebACL', 0);
  });

  it('creates no CloudFront distribution (cloudFrontEnabled=false in dev)', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 0);
  });

  it('creates no SNS alert topic (monitoring is prod-only)', () => {
    template.resourceCountIs('AWS::SNS::Topic', 0);
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
});
