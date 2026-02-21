#!/usr/bin/env node
import 'source-map-support/register';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cdk from 'aws-cdk-lib';
import { getEnvironmentConfig } from '@passvault/shared';
import { CertificateStack } from '../lib/certificate-stack.js';
import { PassVaultStack } from '../lib/passvault-stack.js';

const app = new cdk.App();

const env = app.node.tryGetContext('env') as string;
if (!env) {
  throw new Error('Missing required context: --context env=dev|beta|prod');
}

const domain = app.node.tryGetContext('domain') as string | undefined;
const config = getEnvironmentConfig(env);

let certificate: acm.ICertificate | undefined;
if (config.features.cloudFrontEnabled && domain) {
  const certStack = new CertificateStack(app, `${config.stackName}-Cert`, {
    env: { region: 'us-east-1' },
    crossRegionReferences: true,
    domain,
    subdomain: config.subdomain,
  });
  certificate = certStack.certificate;
}

new PassVaultStack(app, config.stackName, config, {
  env: { region: config.region },
  crossRegionReferences: true,
  certificate,
  domain,
});
