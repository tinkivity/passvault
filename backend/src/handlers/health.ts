import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { success } from '../utils/response.js';
import { config } from '../config.js';

export async function handler(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return success({
    status: 'ok',
    environment: config.environment,
    timestamp: new Date().toISOString(),
  });
}
