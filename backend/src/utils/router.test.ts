import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { Router } from './router.js';

function makeEvent(method: string, path: string, pathParameters: Record<string, string> | null = null): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    path,
    pathParameters,
    headers: {},
    body: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    multiValueHeaders: {},
    isBase64Encoded: false,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    stageVariables: null,
  };
}

const okResponse = { statusCode: 200, headers: {}, body: '{"success":true}' };
const middlewareBlock = { statusCode: 403, headers: {}, body: '{"error":"blocked"}' };

describe('Router', () => {
  describe('method matching', () => {
    it('routes GET to the correct handler', async () => {
      const router = new Router();
      const handler = vi.fn().mockResolvedValue(okResponse);
      router.get('/api/test', [], handler);
      const result = await router.dispatch(makeEvent('GET', '/api/test'));
      expect(result.statusCode).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('returns 404 when method does not match', async () => {
      const router = new Router();
      router.get('/api/test', [], vi.fn().mockResolvedValue(okResponse));
      const result = await router.dispatch(makeEvent('POST', '/api/test'));
      expect(result.statusCode).toBe(404);
    });
  });

  describe('path matching', () => {
    it('matches exact static path', async () => {
      const router = new Router();
      const handler = vi.fn().mockResolvedValue(okResponse);
      router.get('/api/auth/login', [], handler);
      const result = await router.dispatch(makeEvent('GET', '/api/auth/login'));
      expect(result.statusCode).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('returns 404 for unregistered path', async () => {
      const router = new Router();
      router.get('/api/auth/login', [], vi.fn().mockResolvedValue(okResponse));
      const result = await router.dispatch(makeEvent('GET', '/api/auth/logout'));
      expect(result.statusCode).toBe(404);
    });

    it('matches parameterized path', async () => {
      const router = new Router();
      const handler = vi.fn().mockResolvedValue(okResponse);
      router.get('/api/vaults/{vaultId}', [], handler);
      const result = await router.dispatch(makeEvent('GET', '/api/vaults/abc-123'));
      expect(result.statusCode).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('does not match parameterized path with extra segments', async () => {
      const router = new Router();
      router.get('/api/vaults/{vaultId}', [], vi.fn().mockResolvedValue(okResponse));
      const result = await router.dispatch(makeEvent('GET', '/api/vaults/abc-123/extra'));
      expect(result.statusCode).toBe(404);
    });

    it('static path takes precedence over parameterized when registered first', async () => {
      const router = new Router();
      const staticHandler = vi.fn().mockResolvedValue({ ...okResponse, statusCode: 200 });
      const paramHandler = vi.fn().mockResolvedValue({ ...okResponse, statusCode: 201 });
      router.get('/api/vaults/notifications', [], staticHandler);
      router.get('/api/vaults/{vaultId}', [], paramHandler);
      const result = await router.dispatch(makeEvent('GET', '/api/vaults/notifications'));
      expect(result.statusCode).toBe(200);
      expect(staticHandler).toHaveBeenCalledOnce();
      expect(paramHandler).not.toHaveBeenCalled();
    });
  });

  describe('middleware', () => {
    it('calls middleware before handler', async () => {
      const router = new Router();
      const order: string[] = [];
      const mw = vi.fn().mockImplementation(async () => { order.push('mw'); return null; });
      const handler = vi.fn().mockImplementation(async () => { order.push('handler'); return okResponse; });
      router.get('/api/test', [mw], handler);
      await router.dispatch(makeEvent('GET', '/api/test'));
      expect(order).toEqual(['mw', 'handler']);
    });

    it('short-circuits when middleware returns a response', async () => {
      const router = new Router();
      const blockingMw = vi.fn().mockResolvedValue(middlewareBlock);
      const handler = vi.fn().mockResolvedValue(okResponse);
      router.get('/api/test', [blockingMw], handler);
      const result = await router.dispatch(makeEvent('GET', '/api/test'));
      expect(result.statusCode).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('stops at first blocking middleware in a chain', async () => {
      const router = new Router();
      const mw1 = vi.fn().mockResolvedValue(middlewareBlock);
      const mw2 = vi.fn().mockResolvedValue(null);
      const handler = vi.fn().mockResolvedValue(okResponse);
      router.get('/api/test', [mw1, mw2], handler);
      await router.dispatch(makeEvent('GET', '/api/test'));
      expect(mw1).toHaveBeenCalledOnce();
      expect(mw2).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('passes through all middleware when none block', async () => {
      const router = new Router();
      const mw1 = vi.fn().mockResolvedValue(null);
      const mw2 = vi.fn().mockResolvedValue(null);
      const handler = vi.fn().mockResolvedValue(okResponse);
      router.get('/api/test', [mw1, mw2], handler);
      const result = await router.dispatch(makeEvent('GET', '/api/test'));
      expect(result.statusCode).toBe(200);
      expect(mw1).toHaveBeenCalledOnce();
      expect(mw2).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('path parameter extraction', () => {
    it('passes event.pathParameters to the handler', async () => {
      const router = new Router();
      let receivedParams: Record<string, string> = {};
      router.get('/api/vaults/{vaultId}', [], async (_event, params) => {
        receivedParams = params;
        return okResponse;
      });
      await router.dispatch(makeEvent('GET', '/api/vaults/vault-xyz', { vaultId: 'vault-xyz' }));
      expect(receivedParams).toEqual({ vaultId: 'vault-xyz' });
    });

    it('passes empty params object when pathParameters is null', async () => {
      const router = new Router();
      let receivedParams: Record<string, string> = { sentinel: 'value' };
      router.get('/api/health', [], async (_event, params) => {
        receivedParams = params;
        return okResponse;
      });
      await router.dispatch(makeEvent('GET', '/api/health', null));
      expect(receivedParams).toEqual({});
    });
  });

  describe('error handling', () => {
    it('returns 500 when handler throws', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const router = new Router();
      router.get('/api/test', [], async () => { throw new Error('boom'); });
      const result = await router.dispatch(makeEvent('GET', '/api/test'));
      expect(result.statusCode).toBe(500);
    });
  });
});
