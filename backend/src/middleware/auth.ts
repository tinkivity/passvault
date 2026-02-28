import type { APIGatewayProxyEvent } from 'aws-lambda';
import { verifyToken, type TokenPayload } from '../utils/jwt.js';
import { error } from '../utils/response.js';
import { ERRORS } from '@passvault/shared';

// Pulls the raw JWT string out of the Authorization header.
// Expects the standard "Bearer <token>" format; returns null for any other
// format or if the header is absent entirely.
export function extractToken(event: APIGatewayProxyEvent): string | null {
  const header = event.headers?.Authorization || event.headers?.authorization;
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

// Verifies the JWT from the request and returns its decoded payload.
// Returns null instead of throwing if the token is missing, malformed, expired,
// or signed with the wrong secret — callers decide how to handle unauthenticated requests.
export async function authenticate(event: APIGatewayProxyEvent): Promise<TokenPayload | null> {
  const token = extractToken(event);
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

// Gate that enforces authentication. Returns the verified token payload on
// success, or a ready-to-return 401 response if no valid token is present.
// Handlers destructure { user, errorResponse } and return early if errorResponse is set.
export async function requireAuth(event: APIGatewayProxyEvent) {
  const payload = await authenticate(event);
  if (!payload) {
    return { user: null, errorResponse: error(ERRORS.UNAUTHORIZED, 401) };
  }
  return { user: payload, errorResponse: null };
}

// Gate that enforces both authentication and a specific role ('admin' or 'user').
// A valid token with the wrong role gets a 403 rather than a 401, so the client
// knows it is authenticated but not permitted to access this resource.
export async function requireRole(event: APIGatewayProxyEvent, role: 'admin' | 'user') {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return { user: null, errorResponse };
  if (user!.role !== role) {
    return { user: null, errorResponse: error(ERRORS.FORBIDDEN, 403) };
  }
  return { user, errorResponse: null };
}
