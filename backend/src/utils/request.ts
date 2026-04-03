import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { error } from './response.js';

export function parseBody(
  event: APIGatewayProxyEvent
): { body: Record<string, unknown> } | { parseError: APIGatewayProxyResult } {
  try {
    const parsed = JSON.parse(event.body || '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { parseError: error('Invalid request body', 400) };
    }
    return { body: parsed as Record<string, unknown> };
  } catch {
    return { parseError: error('Invalid JSON', 400) };
  }
}
