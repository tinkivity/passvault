import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { PASSKEY_CONFIG } from '@passvault/shared';
import { getJwtSecret } from '../config.js';

// ---------------------------------------------------------------------------
// Challenge JWT — stateless, signed with the shared JWT secret
// ---------------------------------------------------------------------------

interface ChallengeJwtPayload {
  challenge: string; // base64url-encoded random bytes
  type: 'webauthn-challenge';
}

export async function generateChallengeJwt(): Promise<string> {
  const secret = await getJwtSecret();
  const challenge = randomBytes(PASSKEY_CONFIG.CHALLENGE_BYTES).toString('base64url');
  const payload: ChallengeJwtPayload = { challenge, type: 'webauthn-challenge' };
  return jwt.sign(payload, secret, { expiresIn: PASSKEY_CONFIG.CHALLENGE_JWT_EXPIRY_SECONDS });
}

export async function verifyChallengeJwt(token: string): Promise<string> {
  const secret = await getJwtSecret();
  const payload = jwt.verify(token, secret) as ChallengeJwtPayload;
  if (payload.type !== 'webauthn-challenge') {
    throw new Error('Invalid challenge JWT type');
  }
  return payload.challenge;
}

// ---------------------------------------------------------------------------
// Passkey token — short-lived proof that passkey verification succeeded
// ---------------------------------------------------------------------------

interface PasskeyTokenPayload {
  userId: string;
  credentialId: string;
  passkeyName: string;
  type: 'passkey-verified';
}

export interface PasskeyTokenResult {
  userId: string;
  credentialId: string;
  passkeyName: string;
}

export async function generatePasskeyToken(userId: string, credentialId: string, passkeyName: string): Promise<string> {
  const secret = await getJwtSecret();
  const payload: PasskeyTokenPayload = { userId, credentialId, passkeyName, type: 'passkey-verified' };
  return jwt.sign(payload, secret, { expiresIn: PASSKEY_CONFIG.PASSKEY_TOKEN_EXPIRY_SECONDS });
}

export async function verifyPasskeyToken(token: string): Promise<PasskeyTokenResult> {
  const secret = await getJwtSecret();
  const payload = jwt.verify(token, secret) as PasskeyTokenPayload;
  if (payload.type !== 'passkey-verified') {
    throw new Error('Invalid passkey token type');
  }
  return { userId: payload.userId, credentialId: payload.credentialId, passkeyName: payload.passkeyName };
}

// ---------------------------------------------------------------------------
// WebAuthn verification helpers
// ---------------------------------------------------------------------------

function getRpConfig(requestOrigin?: string): { rpId: string; origin: string } {
  const rpId = process.env.PASSKEY_RP_ID;
  const origin = process.env.PASSKEY_ORIGIN;
  if (rpId && origin) return { rpId, origin };

  // Dev/beta: derive from the request origin header when env vars aren't set
  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin);
      return { rpId: url.hostname, origin: requestOrigin };
    } catch {
      // fall through
    }
  }
  throw new Error('PASSKEY_RP_ID and PASSKEY_ORIGIN env vars are required (or pass a valid request origin)');
}

export interface StoredCredential {
  credentialId: string;       // base64url
  publicKey: string;          // base64url COSE
  counter: number;
  transports: string[] | null;
}

export interface AssertionVerificationResult {
  verified: boolean;
  newCounter: number;
}

export async function verifyPasskeyAssertion(
  assertion: AuthenticationResponseJSON,
  expectedChallenge: string,
  storedCredential: StoredCredential,
  requestOrigin?: string,
): Promise<AssertionVerificationResult> {
  const { rpId, origin } = getRpConfig(requestOrigin);

  const result = await verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    credential: {
      id: storedCredential.credentialId,
      publicKey: Buffer.from(storedCredential.publicKey, 'base64url'),
      counter: storedCredential.counter,
      transports: (storedCredential.transports ?? []) as AuthenticatorTransportFuture[],
    },
  });

  return {
    verified: result.verified,
    newCounter: result.authenticationInfo?.newCounter ?? storedCredential.counter,
  };
}

export interface AttestationVerificationResult {
  verified: boolean;
  credentialId: string;
  publicKey: string;
  counter: number;
  aaguid: string;
  transports: string[];
}

export async function verifyPasskeyAttestation(
  attestation: RegistrationResponseJSON,
  expectedChallenge: string,
  requestOrigin?: string,
): Promise<AttestationVerificationResult> {
  const { rpId, origin } = getRpConfig(requestOrigin);

  const result = await verifyRegistrationResponse({
    response: attestation,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
  });

  if (!result.verified || !result.registrationInfo) {
    return {
      verified: false,
      credentialId: '',
      publicKey: '',
      counter: 0,
      aaguid: '',
      transports: [],
    };
  }

  const { credential, aaguid } = result.registrationInfo;

  return {
    verified: true,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    aaguid: aaguid ?? '',
    transports: (attestation.response as { transports?: string[] }).transports ?? [],
  };
}
