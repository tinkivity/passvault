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
import { adminLogin, adminChangePassword } from '../services/admin.js';
import {
  generateChallengeJwt,
  verifyChallengeJwt,
  generatePasskeyToken,
  verifyPasskeyAssertion,
  verifyPasskeyAttestation,
} from '../services/passkey.js';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { getUserByCredentialId, updateUser } from '../utils/dynamodb.js';
import { config } from '../config.js';
import { parseBody } from '../utils/request.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

const router = new Router();
router.post(API_PATHS.ADMIN_LOGIN,                      [pow(HIGH), honeypot(), validate(LoginSchema)],         handleLogin);
router.post(API_PATHS.ADMIN_CHANGE_PASSWORD,            [pow(HIGH), auth(), validate(ChangePasswordSchema)],    handleChangePassword);
router.get (API_PATHS.ADMIN_PASSKEY_CHALLENGE,          [],                                                     handlePasskeyChallenge);
router.post(API_PATHS.ADMIN_PASSKEY_VERIFY,             [pow(HIGH), honeypot(), validate(PasskeyVerifySchema)], handlePasskeyVerify);
router.get (API_PATHS.ADMIN_PASSKEY_REGISTER_CHALLENGE, [auth()],                                               handlePasskeyRegisterChallenge);
router.post(API_PATHS.ADMIN_PASSKEY_REGISTER,           [pow(HIGH), auth(), validate(PasskeyRegisterSchema)],   handlePasskeyRegister);

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
  const result = await adminChangePassword(user!.userId, user!.username, parsed.body as unknown as import('@passvault/shared').ChangePasswordRequest);

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
  if (!user || user.role !== 'admin' || !user.passkeyCredentialId || !user.passkeyPublicKey) {
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

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
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

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
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
