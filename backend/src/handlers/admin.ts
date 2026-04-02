import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { requireAuth, requireAdminActive } from '../middleware/auth.js';
import { Router, pow, honeypot, auth, adminActive } from '../utils/router.js';
import { adminLogin, adminChangePassword, createUserInvitation, listUsers, refreshOtp, deleteNewUser, lockUser, unlockUser, expireUser, retireUser, reactivateUser, updateUserProfile, getStats, listLoginEvents, adminEmailUserVault } from '../services/admin.js';
import { downloadVault, listVaults } from '../services/vault.js';
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

// ── Admin auth / onboarding ───────────────────────────────────────────────────
router.post(API_PATHS.ADMIN_LOGIN,                      [pow(HIGH), honeypot()], handleLogin);
router.post(API_PATHS.ADMIN_CHANGE_PASSWORD,            [pow(HIGH), auth()],     handleChangePassword);
router.get (API_PATHS.ADMIN_PASSKEY_CHALLENGE,          [],                      handlePasskeyChallenge);
router.post(API_PATHS.ADMIN_PASSKEY_VERIFY,             [pow(HIGH), honeypot()], handlePasskeyVerify);
router.get (API_PATHS.ADMIN_PASSKEY_REGISTER_CHALLENGE, [auth()],                handlePasskeyRegisterChallenge);
router.post(API_PATHS.ADMIN_PASSKEY_REGISTER,           [pow(HIGH), auth()],     handlePasskeyRegister);

// ── Admin management (all require active admin) ───────────────────────────────
router.post  (API_PATHS.ADMIN_USERS,            [pow(HIGH), adminActive()], handleCreateUser);
router.get   (API_PATHS.ADMIN_USERS,            [pow(HIGH), adminActive()], handleListUsers);
router.delete(API_PATHS.ADMIN_USERS,            [pow(HIGH), adminActive()], handleDeleteUser);
router.post  (API_PATHS.ADMIN_USER_REFRESH_OTP, [pow(HIGH), adminActive()], handleRefreshOtp);
router.post  (API_PATHS.ADMIN_USERS_LOCK,       [pow(HIGH), adminActive()], handleLockUser);
router.post  (API_PATHS.ADMIN_USERS_UNLOCK,     [pow(HIGH), adminActive()], handleUnlockUser);
router.post  (API_PATHS.ADMIN_USERS_EXPIRE,     [pow(HIGH), adminActive()], handleExpireUser);
router.post  (API_PATHS.ADMIN_USERS_RETIRE,     [pow(HIGH), adminActive()], handleRetireUser);
router.post  (API_PATHS.ADMIN_USER_REACTIVATE,  [pow(HIGH), adminActive()], handleReactivateUser);
router.post  (API_PATHS.ADMIN_USER_UPDATE,      [pow(HIGH), adminActive()], handleUpdateUser);
router.post  (API_PATHS.ADMIN_USERS_EMAIL_VAULT,[pow(HIGH), adminActive()], handleEmailUserVault);
router.get   (API_PATHS.ADMIN_USER_VAULT,       [pow(HIGH), adminActive()], handleDownloadUserVault);
router.get   (API_PATHS.ADMIN_STATS,            [pow(HIGH), adminActive()], handleGetStats);
router.get   (API_PATHS.ADMIN_LOGIN_EVENTS,     [pow(HIGH), adminActive()], handleGetLoginEvents);

export const handler = (event: APIGatewayProxyEvent) => router.dispatch(event);

// ── Auth / onboarding handlers ────────────────────────────────────────────────

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

// ── Management handlers ───────────────────────────────────────────────────────
// adminActive() middleware has already verified role=admin + status=active.
// Handlers that need the user object call requireAdminActive() to retrieve it.

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

async function handleDeleteUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    return error('Missing userId query parameter', 400);
  }

  const result = await deleteNewUser(userId);
  if (result.error) {
    return error(result.error, result.statusCode || 400);
  }
  return success(result.response);
}

async function handleRefreshOtp(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId } = parsed.body as { userId: string };
  if (!userId) {
    return error('Missing userId', 400);
  }

  const result = await refreshOtp(userId);
  if (result.error) {
    return error(result.error, result.statusCode || 400);
  }
  return success(result.response);
}

async function handleLockUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId } = parsed.body as { userId: string };
  if (!userId) return error('Missing userId', 400);

  const result = await lockUser(userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleUnlockUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId } = parsed.body as { userId: string };
  if (!userId) return error('Missing userId', 400);

  const result = await unlockUser(userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleExpireUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId } = parsed.body as { userId: string };
  if (!userId) return error('Missing userId', 400);

  const result = await expireUser(userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleRetireUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId } = parsed.body as { userId: string };
  if (!userId) return error('Missing userId', 400);

  const result = await retireUser(userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleReactivateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId, expiresAt } = parsed.body as { userId: string; expiresAt: string | null };
  if (!userId) return error('Missing userId', 400);

  const result = await reactivateUser(userId, expiresAt ?? null);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleUpdateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await updateUserProfile(parsed.body as import('@passvault/shared').UpdateUserRequest);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleEmailUserVault(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId, vaultId } = parsed.body as { userId: string; vaultId?: string };
  if (!userId) return error('Missing userId', 400);

  const result = await adminEmailUserVault(userId, vaultId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleDownloadUserVault(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    return error('Missing userId query parameter', 400);
  }

  const requestedVaultId = event.queryStringParameters?.vaultId;
  const vaultsResult = await listVaults(userId);
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
  const result = await downloadVault(userId, targetVault.vaultId);
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
