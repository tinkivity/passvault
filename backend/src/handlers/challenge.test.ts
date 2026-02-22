import { describe, it, expect, vi } from 'vitest';

// challenge.ts has no AWS calls but imports generateNonce from crypto utils
// which uses Node crypto — no mocks needed beyond the module check below.
vi.mock('../config.js', () => ({
  config: {
    environment: 'dev',
    features: { powEnabled: false, honeypotEnabled: true, totpRequired: false },
    session: { adminTokenExpiryHours: 24, userTokenExpiryMinutes: 30 },
  },
  getJwtSecret: vi.fn().mockResolvedValue('test-secret'),
  DYNAMODB_TABLE: 'test-table',
  FILES_BUCKET: 'test-bucket',
}));

import { handler } from './challenge.js';
import { POW_CONFIG } from '@passvault/shared';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const event: APIGatewayProxyEvent = {
  path: '/challenge',
  httpMethod: 'GET',
  headers: {},
  body: null,
  multiValueHeaders: {},
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  pathParameters: null,
  stageVariables: null,
  requestContext: {} as APIGatewayProxyEvent['requestContext'],
  resource: '/challenge',
  isBase64Encoded: false,
};

describe('GET /challenge', () => {
  it('returns 200 with a nonce, difficulty, timestamp and ttl', async () => {
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(typeof body.data.nonce).toBe('string');
    expect(body.data.nonce.length).toBeGreaterThan(0);
    expect(body.data.difficulty).toBe(POW_CONFIG.DIFFICULTY.LOW);
    expect(typeof body.data.timestamp).toBe('number');
    expect(body.data.ttl).toBe(POW_CONFIG.CHALLENGE_TTL_SECONDS);
  });

  it('returns a fresh nonce on each call', async () => {
    const [r1, r2] = await Promise.all([handler(event), handler(event)]);
    const n1 = JSON.parse(r1.body).data.nonce;
    const n2 = JSON.parse(r2.body).data.nonce;
    expect(n1).not.toBe(n2);
  });

  it('includes CORS headers', async () => {
    const res = await handler(event);
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});
