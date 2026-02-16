import type { EnvironmentConfig, EnvironmentName } from '../types/environment.js';

export const devConfig: EnvironmentConfig = {
  stackName: 'PassVault-Dev',
  environment: 'dev',
  region: 'us-east-1',
  adminUsername: 'admin',
  features: {
    totpRequired: false,
    wafEnabled: false,
    powEnabled: false,
    honeypotEnabled: true,
    cloudFrontEnabled: false,
  },
  session: {
    viewModeTimeoutSeconds: 300,
    editModeTimeoutSeconds: 600,
    adminTokenExpiryHours: 24,
    userTokenExpiryMinutes: 30,
  },
  lambda: { memorySize: 256, timeout: 15 },
  monitoring: { logRetentionDays: 7, costAlertThreshold: 20 },
};

export const betaConfig: EnvironmentConfig = {
  stackName: 'PassVault-Beta',
  environment: 'beta',
  region: 'us-east-1',
  adminUsername: 'admin',
  features: {
    totpRequired: false,
    wafEnabled: false,
    powEnabled: true,
    honeypotEnabled: true,
    cloudFrontEnabled: true,
  },
  session: {
    viewModeTimeoutSeconds: 300,
    editModeTimeoutSeconds: 600,
    adminTokenExpiryHours: 24,
    userTokenExpiryMinutes: 30,
  },
  lambda: { memorySize: 256, timeout: 15 },
  monitoring: { logRetentionDays: 14, costAlertThreshold: 20 },
};

export const prodConfig: EnvironmentConfig = {
  stackName: 'PassVault-Prod',
  environment: 'prod',
  region: 'us-east-1',
  adminUsername: 'admin',
  features: {
    totpRequired: true,
    wafEnabled: true,
    powEnabled: true,
    honeypotEnabled: true,
    cloudFrontEnabled: true,
  },
  session: {
    viewModeTimeoutSeconds: 60,
    editModeTimeoutSeconds: 120,
    adminTokenExpiryHours: 8,
    userTokenExpiryMinutes: 5,
  },
  lambda: { memorySize: 512, timeout: 15 },
  monitoring: { logRetentionDays: 30, costAlertThreshold: 20 },
};

const configs: Record<EnvironmentName, EnvironmentConfig> = {
  dev: devConfig,
  beta: betaConfig,
  prod: prodConfig,
};

export function getEnvironmentConfig(env: string): EnvironmentConfig {
  const config = configs[env as EnvironmentName];
  if (!config) {
    throw new Error(`Unknown environment: ${env}. Valid: dev, beta, prod`);
  }
  return config;
}
