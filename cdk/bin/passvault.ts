#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getEnvironmentConfig } from '@passvault/shared';
import { PassVaultStack } from '../lib/passvault-stack.js';

const app = new cdk.App();

const env = app.node.tryGetContext('env') as string;
if (!env) {
  throw new Error('Missing required context: --context env=dev|beta|prod');
}

const config = getEnvironmentConfig(env);

new PassVaultStack(app, config.stackName, config, {
  env: { region: config.region },
});
