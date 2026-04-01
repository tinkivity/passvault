import type { EnvironmentConfig, EnvironmentName } from '../types/environment.js';

export const devConfig: EnvironmentConfig = {
  stackName: 'PassVault-Dev',
  environment: 'dev',
  region: 'eu-central-1',
  subdomain: 'dev.pv',
  features: {
    passkeyRequired: false,
    powEnabled: false,
    honeypotEnabled: true,
    cloudFrontEnabled: false,
    killSwitchEnabled: false,
  },
  session: {
    viewModeTimeoutSeconds: 300,
    editModeTimeoutSeconds: 600,
    adminTokenExpiryHours: 24,
    userTokenExpiryMinutes: 30,
    otpExpiryMinutes: 60,
  },
  lambda: { memorySize: 256, timeout: 15 },
  monitoring: { logRetentionDays: 7, costAlertThreshold: 20, killSwitchReEnableMinutes: 0 },
  throttle: { rateLimit: 10, burstLimit: 20 },
};

export const betaConfig: EnvironmentConfig = {
  stackName: 'PassVault-Beta',
  environment: 'beta',
  region: 'eu-central-1',
  subdomain: 'beta.pv',
  features: {
    passkeyRequired: false,
    powEnabled: true,
    honeypotEnabled: true,
    cloudFrontEnabled: true,
    killSwitchEnabled: true,
  },
  session: {
    viewModeTimeoutSeconds: 300,
    editModeTimeoutSeconds: 600,
    adminTokenExpiryHours: 24,
    userTokenExpiryMinutes: 30,
    otpExpiryMinutes: 10,
  },
  lambda: { memorySize: 256, timeout: 15 },
  monitoring: { logRetentionDays: 14, costAlertThreshold: 20, killSwitchReEnableMinutes: 3 },
  throttle: { rateLimit: 10, burstLimit: 20 },
};

export const prodConfig: EnvironmentConfig = {
  stackName: 'PassVault-Prod',
  environment: 'prod',
  region: 'eu-central-1',
  subdomain: 'pv',
  features: {
    passkeyRequired: true,
    powEnabled: true,
    honeypotEnabled: true,
    cloudFrontEnabled: true,
    killSwitchEnabled: true,
  },
  session: {
    viewModeTimeoutSeconds: 60,
    editModeTimeoutSeconds: 120,
    adminTokenExpiryHours: 8,
    userTokenExpiryMinutes: 5,
    otpExpiryMinutes: 120,
  },
  lambda: { memorySize: 512, timeout: 15 },
  monitoring: { logRetentionDays: 30, costAlertThreshold: 20, killSwitchReEnableMinutes: 240 },
  throttle: { rateLimit: 10, burstLimit: 20 },
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
