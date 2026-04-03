import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { UserRole } from '@passvault/shared';
import { ERRORS } from '@passvault/shared';
import { success, error } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { getUserByCredentialId, updateUser } from '../utils/dynamodb.js';
import { config } from '../config.js';
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

  const user = await getUserByCredentialId(assertion.id);
  if (!user || user.role !== requiredRole || !user.passkeyCredentialId || !user.passkeyPublicKey) {
    return error(ERRORS.INVALID_PASSKEY, 401);
  }

  const result = await verifyPasskeyAssertion(assertion, expectedChallenge, {
    credentialId: user.passkeyCredentialId,
    publicKey: user.passkeyPublicKey,
    counter: user.passkeyCounter,
    transports: user.passkeyTransports,
  });
  if (!result.verified) return error(ERRORS.INVALID_PASSKEY, 401);

  await updateUser(user.userId, { passkeyCounter: result.newCounter });
  const passkeyToken = await generatePasskeyToken(user.userId);
  return success({ passkeyToken, username: user.username, encryptionSalt: user.encryptionSalt });
}

export async function handlePasskeyRegisterChallenge(
  event: APIGatewayProxyEvent,
  requiredRole: UserRole,
): Promise<APIGatewayProxyResult> {
  if (!config.features.passkeyRequired) return error('Passkey not enabled in this environment', 404);

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== requiredRole) return error(ERRORS.FORBIDDEN, 403);
  if (user!.status !== 'pending_passkey_setup') return error(ERRORS.PASSKEY_SETUP_REQUIRED, 400);

  const challengeJwt = await generateChallengeJwt();
  return success({ challengeJwt });
}

export async function handlePasskeyRegister(
  event: APIGatewayProxyEvent,
  requiredRole: UserRole,
): Promise<APIGatewayProxyResult> {
  if (!config.features.passkeyRequired) return error('Passkey not enabled in this environment', 404);

  const { user, errorResponse } = await requireAuth(event);
  if (errorResponse) return errorResponse;
  if (user!.role !== requiredRole) return error(ERRORS.FORBIDDEN, 403);
  if (user!.status !== 'pending_passkey_setup') return error(ERRORS.PASSKEY_SETUP_REQUIRED, 400);

  const parsed = parseBody(event);
  if ('parseError' in parsed) return parsed.parseError;

  const { challengeJwt, attestation } = parsed.body as { challengeJwt: string; attestation: RegistrationResponseJSON };
  if (!challengeJwt || !attestation) return error('Missing challengeJwt or attestation', 400);

  let expectedChallenge: string;
  try {
    expectedChallenge = await verifyChallengeJwt(challengeJwt);
  } catch {
    return error(ERRORS.INVALID_PASSKEY, 401);
  }

  const result = await verifyPasskeyAttestation(attestation, expectedChallenge);
  if (!result.verified) return error(ERRORS.INVALID_PASSKEY, 400);

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
