import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { validatePow } from '../middleware/pow.js';
import { requireAuth } from '../middleware/auth.js';
import { getVault, putVault, downloadVault } from '../services/vault.js';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const path = event.path;
  const method = event.httpMethod;

  try {
    // GET /vault
    if (path === API_PATHS.VAULT && method === 'GET') {
      return handleGetVault(event);
    }
    // PUT /vault
    if (path === API_PATHS.VAULT && method === 'PUT') {
      return handlePutVault(event);
    }
    // GET /vault/download
    if (path === API_PATHS.VAULT_DOWNLOAD && method === 'GET') {
      return handleDownloadVault(event);
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

  const body = JSON.parse(event.body || '{}');
  const result = await putVault(user!.userId, body);
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
