import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { validatePow } from '../middleware/pow.js';
import { requireAuth } from '../middleware/auth.js';
import { getVault, putVault, downloadVault } from '../services/vault.js';

function parseBody(event: APIGatewayProxyEvent): { body: Record<string, unknown> } | { parseError: APIGatewayProxyResult } {
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

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const path = event.path;
  const method = event.httpMethod;

  try {
    // GET /vault
    if (path === API_PATHS.VAULT && method === 'GET') {
      return await handleGetVault(event);
    }
    // PUT /vault
    if (path === API_PATHS.VAULT && method === 'PUT') {
      return await handlePutVault(event);
    }
    // GET /vault/download
    if (path === API_PATHS.VAULT_DOWNLOAD && method === 'GET') {
      return await handleDownloadVault(event);
    }

    return error('Not found', 404);
  } catch (err) {
    console.error('Vault handler error:', err);
    return error('Internal server error', 500);
  }
}

async function handleGetVault(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await getVault(user!.userId);
  if (result.error) {
    return error(result.error, result.statusCode || 500);
  }
  return success(result.response);
}

async function handlePutVault(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await putVault(user!.userId, parsed.body);
  if (result.error) {
    return error(result.error, result.statusCode || 500);
  }
  return success(result.response);
}

async function handleDownloadVault(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await downloadVault(user!.userId);
  if (result.error) {
    return error(result.error, result.statusCode || 500);
  }
  return success(result.response);
}
