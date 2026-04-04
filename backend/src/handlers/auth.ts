import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { Router, pow, honeypot, auth } from '../utils/router.js';
import { validate } from '../middleware/validate.js';
import {
  LoginSchema,
  ChangePasswordSchema,
  SelfChangePasswordSchema,
  PasskeyVerifySchema,
  PasskeyRegisterSchema,
  UpdateProfileSchema,
  LogoutSchema,
  EmailChangeSchema,
  VerifyEmailChangeSchema,
  LockSelfSchema,
} from './auth.schemas.js';
import { login, changePassword, selfChangePassword, updateProfile, requestEmailChange, verifyEmailChange, lockSelf } from '../services/auth.js';
import { verifyEmailToken } from '../services/admin.js';
import { updateLoginEventLogout } from '../utils/dynamodb.js';
import * as passkey from './passkey.shared.js';
import { parseBody } from '../utils/request.js';

const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;

const router = new Router();
router.post(API_PATHS.AUTH_LOGIN,                      [pow(MEDIUM), honeypot(), validate(LoginSchema)],               handleLogin);
router.post(API_PATHS.AUTH_CHANGE_PASSWORD,            [pow(MEDIUM), auth(), validate(ChangePasswordSchema)],          handleChangePassword);
router.post(API_PATHS.AUTH_CHANGE_PASSWORD_SELF,       [pow(MEDIUM), auth(), validate(SelfChangePasswordSchema)],      handleSelfChangePassword);
router.get (API_PATHS.AUTH_PASSKEY_CHALLENGE,          [],                                                           () => passkey.handlePasskeyChallenge());
router.post(API_PATHS.AUTH_PASSKEY_VERIFY,             [pow(MEDIUM), honeypot(), validate(PasskeyVerifySchema)],     (e) => passkey.handlePasskeyVerify(e, 'user'));
router.get (API_PATHS.AUTH_PASSKEY_REGISTER_CHALLENGE, [auth()],                                                     (e) => passkey.handlePasskeyRegisterChallenge(e, 'user'));
router.post(API_PATHS.AUTH_PASSKEY_REGISTER,           [pow(MEDIUM), auth(), validate(PasskeyRegisterSchema)],       (e) => passkey.handlePasskeyRegister(e, 'user'));
router.get (API_PATHS.AUTH_PASSKEYS,                   [auth()],                                                       (e) => passkey.handleListPasskeys(e, 'user'));
router.delete(API_PATHS.AUTH_PASSKEY_REVOKE,           [auth()],                                                       (e) => passkey.handleRevokePasskey(e, 'user'));
router.patch(API_PATHS.AUTH_PASSKEY_REVOKE,            [auth()],                                                       (e) => passkey.handleRenamePasskey(e, 'user'));
router.get (API_PATHS.AUTH_VERIFY_EMAIL,               [],                                                             handleVerifyEmail);
router.post(API_PATHS.AUTH_LOGOUT,                     [auth(), validate(LogoutSchema)],                               handleLogout);
router.patch(API_PATHS.AUTH_PROFILE,                   [auth(), validate(UpdateProfileSchema)],                        handleUpdateProfile);
router.post(API_PATHS.AUTH_EMAIL_CHANGE,               [pow(MEDIUM), auth(), validate(EmailChangeSchema)],              handleEmailChange);
router.post(API_PATHS.AUTH_VERIFY_EMAIL_CHANGE,        [pow(MEDIUM), honeypot(), validate(VerifyEmailChangeSchema)],    handleVerifyEmailChange);
router.post(API_PATHS.AUTH_LOCK_SELF,                  [pow(MEDIUM), honeypot(), validate(LockSelfSchema)],             handleLockSelf);

export const handler = (event: APIGatewayProxyEvent) => router.dispatch(event);

async function handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await login(parsed.body as unknown as import('@passvault/shared').LoginRequest);

  if (result.error) {
    return error(result.error, result.statusCode || 401);
  }
  return success(result.response);
}

async function handleChangePassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'pending_first_login') {
    return error('Password change not required', 400);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await changePassword(user!.userId, user!.username, parsed.body as unknown as import('@passvault/shared').ChangePasswordRequest);

  if (result.error) {
    return error(result.error, result.statusCode || 400, result.details);
  }
  return success(result.response);
}

async function handleSelfChangePassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await selfChangePassword(user!.userId, user!.username, parsed.body as unknown as import('@passvault/shared').SelfChangePasswordRequest);

  if (result.error) {
    return error(result.error, result.statusCode || 400, result.details);
  }
  return success(result.response);
}


async function handleVerifyEmail(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const token = event.queryStringParameters?.token;
  if (!token) {
    return error(ERRORS.EMAIL_VERIFICATION_INVALID, 400);
  }
  const result = await verifyEmailToken(token);
  if (result.error) {
    return error(result.error, result.statusCode || 400);
  }
  return success(result.response);
}

async function handleUpdateProfile(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const result = await updateProfile(
    user!.userId,
    parsed.body as import('@passvault/shared').UpdateProfileRequest,
  );
  if (result.error) return error(result.error, result.statusCode || 400);
  return success({ success: true });
}

async function handleLogout(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { eventId } = parsed.body as { eventId?: string };
  if (!eventId || typeof eventId !== 'string') {
    return error('Missing eventId', 400);
  }

  updateLoginEventLogout(eventId, new Date().toISOString()).catch(err => {
    console.error('Failed to record logout event:', err, 'userId:', user!.userId);
  });

  return success({ success: true });
}

async function handleEmailChange(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { newEmail } = parsed.body as { newEmail: string };

  const result = await requestEmailChange(user!.userId, newEmail);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success({ success: true });
}

async function handleVerifyEmailChange(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { token } = parsed.body as { token: string };

  const result = await verifyEmailChange(token);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success({ success: true });
}

async function handleLockSelf(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { token } = parsed.body as { token: string };

  const result = await lockSelf(token);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success({ success: true });
}
