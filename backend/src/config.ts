import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { getEnvironmentConfig, type EnvironmentConfig } from '@passvault/shared';

const env = process.env.ENVIRONMENT || 'dev';

export const config: EnvironmentConfig = getEnvironmentConfig(env);

export const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || `passvault-users-${env}`;
export const FILES_BUCKET = process.env.FILES_BUCKET || `passvault-files-${env}`;

let jwtSecretCache: string | undefined;

export async function getJwtSecret(): Promise<string> {
  if (jwtSecretCache) return jwtSecretCache;
  const paramName = process.env.JWT_SECRET_PARAM;
  if (!paramName) throw new Error('JWT_SECRET_PARAM env var is required');
  const ssm = new SSMClient({});
  const res = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
  if (!res.Parameter?.Value) throw new Error('JWT secret not found in SSM');
  jwtSecretCache = res.Parameter.Value;
  return jwtSecretCache;
}
