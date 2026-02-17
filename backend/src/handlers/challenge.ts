import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { POW_CONFIG } from '@passvault/shared';
import { generateChallenge } from '../services/challenge.js';
import { success } from '../utils/response.js';

export async function handler(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const challenge = generateChallenge(POW_CONFIG.DIFFICULTY.LOW);
  return success(challenge);
}
