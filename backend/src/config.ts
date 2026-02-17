import { getEnvironmentConfig, type EnvironmentConfig } from '@passvault/shared';

const env = process.env.ENVIRONMENT || 'dev';

export const config: EnvironmentConfig = getEnvironmentConfig(env);

export const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || `passvault-users-${env}`;
export const FILES_BUCKET = process.env.FILES_BUCKET || `passvault-files-${env}`;
export const CONFIG_BUCKET = process.env.CONFIG_BUCKET || `passvault-config-${env}`;
export const JWT_SECRET = process.env.JWT_SECRET || `passvault-jwt-secret-${env}`;
