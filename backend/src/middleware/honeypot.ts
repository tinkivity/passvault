import type { APIGatewayProxyEvent } from 'aws-lambda';
import { error } from '../utils/response.js';
import { config } from '../config.js';

export function validateHoneypot(event: APIGatewayProxyEvent) {
  if (!config.features.honeypotEnabled) {
    return { valid: true, errorResponse: null };
  }

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { valid: true, errorResponse: null };
  }

  // If hidden honeypot field is filled, it's a bot
  if (body.email || body.phone || body.website) {
    return { valid: false, errorResponse: error('Forbidden', 403) };
  }

  return { valid: true, errorResponse: null };
}
