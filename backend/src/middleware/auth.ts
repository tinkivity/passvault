import type { APIGatewayProxyEvent } from 'aws-lambda';
import { verifyToken, type TokenPayload } from '../utils/jwt.js';
import { error } from '../utils/response.js';
import { ERRORS } from '@passvault/shared';

export function extractToken(event: APIGatewayProxyEvent): string | null {
  const header = event.headers?.Authorization || event.headers?.authorization;
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

export async function authenticate(event: APIGatewayProxyEvent): Promise<TokenPayload | null> {
  const token = extractToken(event);
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function requireAuth(event: APIGatewayProxyEvent) {
  const payload = await authenticate(event);
  if (!payload) {
    return { user: null, errorResponse: error(ERRORS.UNAUTHORIZED, 401) };
  }
  return { user: payload, errorResponse: null };
}

export async function requireRole(event: APIGatewayProxyEvent, role: 'admin' | 'user') {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return { user: null, errorResponse };
  if (user!.role !== role) {
    return { user: null, errorResponse: error(ERRORS.FORBIDDEN, 403) };
  }
  return { user, errorResponse: null };
}
