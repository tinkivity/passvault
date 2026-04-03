import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { Router, pow, honeypot, auth } from '../utils/router.js';
import { validate } from '../middleware/validate.js';
import {
  LoginSchema,
  ChangePasswordSchema,
  PasskeyVerifySchema,
  PasskeyRegisterSchema,
} from './auth.schemas.js';
import { adminLogin } from '../services/admin.js';
import { changePassword } from '../services/auth.js';
import * as passkey from './passkey.shared.js';
import { parseBody } from '../utils/request.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

const router = new Router();
router.post(API_PATHS.ADMIN_LOGIN,                      [pow(HIGH), honeypot(), validate(LoginSchema)],         handleLogin);
router.post(API_PATHS.ADMIN_CHANGE_PASSWORD,            [pow(HIGH), auth(), validate(ChangePasswordSchema)],    handleChangePassword);
router.get (API_PATHS.ADMIN_PASSKEY_CHALLENGE,          [],                                                     () => passkey.handlePasskeyChallenge());
router.post(API_PATHS.ADMIN_PASSKEY_VERIFY,             [pow(HIGH), honeypot(), validate(PasskeyVerifySchema)], (e) => passkey.handlePasskeyVerify(e, 'admin'));
router.get (API_PATHS.ADMIN_PASSKEY_REGISTER_CHALLENGE, [auth()],                                               (e) => passkey.handlePasskeyRegisterChallenge(e, 'admin'));
router.post(API_PATHS.ADMIN_PASSKEY_REGISTER,           [pow(HIGH), auth(), validate(PasskeyRegisterSchema)],   (e) => passkey.handlePasskeyRegister(e, 'admin'));

export const handler = (event: APIGatewayProxyEvent) => router.dispatch(event);

async function handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await adminLogin(parsed.body as unknown as import('@passvault/shared').LoginRequest);

  if (result.error) {
    return error(result.error, result.statusCode || 401);
  }
  return success(result.response);
}

async function handleChangePassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'pending_first_login' && user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await changePassword(user!.userId, user!.username, parsed.body as unknown as import('@passvault/shared').ChangePasswordRequest);

  if (result.error) {
    return error(result.error, result.statusCode || 400, result.details);
  }
  return success(result.response);
}

