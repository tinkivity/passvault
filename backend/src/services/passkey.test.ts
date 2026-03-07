import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({
  getJwtSecret: vi.fn().mockResolvedValue('test-jwt-secret-32-chars-minimum!!'),
  DYNAMODB_TABLE: 'test-table',
  FILES_BUCKET: 'test-bucket',
  config: {
    environment: 'dev',
    features: { passkeyRequired: false },
    session: { adminTokenExpiryHours: 24, userTokenExpiryMinutes: 30 },
  },
}));

vi.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
}));

import {
  generateChallengeJwt,
  verifyChallengeJwt,
  generatePasskeyToken,
  verifyPasskeyToken,
  verifyPasskeyAssertion,
  verifyPasskeyAttestation,
} from './passkey.js';
import { verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

// ── Challenge JWT ─────────────────────────────────────────────────────────────

describe('generateChallengeJwt / verifyChallengeJwt', () => {
  it('round-trips: verify returns the challenge embedded in the JWT', async () => {
    const jwt = await generateChallengeJwt();
    expect(typeof jwt).toBe('string');
    expect(jwt.split('.').length).toBe(3);

    const challenge = await verifyChallengeJwt(jwt);
    expect(typeof challenge).toBe('string');
    expect(challenge.length).toBeGreaterThan(0);
  });

  it('throws when JWT is tampered', async () => {
    const jwt = await generateChallengeJwt();
    const tampered = jwt.slice(0, -5) + 'XXXXX';
    await expect(verifyChallengeJwt(tampered)).rejects.toThrow();
  });

  it('throws when JWT has wrong type claim', async () => {
    // Build a JWT with the right secret but wrong type
    const { default: jsonwebtoken } = await import('jsonwebtoken');
    const wrongType = jsonwebtoken.sign(
      { challenge: 'abc', type: 'wrong-type' },
      'test-jwt-secret-32-chars-minimum!!',
      { expiresIn: 300 },
    );
    await expect(verifyChallengeJwt(wrongType)).rejects.toThrow('Invalid challenge JWT type');
  });
});

// ── Passkey Token ─────────────────────────────────────────────────────────────

describe('generatePasskeyToken / verifyPasskeyToken', () => {
  it('round-trips: verify returns the userId', async () => {
    const token = await generatePasskeyToken('user-42');
    const userId = await verifyPasskeyToken(token);
    expect(userId).toBe('user-42');
  });

  it('throws when token is tampered', async () => {
    const token = await generatePasskeyToken('user-1');
    const tampered = token.slice(0, -5) + 'YYYYY';
    await expect(verifyPasskeyToken(tampered)).rejects.toThrow();
  });

  it('throws when token has wrong type claim', async () => {
    const { default: jsonwebtoken } = await import('jsonwebtoken');
    const wrongType = jsonwebtoken.sign(
      { userId: 'user-1', type: 'not-passkey-verified' },
      'test-jwt-secret-32-chars-minimum!!',
      { expiresIn: 300 },
    );
    await expect(verifyPasskeyToken(wrongType)).rejects.toThrow('Invalid passkey token type');
  });
});

// ── verifyPasskeyAssertion ────────────────────────────────────────────────────

describe('verifyPasskeyAssertion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PASSKEY_RP_ID = 'example.com';
    process.env.PASSKEY_ORIGIN = 'https://example.com';
  });

  it('returns verified=true and newCounter on success', async () => {
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 } as ReturnType<typeof verifyAuthenticationResponse> extends Promise<infer T> ? T['authenticationInfo'] : never,
    } as Awaited<ReturnType<typeof verifyAuthenticationResponse>>);

    const result = await verifyPasskeyAssertion(
      {} as AuthenticationResponseJSON,
      'challenge123',
      { credentialId: 'cred-1', publicKey: 'pubkey', counter: 4, transports: ['internal'] },
    );

    expect(result.verified).toBe(true);
    expect(result.newCounter).toBe(5);
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'challenge123',
        expectedOrigin: 'https://example.com',
        expectedRPID: 'example.com',
      }),
    );
  });

  it('returns verified=false when library returns false', async () => {
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: false,
    } as Awaited<ReturnType<typeof verifyAuthenticationResponse>>);

    const result = await verifyPasskeyAssertion(
      {} as AuthenticationResponseJSON,
      'challenge123',
      { credentialId: 'cred-1', publicKey: 'pubkey', counter: 0, transports: null },
    );
    expect(result.verified).toBe(false);
  });

  it('throws when PASSKEY_RP_ID env var is missing', async () => {
    delete process.env.PASSKEY_RP_ID;
    await expect(
      verifyPasskeyAssertion({} as AuthenticationResponseJSON, 'ch', {
        credentialId: 'c', publicKey: 'k', counter: 0, transports: null,
      }),
    ).rejects.toThrow('PASSKEY_RP_ID');
  });
});

// ── verifyPasskeyAttestation ──────────────────────────────────────────────────

describe('verifyPasskeyAttestation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PASSKEY_RP_ID = 'example.com';
    process.env.PASSKEY_ORIGIN = 'https://example.com';
  });

  it('returns credential fields on success', async () => {
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: new Uint8Array([1, 2, 3]),
          publicKey: new Uint8Array([4, 5, 6]),
          counter: 0,
        },
        aaguid: 'aaguid-uuid',
      },
    } as Awaited<ReturnType<typeof verifyRegistrationResponse>>);

    const attestation = {
      response: { transports: ['internal'] },
    } as unknown as RegistrationResponseJSON;

    const result = await verifyPasskeyAttestation(attestation, 'challenge123');
    expect(result.verified).toBe(true);
    expect(result.credentialId).toBeTruthy();
    expect(result.publicKey).toBeTruthy();
    expect(result.aaguid).toBe('aaguid-uuid');
    expect(result.transports).toEqual(['internal']);
  });

  it('returns verified=false when library returns false', async () => {
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: false,
    } as Awaited<ReturnType<typeof verifyRegistrationResponse>>);

    const result = await verifyPasskeyAttestation({} as RegistrationResponseJSON, 'challenge123');
    expect(result.verified).toBe(false);
  });
});
