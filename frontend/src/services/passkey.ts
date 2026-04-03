import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type { PasskeyAssertionJSON, PasskeyAttestationJSON } from '@passvault/shared';

// Decode the challenge bytes from the challenge JWT payload (no signature verification —
// the server verifies the JWT on both ends). The challenge is base64url-encoded inside
// the JWT payload and must be passed as-is to the WebAuthn browser API.
function extractChallengeFromJwt(jwt: string): string {
  const payloadB64 = jwt.split('.')[1];
  if (!payloadB64) throw new Error('Invalid challenge JWT format');
  // base64url → base64 → parse
  const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
  const payload = JSON.parse(json) as { challenge?: string };
  if (!payload.challenge) throw new Error('Challenge not found in JWT payload');
  return payload.challenge;
}

// Step 2a of login: present the browser WebAuthn dialog for authentication.
// Returns the raw assertion to be submitted to POST /auth/passkey/verify.
export async function authenticateWithPasskey(
  challengeJwt: string,
): Promise<PasskeyAssertionJSON> {
  const challenge = extractChallengeFromJwt(challengeJwt);
  const result = await startAuthentication({ optionsJSON: { challenge, rpId: undefined } });
  // Cast clientExtensionResults: the library types it as AuthenticationExtensionsClientOutputs
  // (no index signature) but the value is always a plain object compatible with Record<string, unknown>.
  return { ...result, clientExtensionResults: result.clientExtensionResults as Record<string, unknown> };
}

// Step 5 of onboarding: present the browser WebAuthn dialog for registration.
// Returns the raw attestation to be submitted to POST /auth/passkey/register.
export async function registerPasskey(
  challengeJwt: string,
  userId: string,
  username: string,
  existingCredentialIds: string[] = [],
): Promise<PasskeyAttestationJSON> {
  const challenge = extractChallengeFromJwt(challengeJwt);
  const result = await startRegistration({
    optionsJSON: {
      challenge,
      rp: { name: 'PassVault' },
      user: {
        id: userId,
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      excludeCredentials: existingCredentialIds.map(id => ({ id, type: 'public-key' as const })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });
  return { ...result, clientExtensionResults: result.clientExtensionResults as Record<string, unknown> };
}
