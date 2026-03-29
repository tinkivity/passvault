import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { validatePow } from '../middleware/pow.js';
import { validateHoneypot } from '../middleware/honeypot.js';
import { requireAuth } from '../middleware/auth.js';
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

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const path = event.path;
  const method = event.httpMethod;

  try {
    // POST /admin/login
    if (path === API_PATHS.ADMIN_LOGIN && method === 'POST') {
      return await handleLogin(event);
    }
    // POST /admin/change-password
    if (path === API_PATHS.ADMIN_CHANGE_PASSWORD && method === 'POST') {
      return await handleChangePassword(event);
    }
    // GET /admin/passkey/challenge
    if (path === API_PATHS.ADMIN_PASSKEY_CHALLENGE && method === 'GET') {
      return await handlePasskeyChallenge();
    }
    // POST /admin/passkey/verify
    if (path === API_PATHS.ADMIN_PASSKEY_VERIFY && method === 'POST') {
      return await handlePasskeyVerify(event);
    }
    // GET /admin/passkey/register/challenge
    if (path === API_PATHS.ADMIN_PASSKEY_REGISTER_CHALLENGE && method === 'GET') {
      return await handlePasskeyRegisterChallenge(event);
    }
    // POST /admin/passkey/register
    if (path === API_PATHS.ADMIN_PASSKEY_REGISTER && method === 'POST') {
      return await handlePasskeyRegister(event);
    }
    // POST /admin/users
    if (path === API_PATHS.ADMIN_USERS && method === 'POST') {
      return await handleCreateUser(event);
    }
    // GET /admin/users
    if (path === API_PATHS.ADMIN_USERS && method === 'GET') {
      return await handleListUsers(event);
    }
    // POST /admin/users/refresh-otp
    if (path === API_PATHS.ADMIN_USER_REFRESH_OTP && method === 'POST') {
      return await handleRefreshOtp(event);
    }
    // POST /admin/users/lock
    if (path === API_PATHS.ADMIN_USERS_LOCK && method === 'POST') {
      return await handleLockUser(event);
    }
    // POST /admin/users/unlock
    if (path === API_PATHS.ADMIN_USERS_UNLOCK && method === 'POST') {
      return await handleUnlockUser(event);
    }
    // POST /admin/users/expire
    if (path === API_PATHS.ADMIN_USERS_EXPIRE && method === 'POST') {
      return await handleExpireUser(event);
    }
    // POST /admin/users/retire
    if (path === API_PATHS.ADMIN_USERS_RETIRE && method === 'POST') {
      return await handleRetireUser(event);
    }
    // DELETE /admin/users?userId=...
    if (path === API_PATHS.ADMIN_USERS && method === 'DELETE') {
      return await handleDeleteUser(event);
    }
    // GET /admin/vault?userId=...
    if (path === API_PATHS.ADMIN_USER_VAULT && method === 'GET') {
      return await handleDownloadUserVault(event);
    }
    // POST /admin/users/email-vault
    if (path === API_PATHS.ADMIN_USERS_EMAIL_VAULT && method === 'POST') {
      return await handleEmailUserVault(event);
    }
    // POST /admin/users/reactivate
    if (path === API_PATHS.ADMIN_USER_REACTIVATE && method === 'POST') {
      return await handleReactivateUser(event);
    }
    // POST /admin/users/update
    if (path === API_PATHS.ADMIN_USER_UPDATE && method === 'POST') {
      return await handleUpdateUser(event);
    }
    // GET /admin/stats
    if (path === API_PATHS.ADMIN_STATS && method === 'GET') {
      return await handleGetStats(event);
    }
    // GET /admin/login-events
    if (path === API_PATHS.ADMIN_LOGIN_EVENTS && method === 'GET') {
      return await handleGetLoginEvents(event);
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

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await adminLogin(parsed.body as unknown as import('@passvault/shared').LoginRequest);

  if (result.error) {
    return error(result.error, result.statusCode || 401);
  }
  return success(result.response);
}

async function handleChangePassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'pending_first_login') {
    return error('Password change not required', 400);
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
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const honeypot = validateHoneypot(event);
  if (honeypot.errorResponse) return honeypot.errorResponse;

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

  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

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

async function handleCreateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'active') {
    return error(ERRORS.ADMIN_NOT_ACTIVE, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await createUserInvitation(parsed.body as unknown as import('@passvault/shared').CreateUserRequest, user!.userId);

  if (result.error) {
    return error(result.error, result.statusCode || 400);
  }
  return success(result.response, 201);
}

async function handleListUsers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
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

async function handleDownloadUserVault(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'active') {
    return error(ERRORS.ADMIN_NOT_ACTIVE, 403);
  }

  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    return error('Missing userId query parameter', 400);
  }

  // Get user's first vault
  const vaultsResult = await listVaults(userId);
  if (vaultsResult.error) {
    return error(vaultsResult.error, vaultsResult.statusCode || 500);
  }
  const vaults = vaultsResult.response ?? [];
  if (vaults.length === 0) {
    return error(ERRORS.VAULT_NOT_FOUND, 404);
  }
  const result = await downloadVault(userId, vaults[0].vaultId);
  if (result.error) {
    return error(result.error, result.statusCode || 500);
  }
  return success(result.response);
}

async function handleRefreshOtp(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'active') {
    return error(ERRORS.ADMIN_NOT_ACTIVE, 403);
  }

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

async function handleDeleteUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'active') {
    return error(ERRORS.ADMIN_NOT_ACTIVE, 403);
  }

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

async function handleGetLoginEvents(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'active') {
    return error(ERRORS.ADMIN_NOT_ACTIVE, 403);
  }

  const result = await listLoginEvents();
  return success(result);
}

async function handleGetStats(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;

  if (user!.role !== 'admin') {
    return error(ERRORS.FORBIDDEN, 403);
  }
  if (user!.status !== 'active') {
    return error(ERRORS.ADMIN_NOT_ACTIVE, 403);
  }

  const stats = await getStats();
  return success(stats);
}

async function handleLockUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== 'admin' || user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId } = parsed.body as { userId: string };
  if (!userId) return error('Missing userId', 400);

  const result = await lockUser(userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleUnlockUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== 'admin' || user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId } = parsed.body as { userId: string };
  if (!userId) return error('Missing userId', 400);

  const result = await unlockUser(userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleExpireUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== 'admin' || user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId } = parsed.body as { userId: string };
  if (!userId) return error('Missing userId', 400);

  const result = await expireUser(userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleRetireUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== 'admin' || user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId } = parsed.body as { userId: string };
  if (!userId) return error('Missing userId', 400);

  const result = await retireUser(userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleReactivateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== 'admin' || user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId, expiresAt } = parsed.body as { userId: string; expiresAt: string | null };
  if (!userId) return error('Missing userId', 400);

  const result = await reactivateUser(userId, expiresAt ?? null);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleUpdateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== 'admin' || user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const result = await updateUserProfile(parsed.body as import('@passvault/shared').UpdateUserRequest);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}

async function handleEmailUserVault(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pow = validatePow(event, POW_CONFIG.DIFFICULTY.HIGH);
  if (pow.errorResponse) return pow.errorResponse;

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== 'admin' || user!.status !== 'active') {
    return error(ERRORS.FORBIDDEN, 403);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { userId } = parsed.body as { userId: string };
  if (!userId) return error('Missing userId', 400);

  const result = await adminEmailUserVault(userId);
  if (result.error) return error(result.error, result.statusCode || 400);
  return success(result.response);
}
