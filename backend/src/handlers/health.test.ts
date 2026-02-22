import { describe, it, expect, vi } from 'vitest';

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

import { handler } from './health.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const event: APIGatewayProxyEvent = {
  path: '/health',
  httpMethod: 'GET',
  headers: {},
  body: null,
  multiValueHeaders: {},
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  pathParameters: null,
  stageVariables: null,
  requestContext: {} as APIGatewayProxyEvent['requestContext'],
  resource: '/health',
  isBase64Encoded: false,
};

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });

  it('includes the environment name', async () => {
    const res = await handler(event);
    const body = JSON.parse(res.body);
    expect(body.data.environment).toBe('dev');
  });

  it('includes a timestamp', async () => {
    const res = await handler(event);
    const body = JSON.parse(res.body);
    expect(new Date(body.data.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('includes CORS headers', async () => {
    const res = await handler(event);
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});
