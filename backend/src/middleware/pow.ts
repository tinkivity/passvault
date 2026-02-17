import { createHash } from 'crypto';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { POW_HEADERS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { error } from '../utils/response.js';
import { config } from '../config.js';

export function validatePow(event: APIGatewayProxyEvent, difficulty: number) {
  if (!config.features.powEnabled) {
    return { valid: true, errorResponse: null };
  }

  const solution = event.headers?.[POW_HEADERS.SOLUTION] || event.headers?.['X-Pow-Solution'];
  const nonce = event.headers?.[POW_HEADERS.NONCE] || event.headers?.['X-Pow-Nonce'];
  const timestamp = event.headers?.[POW_HEADERS.TIMESTAMP] || event.headers?.['X-Pow-Timestamp'];

  if (!solution || !nonce || !timestamp) {
    return { valid: false, errorResponse: error(ERRORS.POW_REQUIRED, 403) };
  }

  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - ts > POW_CONFIG.CHALLENGE_TTL_SECONDS) {
    return { valid: false, errorResponse: error(ERRORS.POW_EXPIRED, 403) };
  }

  const hash = createHash('sha256')
    .update(nonce + solution + timestamp)
    .digest('hex');

  const target = '0'.repeat(difficulty) + 'f'.repeat(64 - difficulty);
  if (hash >= target) {
    return { valid: false, errorResponse: error(ERRORS.POW_INVALID, 403) };
  }

  return { valid: true, errorResponse: null };
}
