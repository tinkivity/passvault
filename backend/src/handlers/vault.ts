import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { validatePow } from '../middleware/pow.js';
import { requireAuth } from '../middleware/auth.js';
import {
  listVaults,
  createVault,
  deleteVault,
  renameVault,
  getVault,
  putVault,
  downloadVault,
  sendVaultEmail,
  getWarningCodes,
} from '../services/vault.js';

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

/** Extract vaultId from paths like /api/vault/{vaultId} or /api/vaults/{vaultId} */
function extractVaultId(path: string): string | null {
  const m = path.match(/\/api\/vault[s]?\/([^/]+)/);
  return m?.[1] ?? null;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const path = event.path;
  const method = event.httpMethod;

  try {
    // GET /api/config/warning-codes — public, no auth
    if (path === API_PATHS.CONFIG_WARNING_CODES && method === 'GET') {
      const result = await getWarningCodes();
      return success(result.response);
    }

    // GET /api/vaults — list user vaults
    if (path === API_PATHS.VAULTS && method === 'GET') {
      return await handleListVaults(event);
    }

    // POST /api/vaults — create vault
    if (path === API_PATHS.VAULTS && method === 'POST') {
      return await handleCreateVault(event);
    }

    // PATCH /api/vaults/{vaultId} — rename vault
    // DELETE /api/vaults/{vaultId}
    const vaultsDeleteMatch = path.match(/^\/api\/vaults\/([^/]+)$/);
    if (vaultsDeleteMatch && method === 'PATCH') {
      return await handleRenameVault(event, vaultsDeleteMatch[1]);
    }
    if (vaultsDeleteMatch && method === 'DELETE') {
      return await handleDeleteVault(event, vaultsDeleteMatch[1]);
    }

    // GET /api/vault/{vaultId} — get vault content
    const vaultGetMatch = path.match(/^\/api\/vault\/([^/]+)$/);
    if (vaultGetMatch && method === 'GET') {
      return await handleGetVault(event, vaultGetMatch[1]);
    }

    // PUT /api/vault/{vaultId} — save vault content
    if (vaultGetMatch && method === 'PUT') {
      return await handlePutVault(event, vaultGetMatch[1]);
    }

    // GET /api/vault/{vaultId}/download
    const vaultDownloadMatch = path.match(/^\/api\/vault\/([^/]+)\/download$/);
    if (vaultDownloadMatch && method === 'GET') {
      return await handleDownloadVault(event, vaultDownloadMatch[1]);
    }

    // POST /api/vault/{vaultId}/email
    const vaultEmailMatch = path.match(/^\/api\/vault\/([^/]+)\/email$/);
    if (vaultEmailMatch && method === 'POST') {
      return await handleSendVaultEmail(event, vaultEmailMatch[1]);
    }

    return error('Not found', 404);
  } catch (err) {
    console.error('Vault handler error:', err);
    return error('Internal server error', 500);
  }
}

async function requireActiveOrExpired(event: APIGatewayProxyEvent): Promise<
  { user: { userId: string; status: string }; errorResponse?: never } |
  { errorResponse: APIGatewayProxyResult; user?: never }
> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return { errorResponse };
  if (user!.status === 'retired' || user!.status === 'locked') {
    return { errorResponse: error(ERRORS.FORBIDDEN, 403) };
  }
  return { user: user! };
}

async function handleListVaults(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  const result = await listVaults(user!.userId);
  return success(result.response);
}

async function handleCreateVault(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const result = await createVault(user!.userId, parsed.body as { displayName: string });
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response, 201);
}

async function handleRenameVault(event: APIGatewayProxyEvent, vaultId: string): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const result = await renameVault(user!.userId, vaultId, (parsed.body.displayName as string) ?? '');
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleDeleteVault(event: APIGatewayProxyEvent, vaultId: string): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await deleteVault(user!.userId, vaultId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleGetVault(event: APIGatewayProxyEvent, vaultId: string): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  // Allow active and expired users to read
  if (user!.status !== 'active' && user!.status !== 'expired') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await getVault(user!.userId, vaultId);
  if (result.error) return error(result.error, result.statusCode || 500);
  return success(result.response);
}

async function handlePutVault(event: APIGatewayProxyEvent, vaultId: string): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  // Only active users can write
  if (user!.status === 'expired') {
    return error(ERRORS.ACCOUNT_EXPIRED, 403);
  }
  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const result = await putVault(user!.userId, vaultId, parsed.body as { encryptedContent: string });
  if (result.error) return error(result.error, result.statusCode || 500);
  return success(result.response);
}

async function handleDownloadVault(event: APIGatewayProxyEvent, vaultId: string): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active' && user!.status !== 'expired') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await downloadVault(user!.userId, vaultId);
  if (result.error) return error(result.error, result.statusCode || 500);
  return success(result.response);
}

async function handleSendVaultEmail(event: APIGatewayProxyEvent, vaultId: string): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await sendVaultEmail(user!.userId, vaultId);
  if (result.error) return error(result.error, result.statusCode || 500);
  return success(result.response);
}
