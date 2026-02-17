import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { validatePow } from '../middleware/pow.js';
import { validateHoneypot } from '../middleware/honeypot.js';
import { requireAuth } from '../middleware/auth.js';
import { adminLogin, adminChangePassword, createUserInvitation, listUsers } from '../services/admin.js';
import * as totpService from '../services/totp.js';
import { getUserById, updateUser } from '../utils/dynamodb.js';
import { config } from '../config.js';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const path = event.path;
  const method = event.httpMethod;

  try {
    // POST /admin/login
    if (path === API_PATHS.ADMIN_LOGIN && method === 'POST') {
      return handleLogin(event);
    }
    // POST /admin/change-password
    if (path === API_PATHS.ADMIN_CHANGE_PASSWORD && method === 'POST') {
      return handleChangePassword(event);
    }
    // POST /admin/totp/setup
    if (path === API_PATHS.ADMIN_TOTP_SETUP && method === 'POST') {
      return handleTotpSetup(event);
    }
    // POST /admin/totp/verify
    if (path === API_PATHS.ADMIN_TOTP_VERIFY && method === 'POST') {
      return handleTotpVerify(event);
    }
    // POST /admin/users
    if (path === API_PATHS.ADMIN_USERS && method === 'POST') {
      return handleCreateUser(event);
    }
    // GET /admin/users
    if (path === API_PATHS.ADMIN_USERS && method === 'GET') {
      return handleListUsers(event);
    }

    return error('Not found', 404);
  } catch (err) {
    console.error('Admin handler error:', err);
    return error('Internal server error', 500);
  }
}

async function handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const honeypot = validateHoneypot(event);
  if (honeypot.errorResponse) return honeypot.errorResponse;

  const body = JSON.parse(event.body || '{}');
  const result = await adminLogin(body);

  if (result.error) {
    return error(result.error, result.statusCode || 401);
  }
  return success(result.response);
}

async function handleChangePassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'pending_first_login') {
    return error('Password change not required', 400);
  }

  const body = JSON.parse(event.body || '{}');
  const result = await adminChangePassword(user!.userId, user!.username, body);

  if (result.error) {
    return error(result.error, result.statusCode || 400, result.details);
  }
  return success(result.response);
}

async function handleTotpSetup(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!config.features.totpRequired) {
    return error(ERRORS.TOTP_NOT_ENABLED, 404);
  }

  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'pending_totp_setup') {
    return error(ERRORS.TOTP_SETUP_REQUIRED, 400);
  }

  const secret = totpService.generateSecret();
  const uri = totpService.generateQrUri(user!.username, secret);
  const qrCodeUrl = await totpService.generateQrDataUrl(uri);

  await updateUser(user!.userId, { totpSecret: secret });

  return success({ secret, qrCodeUrl });
}

async function handleTotpVerify(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!config.features.totpRequired) {
    return error(ERRORS.TOTP_NOT_ENABLED, 404);
  }

  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'pending_totp_setup') {
    return error(ERRORS.TOTP_SETUP_REQUIRED, 400);
  }

  const body = JSON.parse(event.body || '{}');
  const dbUser = await getUserById(user!.userId);
  if (!dbUser?.totpSecret) {
    return error('TOTP not set up yet', 400);
  }

  if (!totpService.verifyCode(body.totpCode, dbUser.totpSecret)) {
    return error(ERRORS.INVALID_TOTP, 400);
  }

  await updateUser(user!.userId, {
    totpEnabled: true,
    status: 'active',
  });

  return success({ success: true });
}

async function handleCreateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'active') {
    return error(ERRORS.ADMIN_NOT_ACTIVE, 403);
  }

  const body = JSON.parse(event.body || '{}');
  const result = await createUserInvitation(body, user!.userId);

  if (result.error) {
    return error(result.error, result.statusCode || 400);
  }
  return success(result.response, 201);
}

async function handleListUsers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'active') {
    return error(ERRORS.ADMIN_NOT_ACTIVE, 403);
  }

  const result = await listUsers();
  return success(result);
}
