import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { UserRole } from '@passvault/shared';
import { ERRORS, LIMITS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import {
  getUserByCredentialId,
  updateUser,
  listPasskeyCredentials,
  createPasskeyCredential,
  deletePasskeyCredential,
  updatePasskeyCounter,
  renamePasskeyCredential,
  recordLoginEvent,
} from '../utils/dynamodb.js';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { recordAuditEvent } from '../utils/audit.js';
import { parseBody } from '../utils/request.js';
import {
  generateChallengeJwt,
  verifyChallengeJwt,
  generatePasskeyToken,
  verifyPasskeyAssertion,
  verifyPasskeyAttestation,
} from '../services/passkey.js';

export async function handlePasskeyChallenge(): Promise<APIGatewayProxyResult> {
  const challengeJwt = await generateChallengeJwt();
  return success({ challengeJwt });
}

export async function handlePasskeyVerify(
  event: APIGatewayProxyEvent,
  requiredRole: UserRole,
): Promise<APIGatewayProxyResult> {
  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const { challengeJwt, assertion } = parsed.body as { challengeJwt: string; assertion: AuthenticationResponseJSON };
  if (!challengeJwt || !assertion) return error(ERRORS.INVALID_PASSKEY, 400);

  let expectedChallenge: string;
  try {
    expectedChallenge = await verifyChallengeJwt(challengeJwt);
  } catch {
    return error(ERRORS.INVALID_PASSKEY, 401);
  }

  const lookup = await getUserByCredentialId(assertion.id);
  if (!lookup || lookup.user.role !== requiredRole) {
    // Record failed attempt if we found the user but role mismatch
    if (lookup) {
      recordLoginEvent(randomUUID(), lookup.user.userId, false, assertion.id).catch(() => {});
    }
    return error(ERRORS.INVALID_PASSKEY, 401);
  }
  const { user, credential } = lookup;

  const requestOrigin = event.headers?.origin ?? event.headers?.Origin;
  const result = await verifyPasskeyAssertion(assertion, expectedChallenge, {
    credentialId: credential.credentialId,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports,
  }, requestOrigin);
  if (!result.verified) {
    recordLoginEvent(randomUUID(), user.userId, false, credential.credentialId, credential.name).catch(() => {});
    return error(ERRORS.INVALID_PASSKEY, 401);
  }

  await updatePasskeyCounter(credential.credentialId, result.newCounter);
  const passkeyToken = await generatePasskeyToken(user.userId, credential.credentialId, credential.name);
  return success({ passkeyToken, username: user.username, encryptionSalt: user.encryptionSalt });
}

export async function handlePasskeyRegisterChallenge(
  event: APIGatewayProxyEvent,
  requiredRole: UserRole,
): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== requiredRole) return error(ERRORS.FORBIDDEN, 403);

  // Users: active or pending_first_login (onboarding passkey-first); Admins: active or pending_passkey_setup
  if (requiredRole === 'user') {
    if (user!.status !== 'active' && user!.status !== 'pending_first_login') return error(ERRORS.FORBIDDEN, 403);
  } else {
    if (user!.status !== 'active' && user!.status !== 'pending_passkey_setup') return error(ERRORS.PASSKEY_SETUP_REQUIRED, 400);
  }

  // Check passkey limit
  const existing = await listPasskeyCredentials(user!.userId);
  const limit = requiredRole === 'admin' ? LIMITS.MAX_PASSKEYS_ADMIN : LIMITS.MAX_PASSKEYS_USER;
  if (existing.length >= limit) return error(ERRORS.PASSKEY_LIMIT_REACHED, 400);

  const challengeJwt = await generateChallengeJwt();
  return success({ challengeJwt });
}

export async function handlePasskeyRegister(
  event: APIGatewayProxyEvent,
  requiredRole: UserRole,
): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== requiredRole) return error(ERRORS.FORBIDDEN, 403);

  if (requiredRole === 'user') {
    if (user!.status !== 'active' && user!.status !== 'pending_first_login') return error(ERRORS.FORBIDDEN, 403);
  } else {
    if (user!.status !== 'active' && user!.status !== 'pending_passkey_setup') return error(ERRORS.PASSKEY_SETUP_REQUIRED, 400);
  }

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const { challengeJwt, attestation, name } = parsed.body as { challengeJwt: string; attestation: RegistrationResponseJSON; name?: string };
  if (!challengeJwt || !attestation) return error('Missing challengeJwt or attestation', 400);

  // Check limit
  const existing = await listPasskeyCredentials(user!.userId);
  const limit = requiredRole === 'admin' ? LIMITS.MAX_PASSKEYS_ADMIN : LIMITS.MAX_PASSKEYS_USER;
  if (existing.length >= limit) return error(ERRORS.PASSKEY_LIMIT_REACHED, 400);

  let expectedChallenge: string;
  try {
    expectedChallenge = await verifyChallengeJwt(challengeJwt);
  } catch {
    return error(ERRORS.INVALID_PASSKEY, 401);
  }

  const requestOrigin = event.headers?.origin ?? event.headers?.Origin;
  const result = await verifyPasskeyAttestation(attestation, expectedChallenge, requestOrigin);
  if (!result.verified) return error(ERRORS.INVALID_PASSKEY, 400);

  const passkeyName = (name ?? 'Passkey').slice(0, LIMITS.MAX_PASSKEY_NAME_LENGTH);
  let replacedExisting = false;

  // Check for duplicate provider (same aaguid) — replace existing credential
  const duplicateAaguid = result.aaguid ? existing.find(c => c.aaguid === result.aaguid) : undefined;
  if (duplicateAaguid) {
    await deletePasskeyCredential(duplicateAaguid.credentialId);
    replacedExisting = true;
  }

  await createPasskeyCredential({
    credentialId: result.credentialId,
    userId: user!.userId,
    name: passkeyName,
    publicKey: result.publicKey,
    counter: result.counter,
    transports: result.transports.length > 0 ? result.transports : null,
    aaguid: result.aaguid || '',
    createdAt: new Date().toISOString(),
  });

  // First passkey for user: clear password hash (password login disabled)
  const updates: Record<string, unknown> = {};
  if (requiredRole === 'user' && existing.length === 0 && !replacedExisting) {
    updates.passwordHash = '';
  }
  // Transition to active from any onboarding status
  if (user!.status === 'pending_passkey_setup' || user!.status === 'pending_first_login') {
    updates.status = 'active';
    updates.oneTimePasswordHash = null;
    updates.otpExpiresAt = null;
  }
  if (Object.keys(updates).length > 0) {
    await updateUser(user!.userId, updates as Parameters<typeof updateUser>[1]);
  }

  await recordAuditEvent({
    category: 'system',
    action: 'passkey_registered',
    userId: user!.userId,
    performedBy: user!.userId,
    details: { name: passkeyName, replacedExisting: String(replacedExisting) },
  }).catch(err => console.error('Failed to record audit event:', err));

  return success({ success: true, replacedExisting });
}

export async function handleListPasskeys(
  event: APIGatewayProxyEvent,
  requiredRole: UserRole,
): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== requiredRole) return error(ERRORS.FORBIDDEN, 403);

  const credentials = await listPasskeyCredentials(user!.userId);
  const passkeys = credentials.map(c => ({
    credentialId: c.credentialId,
    name: c.name,
    aaguid: c.aaguid,
    createdAt: c.createdAt,
  }));
  return success({ passkeys });
}

export async function handleRevokePasskey(
  event: APIGatewayProxyEvent,
  requiredRole: UserRole,
): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== requiredRole) return error(ERRORS.FORBIDDEN, 403);

  const credentialId = event.pathParameters?.credentialId;
  if (!credentialId) return error(ERRORS.PASSKEY_NOT_FOUND, 400);

  const credentials = await listPasskeyCredentials(user!.userId);
  const target = credentials.find(c => c.credentialId === credentialId);
  if (!target) return error(ERRORS.PASSKEY_NOT_FOUND, 404);

  // Cannot revoke the last passkey for users (they can't go back to password login)
  if (credentials.length <= 1) {
    if (requiredRole === 'user') return error(ERRORS.PASSKEY_CANNOT_REVOKE_LAST, 400);
    // Admins in prod also cannot revoke last passkey
    if (requiredRole === 'admin' && config.features.passkeyRequired) return error(ERRORS.PASSKEY_CANNOT_REVOKE_LAST, 400);
  }

  await deletePasskeyCredential(credentialId);

  await recordAuditEvent({
    category: 'system',
    action: 'passkey_revoked',
    userId: user!.userId,
    performedBy: user!.userId,
    details: { credentialId, name: target.name },
  }).catch(err => console.error('Failed to record audit event:', err));

  return success({ success: true });
}

export async function handleRenamePasskey(
  event: APIGatewayProxyEvent,
  requiredRole: UserRole,
): Promise<APIGatewayProxyResult> {
  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== requiredRole) return error(ERRORS.FORBIDDEN, 403);

  const credentialId = event.pathParameters?.credentialId;
  if (!credentialId) return error(ERRORS.PASSKEY_NOT_FOUND, 400);

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;
  const { name } = parsed.body as { name?: string };
  if (!name || !name.trim()) return error('Name is required', 400);

  const credentials = await listPasskeyCredentials(user!.userId);
  const target = credentials.find(c => c.credentialId === credentialId);
  if (!target) return error(ERRORS.PASSKEY_NOT_FOUND, 404);

  await renamePasskeyCredential(credentialId, name.trim().slice(0, LIMITS.MAX_PASSKEY_NAME_LENGTH));
  return success({ success: true });
}
