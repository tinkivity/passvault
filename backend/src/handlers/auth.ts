import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { success, error } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { Router, pow, honeypot, auth } from '../utils/router.js';
import { login, changePassword, selfChangePassword, updateProfile } from '../services/auth.js';
import { verifyEmailToken } from '../services/admin.js';
import { updateLoginEventLogout } from '../utils/dynamodb.js';
import {
  generateChallengeJwt,
  verifyChallengeJwt,
  generatePasskeyToken,
  verifyPasskeyAssertion,
  verifyPasskeyAttestation,
} from '../services/passkey.js';
import { getUserByCredentialId, updateUser } from '../utils/dynamodb.js';
import { config } from '../config.js';
import { parseBody } from '../utils/request.js';

const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;

const router = new Router();
router.post(API_PATHS.AUTH_LOGIN,                      [pow(MEDIUM), honeypot()], handleLogin);
router.post(API_PATHS.AUTH_CHANGE_PASSWORD,            [pow(MEDIUM), auth()],     handleChangePassword);
router.post(API_PATHS.AUTH_CHANGE_PASSWORD_SELF,       [pow(MEDIUM), auth()],     handleSelfChangePassword);
router.get (API_PATHS.AUTH_PASSKEY_CHALLENGE,          [],                        handlePasskeyChallenge);
router.post(API_PATHS.AUTH_PASSKEY_VERIFY,             [pow(MEDIUM), honeypot()], handlePasskeyVerify);
router.get (API_PATHS.AUTH_PASSKEY_REGISTER_CHALLENGE, [auth()],                  handlePasskeyRegisterChallenge);
router.post(API_PATHS.AUTH_PASSKEY_REGISTER,           [pow(MEDIUM), auth()],     handlePasskeyRegister);
router.get (API_PATHS.AUTH_VERIFY_EMAIL,               [],                        handleVerifyEmail);
router.post(API_PATHS.AUTH_LOGOUT,                     [auth()],                  handleLogout);
router.post(API_PATHS.AUTH_PROFILE,                    [auth()],                  handleUpdateProfile);

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

async function handlePasskeyChallenge(): Promise<APIGatewayProxyResult> {
  const challengeJwt = await generateChallengeJwt();
  return success({ challengeJwt });
}

async function handlePasskeyVerify(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const { challengeJwt, assertion } = parsed.body as { challengeJwt: string; assertion: AuthenticationResponseJSON };
  if (!challengeJwt || !assertion) {
    return error(ERRORS.INVALID_PASSKEY, 400);
  }

  let expectedChallenge: string;
  try {
    expectedChallenge = await verifyChallengeJwt(challengeJwt);
  } catch {
    return error(ERRORS.INVALID_PASSKEY, 401);
  }

  const credentialId = assertion.id;
  const user = await getUserByCredentialId(credentialId);
  if (!user || !user.passkeyCredentialId || !user.passkeyPublicKey) {
    return error(ERRORS.INVALID_PASSKEY, 401);
  }

  const result = await verifyPasskeyAssertion(assertion, expectedChallenge, {
    credentialId: user.passkeyCredentialId,
    publicKey: user.passkeyPublicKey,
    counter: user.passkeyCounter,
    transports: user.passkeyTransports,
  });

  if (!result.verified) {
    return error(ERRORS.INVALID_PASSKEY, 401);
  }

  await updateUser(user.userId, { passkeyCounter: result.newCounter });

  const passkeyToken = await generatePasskeyToken(user.userId);
  return success({ passkeyToken, username: user.username, encryptionSalt: user.encryptionSalt });
}

async function handlePasskeyRegisterChallenge(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!config.features.passkeyRequired) {
    return error('Passkey not enabled in this environment', 404);
  }

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'pending_passkey_setup') {
    return error(ERRORS.PASSKEY_SETUP_REQUIRED, 400);
  }

  const challengeJwt = await generateChallengeJwt();
  return success({ challengeJwt });
}

async function handlePasskeyRegister(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!config.features.passkeyRequired) {
    return error('Passkey not enabled in this environment', 404);
  }

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.status !== 'pending_passkey_setup') {
    return error(ERRORS.PASSKEY_SETUP_REQUIRED, 400);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const { challengeJwt, attestation } = parsed.body as { challengeJwt: string; attestation: RegistrationResponseJSON };
  if (!challengeJwt || !attestation) {
    return error('Missing challengeJwt or attestation', 400);
  }

  let expectedChallenge: string;
  try {
    expectedChallenge = await verifyChallengeJwt(challengeJwt);
  } catch {
    return error(ERRORS.INVALID_PASSKEY, 401);
  }

  const result = await verifyPasskeyAttestation(attestation, expectedChallenge);
  if (!result.verified) {
    return error(ERRORS.INVALID_PASSKEY, 400);
  }

  await updateUser(user!.userId, {
    passkeyCredentialId: result.credentialId,
    passkeyPublicKey: result.publicKey,
    passkeyCounter: result.counter,
    passkeyTransports: result.transports.length > 0 ? result.transports : null,
    passkeyAaguid: result.aaguid || null,
    status: 'active',
  });

  return success({ success: true });
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
