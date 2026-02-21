export type EnvironmentName = 'dev' | 'beta' | 'prod';

export interface FeatureFlags {
  totpRequired: boolean;
  wafEnabled: boolean;
  powEnabled: boolean;
  honeypotEnabled: boolean;
  cloudFrontEnabled: boolean;
}

export interface SessionConfig {
  viewModeTimeoutSeconds: number;
  editModeTimeoutSeconds: number;
  adminTokenExpiryHours: number;
  userTokenExpiryMinutes: number;
}

export interface LambdaConfig {
  memorySize: number;
  timeout: number;
}

export interface MonitoringConfig {
  logRetentionDays: number;
  costAlertThreshold: number;
}

export interface EnvironmentConfig {
  stackName: string;
  environment: EnvironmentName;
  region: string;
  subdomain: string;
  adminUsername: string;
  features: FeatureFlags;
  session: SessionConfig;
  lambda: LambdaConfig;
  monitoring: MonitoringConfig;
}
