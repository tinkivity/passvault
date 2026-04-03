import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { error } from './response.js';
import { validatePow } from '../middleware/pow.js';
import { validateHoneypot } from '../middleware/honeypot.js';
import { requireAuth, requireAdminActive } from '../middleware/auth.js';

// Middleware returns null to continue to the next step, or a response to short-circuit.
export type Middleware = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult | null>;

// Handler receives the event plus path parameters extracted by API Gateway.
export type RouteHandler = (
  event: APIGatewayProxyEvent,
  params: Record<string, string>
) => Promise<APIGatewayProxyResult>;

interface Route {
  method: string;
  pathTemplate: string;
  middlewares: Middleware[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  private add(method: string, path: string, middlewares: Middleware[], handler: RouteHandler) {
    this.routes.push({ method, pathTemplate: path, middlewares, handler });
  }

  get(path: string, middlewares: Middleware[], handler: RouteHandler) {
    this.add('GET', path, middlewares, handler);
  }
  post(path: string, middlewares: Middleware[], handler: RouteHandler) {
    this.add('POST', path, middlewares, handler);
  }
  put(path: string, middlewares: Middleware[], handler: RouteHandler) {
    this.add('PUT', path, middlewares, handler);
  }
  patch(path: string, middlewares: Middleware[], handler: RouteHandler) {
    this.add('PATCH', path, middlewares, handler);
  }
  delete(path: string, middlewares: Middleware[], handler: RouteHandler) {
    this.add('DELETE', path, middlewares, handler);
  }

  async dispatch(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    // API Gateway populates pathParameters for {param} segments it was configured with.
    // For static paths the object is null; default to empty so handlers always get a record.
    const params: Record<string, string> = (event.pathParameters as Record<string, string>) ?? {};

    try {
      for (const route of this.routes) {
        if (route.method !== event.httpMethod) continue;
        if (!matchPath(route.pathTemplate, event.path)) continue;

        for (const mw of route.middlewares) {
          const result = await mw(event);
          if (result !== null) return result;
        }

        return await route.handler(event, params);
      }

      return error('Not found', 404);
    } catch (err) {
      console.error('Router dispatch error:', err);
      return error('Internal server error', 500);
    }
  }
}

// Converts an API Gateway path template like '/api/vaults/{vaultId}/download'
// into a regex that matches the actual runtime path. Static segments are matched
// literally; {param} segments match any non-slash sequence.
// Routes registered before parameterized ones take precedence because we iterate
// in insertion order — register static paths first to avoid ambiguity.
function matchPath(template: string, actual: string): boolean {
  const pattern = template.replace(/\{[^}]+\}/g, '[^/]+');
  return new RegExp(`^${pattern}$`).test(actual);
}

// ── Middleware adapter factories ──────────────────────────────────────────────
// These wrap the existing middleware functions into the Middleware signature so
// they can be used declaratively in route definitions.

export const pow =
  (difficulty: number): Middleware =>
  async (event) => {
    const { valid, errorResponse } = validatePow(event, difficulty);
    return valid ? null : errorResponse;
  };

export const honeypot = (): Middleware => async (event) => {
  const { valid, errorResponse } = validateHoneypot(event);
  return valid ? null : errorResponse;
};

export const auth = (): Middleware => async (event) => {
  const { errorResponse } = await requireAuth(event);
  return errorResponse;
};

export const adminActive = (): Middleware => async (event) => {
  const { errorResponse } = await requireAdminActive(event);
  return errorResponse;
};
