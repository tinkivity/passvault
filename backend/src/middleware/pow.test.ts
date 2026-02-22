import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

// Mock config — default is dev (powEnabled: false)
vi.mock('../config.js', () => ({
  config: {
    environment: 'dev',
    features: {
      powEnabled: false,
      honeypotEnabled: true,
      totpRequired: false,
      wafEnabled: false,
      cloudFrontEnabled: false,
    },
    session: { adminTokenExpiryHours: 24, userTokenExpiryMinutes: 30 },
  },
  getJwtSecret: vi.fn().mockResolvedValue('test-secret'),
  DYNAMODB_TABLE: 'test-table',
  FILES_BUCKET: 'test-bucket',
}));

import { validatePow } from './pow.js';
import { config } from '../config.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(headers: Record<string, string> = {}): APIGatewayProxyEvent {
  return {
    path: '/test',
    httpMethod: 'POST',
    headers,
    body: null,
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/test',
    isBase64Encoded: false,
  };
}

/** Mirror of the backend's difficulty check. */
function meetsDifficulty(hash: string, difficulty: number): boolean {
  const fullNibbles = Math.floor(difficulty / 4);
  for (let i = 0; i < fullNibbles; i++) {
    if (hash[i] !== '0') return false;
  }
  const rem = difficulty % 4;
  if (rem > 0) {
    const nibble = parseInt(hash[fullNibbles], 16);
    const mask = (0xf << (4 - rem)) & 0xf;
    if (nibble & mask) return false;
  }
  return true;
}

/** Brute-force a valid PoW solution for the given inputs. */
function findSolution(nonce: string, timestamp: string, difficulty: number): string {
  for (let i = 0; i < 500_000; i++) {
    const sol = i.toString();
    const hash = createHash('sha256').update(nonce + sol + timestamp).digest('hex');
    if (meetsDifficulty(hash, difficulty)) return sol;
  }
  throw new Error('Could not find PoW solution in 500k attempts');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('validatePow — disabled (dev)', () => {
  beforeEach(() => {
    config.features.powEnabled = false;
  });

  it('returns valid without checking any headers', () => {
    const result = validatePow(makeEvent(), 20);
    expect(result.valid).toBe(true);
    expect(result.errorResponse).toBeNull();
  });

  it('still returns valid even when headers are absent', () => {
    const result = validatePow(makeEvent({}), 20);
    expect(result.valid).toBe(true);
  });
});

describe('validatePow — enabled (beta / prod)', () => {
  const nonce = 'test-nonce-abc123';
  const difficulty = 4; // 1 leading zero nibble — fast to brute-force

  beforeEach(() => {
    config.features.powEnabled = true;
  });

  it('returns 403 when PoW headers are missing', () => {
    const result = validatePow(makeEvent(), difficulty);
    expect(result.valid).toBe(false);
    expect(result.errorResponse?.statusCode).toBe(403);
  });

  it('returns 403 when timestamp is older than TTL', () => {
    const oldTs = (Math.floor(Date.now() / 1000) - 120).toString(); // 2 minutes ago
    const solution = findSolution(nonce, oldTs, difficulty);
    const result = validatePow(
      makeEvent({
        'x-pow-nonce': nonce,
        'x-pow-solution': solution,
        'x-pow-timestamp': oldTs,
      }),
      difficulty,
    );
    expect(result.valid).toBe(false);
    expect(result.errorResponse?.statusCode).toBe(403);
  });

  it('returns 403 when solution does not meet difficulty', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const result = validatePow(
      makeEvent({
        'x-pow-nonce': nonce,
        'x-pow-solution': 'definitely-wrong-solution',
        'x-pow-timestamp': ts,
      }),
      difficulty,
    );
    expect(result.valid).toBe(false);
    expect(result.errorResponse?.statusCode).toBe(403);
  });

  it('returns valid for a correct solution', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const solution = findSolution(nonce, ts, difficulty);
    const result = validatePow(
      makeEvent({
        'x-pow-nonce': nonce,
        'x-pow-solution': solution,
        'x-pow-timestamp': ts,
      }),
      difficulty,
    );
    expect(result.valid).toBe(true);
    expect(result.errorResponse).toBeNull();
  });

  it('accepts headers in any casing (X-Pow-* alias)', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const solution = findSolution(nonce, ts, difficulty);
    // Use the capitalized alias names
    const result = validatePow(
      makeEvent({
        'X-Pow-Nonce': nonce,
        'X-Pow-Solution': solution,
        'X-Pow-Timestamp': ts,
      }),
      difficulty,
    );
    expect(result.valid).toBe(true);
  });
});
