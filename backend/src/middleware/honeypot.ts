import type { APIGatewayProxyEvent } from 'aws-lambda';
import { error } from '../utils/response.js';
import { config } from '../config.js';

// Detects automated form submissions by checking for hidden decoy fields.
// The login form renders invisible fields named 'email', 'phone', and 'website'
// that legitimate users never see or fill in. Bots that blindly populate all
// form fields will fill these, exposing themselves. Any request that contains
// a value in any of these fields is rejected with a 403.
//
// Silently passes if the request body is not valid JSON (e.g. a non-form request)
// or if honeypotEnabled is false for this environment.
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
