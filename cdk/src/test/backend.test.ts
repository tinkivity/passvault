import { describe, it, expect, beforeEach } from 'vitest';
import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { StorageConstruct } from '../../lib/constructs/storage.js';
import { BackendConstruct } from '../../lib/constructs/backend.js';
import { devConfig, prodConfig } from '@passvault/shared';

function makeStack() {
  const app = new App();
  return new Stack(app, 'TestStack', {
    env: { account: '123456789012', region: 'eu-central-1' },
  });
}

function makeTemplate(config: typeof devConfig) {
  const stack = makeStack();
  const storage = new StorageConstruct(stack, 'Storage', config);
  new BackendConstruct(stack, 'Backend', { config, storage });
  return Template.fromStack(stack);
}

describe('BackendConstruct (dev)', () => {
  let template: Template;

  beforeEach(() => {
    template = makeTemplate(devConfig);
  });

  it('creates all 5 named Lambda functions', () => {
    for (const name of ['challenge', 'auth', 'admin', 'vault', 'health']) {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: `passvault-${name}-dev`,
      });
    }
  });

  it('deploys Lambdas with nodejs22.x runtime', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-challenge-dev',
      Runtime: 'nodejs22.x',
    });
  });

  it('deploys Lambdas with ARM64 architecture', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-challenge-dev',
      Architectures: ['arm64'],
    });
  });

  it('gives challenge Lambda 256 MB memory', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-challenge-dev',
      MemorySize: 256,
    });
  });

  it('gives health Lambda 128 MB memory', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-health-dev',
      MemorySize: 128,
    });
  });

  it('gives auth Lambda the default config memory (256 MB in dev)', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-auth-dev',
      MemorySize: devConfig.lambda.memorySize,
    });
  });

  it('sets JWT_SECRET_PARAM on auth Lambda', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-auth-dev',
      Environment: {
        Variables: Match.objectLike({
          JWT_SECRET_PARAM: '/passvault/dev/jwt-secret',
        }),
      },
    });
  });

  it('sets JWT_SECRET_PARAM on admin Lambda', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-admin-dev',
      Environment: {
        Variables: Match.objectLike({
          JWT_SECRET_PARAM: '/passvault/dev/jwt-secret',
        }),
      },
    });
  });

  it('sets JWT_SECRET_PARAM on vault Lambda', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-vault-dev',
      Environment: {
        Variables: Match.objectLike({
          JWT_SECRET_PARAM: '/passvault/dev/jwt-secret',
        }),
      },
    });
  });

  it('does not set JWT_SECRET_PARAM on challenge Lambda', () => {
    const fns = template.findResources('AWS::Lambda::Function', {
      Properties: { FunctionName: 'passvault-challenge-dev' },
    });
    const fn = Object.values(fns)[0];
    const vars = (fn.Properties.Environment as { Variables?: Record<string, unknown> } | undefined)?.Variables ?? {};
    expect(vars['JWT_SECRET_PARAM']).toBeUndefined();
  });

  it('does not set reserved concurrency on any Lambda in dev', () => {
    const allLambdas = Object.values(template.findResources('AWS::Lambda::Function'));
    for (const fn of allLambdas) {
      expect(fn.Properties.ReservedConcurrentExecutions).toBeUndefined();
    }
  });

  it('creates a RestApi named passvault-api-dev', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'passvault-api-dev',
    });
  });

  it('sets stage throttling burst=20 rate=10', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      MethodSettings: Match.arrayWith([
        Match.objectLike({
          ThrottlingBurstLimit: 20,
          ThrottlingRateLimit: 10,
        }),
      ]),
    });
  });
});

describe('BackendConstruct (prod)', () => {
  let template: Template;

  beforeEach(() => {
    template = makeTemplate(prodConfig);
  });

  it('uses 512 MB memory for auth Lambda in prod', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-auth-prod',
      MemorySize: prodConfig.lambda.memorySize,
    });
  });

  it('sets challenge reserved concurrency to 5 in prod', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-challenge-prod',
      ReservedConcurrentExecutions: 5,
    });
  });

  it('sets auth reserved concurrency to 3 in prod', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-auth-prod',
      ReservedConcurrentExecutions: 3,
    });
  });

  it('sets admin reserved concurrency to 2 in prod', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-admin-prod',
      ReservedConcurrentExecutions: 2,
    });
  });

  it('sets vault reserved concurrency to 5 in prod', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-vault-prod',
      ReservedConcurrentExecutions: 5,
    });
  });

  it('sets health reserved concurrency to 2 in prod', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'passvault-health-prod',
      ReservedConcurrentExecutions: 2,
    });
  });
});
