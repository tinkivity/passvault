import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { requireAdminActive } from '../middleware/auth.js';
import { Router, pow, adminActive } from '../utils/router.js';
import { validate } from '../middleware/validate.js';
import {
  CreateUserSchema,
  UpdateUserSchema,
  ReactivateUserSchema,
  EmailVaultSchema,
} from './admin-management.schemas.js';
import { createUserInvitation, listUsers, refreshOtp, deleteNewUser, lockUser, unlockUser, expireUser, retireUser, reactivateUser, updateUserProfile, getStats, listLoginEvents, adminEmailUserVault } from '../services/admin.js';
import { downloadVault, listVaults } from '../services/vault.js';
import { parseBody } from '../utils/request.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

const router = new Router();
router.post  (API_PATHS.ADMIN_USERS,             [pow(HIGH), adminActive(), validate(CreateUserSchema)],    handleCreateUser);
router.get   (API_PATHS.ADMIN_USERS,             [pow(HIGH), adminActive()],                                 handleListUsers);
router.delete(API_PATHS.ADMIN_USER,              [pow(HIGH), adminActive()],                                 handleDeleteUser);
router.patch (API_PATHS.ADMIN_USER,              [pow(HIGH), adminActive(), validate(UpdateUserSchema)],     handleUpdateUser);
router.get   (API_PATHS.ADMIN_USER_VAULT,        [pow(HIGH), adminActive()],                                 handleDownloadUserVault);
router.post  (API_PATHS.ADMIN_USER_REFRESH_OTP,  [pow(HIGH), adminActive()],                                 handleRefreshOtp);
router.post  (API_PATHS.ADMIN_USER_LOCK,         [pow(HIGH), adminActive()],                                 handleLockUser);
router.post  (API_PATHS.ADMIN_USER_UNLOCK,       [pow(HIGH), adminActive()],                                 handleUnlockUser);
router.post  (API_PATHS.ADMIN_USER_EXPIRE,       [pow(HIGH), adminActive()],                                 handleExpireUser);
router.post  (API_PATHS.ADMIN_USER_RETIRE,       [pow(HIGH), adminActive()],                                 handleRetireUser);
router.post  (API_PATHS.ADMIN_USER_REACTIVATE,   [pow(HIGH), adminActive(), validate(ReactivateUserSchema)], handleReactivateUser);
router.post  (API_PATHS.ADMIN_USER_EMAIL_VAULT,  [pow(HIGH), adminActive(), validate(EmailVaultSchema)],     handleEmailUserVault);
router.get   (API_PATHS.ADMIN_STATS,             [pow(HIGH), adminActive()],                                 handleGetStats);
router.get   (API_PATHS.ADMIN_LOGIN_EVENTS,      [pow(HIGH), adminActive()],                                 handleGetLoginEvents);

export const handler = (event: APIGatewayProxyEvent) => router.dispatch(event);

async function handleCreateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { user } = await requireAdminActive(event);

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await createUserInvitation(parsed.body as unknown as import('@passvault/shared').CreateUserRequest, user!.userId);

  if (result.error) {
    return error(result.error, result.statusCode || 400);
  }
  return success(result.response, 201);
}

async function handleListUsers(): Promise<APIGatewayProxyResult> {
  const result = await listUsers();
  return success(result);
}

async function handleDeleteUser(_event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const result = await deleteNewUser(params.userId);
  if (result.error) {
    return error(result.error, result.statusCode || 400);
  }
  return success(result.response);
}

async function handleRefreshOtp(_event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const result = await refreshOtp(params.userId);
  if (result.error) {
    return error(result.error, result.statusCode || 400);
  }
  return success(result.response);
}

async function handleLockUser(_event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const result = await lockUser(params.userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleUnlockUser(_event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const result = await unlockUser(params.userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleExpireUser(_event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const result = await expireUser(params.userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleRetireUser(_event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const result = await retireUser(params.userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleReactivateUser(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { expiresAt } = parsed.body as { expiresAt?: string | null };

  const result = await reactivateUser(params.userId, expiresAt ?? null);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleUpdateUser(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await updateUserProfile({ ...(parsed.body as import('@passvault/shared').UpdateUserRequest), userId: params.userId });
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleEmailUserVault(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { vaultId } = parsed.body as { vaultId?: string };

  const result = await adminEmailUserVault(params.userId, vaultId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleDownloadUserVault(event: APIGatewayProxyEvent, params: Record<string, string>): Promise<APIGatewayProxyResult> {
  const requestedVaultId = event.queryStringParameters?.vaultId;
  const vaultsResult = await listVaults(params.userId);
  if (vaultsResult.error) {
    return error(vaultsResult.error, vaultsResult.statusCode || 500);
  }
  const vaults = vaultsResult.response ?? [];
  if (vaults.length === 0) {
    return error(ERRORS.VAULT_NOT_FOUND, 404);
  }
  const targetVault = requestedVaultId
    ? vaults.find((v) => v.vaultId === requestedVaultId)
    : vaults[0];
  if (!targetVault) {
    return error(ERRORS.VAULT_NOT_FOUND, 404);
  }
  const result = await downloadVault(params.userId, targetVault.vaultId);
  if (result.error) {
    return error(result.error, result.statusCode || 500);
  }
  return success(result.response);
}

async function handleGetStats(): Promise<APIGatewayProxyResult> {
  const stats = await getStats();
  return success(stats);
}

async function handleGetLoginEvents(): Promise<APIGatewayProxyResult> {
  const result = await listLoginEvents();
  return success(result);
}
