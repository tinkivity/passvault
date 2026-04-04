export type EnvironmentName = 'dev' | 'beta' | 'prod';

export interface FeatureFlags {
  passkeyRequired: boolean;
  powEnabled: boolean;
  honeypotEnabled: boolean;
  cloudFrontEnabled: boolean;
  killSwitchEnabled: boolean;
}

export interface ThrottleConfig {
  /** Sustained request rate limit (req/s) applied at the API Gateway stage level. */
  rateLimit: number;
  /** Burst request rate limit (req/s) applied at the API Gateway stage level. */
  burstLimit: number;
}

export interface SessionConfig {
  sessionTimeoutSeconds: number;
  vaultTimeoutSeconds: number;
  adminTokenExpiryHours: number;
  userTokenExpiryMinutes: number;
  otpExpiryMinutes: number;
}

export interface LambdaConfig {
  memorySize: number;
  timeout: number;
}

export interface MonitoringConfig {
  logRetentionDays: number;
  costAlertThreshold: number;
  /** How many minutes after kill switch activates before Lambda concurrency is auto-restored. */
  killSwitchReEnableMinutes: number;
}

export interface EnvironmentConfig {
  stackName: string;
  environment: EnvironmentName;
  region: string;
  subdomain: string;
  features: FeatureFlags;
  session: SessionConfig;
  lambda: LambdaConfig;
  monitoring: MonitoringConfig;
  throttle: ThrottleConfig;
}
