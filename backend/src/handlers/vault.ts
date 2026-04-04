import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS, type UpdateNotificationsRequest } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { Router, pow, auth } from '../utils/router.js';
import { validate } from '../middleware/validate.js';
import { CreateVaultSchema, RenameVaultSchema, PutVaultSchema, UpdateNotificationsSchema } from './vault.schemas.js';
import {
  listVaults,
  createVault,
  deleteVault,
  renameVault,
  getVault,
  getVaultIndex,
  getVaultItems,
  putVault,
  downloadVault,
  sendVaultEmail,
  getWarningCodes,
} from '../services/vault.js';
import { getUserById, updateUser } from '../utils/dynamodb.js';
import { parseBody } from '../utils/request.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

const router = new Router();
router.get  (API_PATHS.CONFIG_WARNING_CODES,  [],                                              handleWarningCodes);
router.get  (API_PATHS.VAULTS,               [pow(HIGH), auth()],                              handleListVaults);
router.post (API_PATHS.VAULTS,               [pow(HIGH), auth(), validate(CreateVaultSchema)], handleCreateVault);
router.patch('/api/vaults/{vaultId}',         [pow(HIGH), auth(), validate(RenameVaultSchema)], handleRenameVault);
router.delete('/api/vaults/{vaultId}',        [pow(HIGH), auth()],                              handleDeleteVault);
// VAULT_NOTIFICATIONS is a static path — registered before /api/vaults/{vaultId} so it takes precedence
router.get  (API_PATHS.VAULT_NOTIFICATIONS,  [auth()],                                         handleGetNotifications);
router.post (API_PATHS.VAULT_NOTIFICATIONS,  [auth(), validate(UpdateNotificationsSchema)],     handleUpdateNotifications);
router.get  (API_PATHS.VAULT_INDEX,          [pow(HIGH), auth()],                               handleGetVaultIndex);
router.get  (API_PATHS.VAULT_ITEMS,         [pow(HIGH), auth()],                               handleGetVaultItems);
router.get  (API_PATHS.VAULT,               [pow(HIGH), auth()],                               handleGetVault);
router.put  (API_PATHS.VAULT,               [pow(HIGH), auth(), validate(PutVaultSchema)],     handlePutVault);
router.get  (API_PATHS.VAULT_DOWNLOAD,      [pow(HIGH), auth()],                               handleDownloadVault);
router.post (API_PATHS.VAULT_EMAIL,         [pow(HIGH), auth()],                               handleSendVaultEmail);

export const handler = (event: APIGatewayProxyEvent) => router.dispatch(event);

async function handleWarningCodes(): Promise<APIGatewayProxyResult> {
  const result = await getWarningCodes();
  return success(result.response);
}

async function handleListVaults(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  const result = await listVaults(user!.userId);
  return success(result.response);
}

async function handleCreateVault(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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

async function handleRenameVault(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const result = await renameVault(user!.userId, params.vaultId, (parsed.body.displayName as string) ?? '');
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleDeleteVault(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await deleteVault(user!.userId, params.vaultId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleGetVault(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  // Allow active and expired users to read
  if (user!.status !== 'active' && user!.status !== 'expired') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await getVault(user!.userId, params.vaultId);
  if (result.error) return error(result.error, result.statusCode || 500);
  return success(result.response);
}

async function handleGetVaultIndex(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active' && user!.status !== 'expired') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await getVaultIndex(user!.userId, params.vaultId);
  if (result.error) return error(result.error, result.statusCode || 500);
  return success(result.response);
}

async function handleGetVaultItems(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active' && user!.status !== 'expired') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await getVaultItems(user!.userId, params.vaultId);
  if (result.error) return error(result.error, result.statusCode || 500);
  return success(result.response);
}

async function handlePutVault(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
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

  const result = await putVault(user!.userId, params.vaultId, parsed.body as { encryptedIndex: string; encryptedItems: string });
  if (result.error) return error(result.error, result.statusCode || 500);
  return success(result.response);
}

async function handleDownloadVault(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active' && user!.status !== 'expired') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await downloadVault(user!.userId, params.vaultId);
  if (result.error) return error(result.error, result.statusCode || 500);
  return success(result.response);
}

async function handleSendVaultEmail(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const result = await sendVaultEmail(user!.userId, params.vaultId);
  if (result.error) return error(result.error, result.statusCode || 500);
  return success(result.response);
}

async function handleGetNotifications(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const fullUser = await getUserById(user!.userId);
  if (!fullUser) return error(ERRORS.NOT_FOUND, 404);

  const notificationPrefs = fullUser.notificationPrefs ?? { vaultBackup: 'none' };
  return success({ notificationPrefs });
}

async function handleUpdateNotifications(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const { notificationPrefs } = parsed.body as unknown as UpdateNotificationsRequest;
  if (!notificationPrefs) return error('Missing notificationPrefs', 400);

  await updateUser(user!.userId, { notificationPrefs });
  return success({ success: true });
}
