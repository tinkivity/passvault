import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { validateHoneypot } from './honeypot.js';
import { config } from '../config.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';

function makeEvent(body: object | null = null): APIGatewayProxyEvent {
  return {
    path: '/test',
    httpMethod: 'POST',
    headers: {},
    body: body !== null ? JSON.stringify(body) : null,
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

describe('validateHoneypot — disabled', () => {
  beforeEach(() => {
    config.features.honeypotEnabled = false;
  });

  it('passes without inspecting the body', () => {
    const result = validateHoneypot(makeEvent({ email: 'bot@example.com' }));
    expect(result.valid).toBe(true);
    expect(result.errorResponse).toBeNull();
  });
});

describe('validateHoneypot — enabled (all stacks)', () => {
  beforeEach(() => {
    config.features.honeypotEnabled = true;
  });

  it('passes when honeypot fields are absent', () => {
    const result = validateHoneypot(makeEvent({ username: 'alice', password: 'secret' }));
    expect(result.valid).toBe(true);
    expect(result.errorResponse).toBeNull();
  });

  it('passes when honeypot fields are empty strings', () => {
    const result = validateHoneypot(
      makeEvent({ username: 'alice', email: '', phone: '', website: '' }),
    );
    expect(result.valid).toBe(true);
  });

  it('returns 403 when `email` is filled', () => {
    const result = validateHoneypot(makeEvent({ email: 'bot@example.com' }));
    expect(result.valid).toBe(false);
    expect(result.errorResponse?.statusCode).toBe(403);
  });

  it('returns 403 when `phone` is filled', () => {
    const result = validateHoneypot(makeEvent({ phone: '555-1234' }));
    expect(result.valid).toBe(false);
    expect(result.errorResponse?.statusCode).toBe(403);
  });

  it('returns 403 when `website` is filled', () => {
    const result = validateHoneypot(makeEvent({ website: 'https://spam.example' }));
    expect(result.valid).toBe(false);
    expect(result.errorResponse?.statusCode).toBe(403);
  });

  it('passes when body is null', () => {
    const result = validateHoneypot(makeEvent(null));
    expect(result.valid).toBe(true);
  });

  it('passes when body is invalid JSON (treated as empty)', () => {
    const event = makeEvent(null);
    event.body = 'not-json{{{';
    const result = validateHoneypot(event);
    expect(result.valid).toBe(true);
  });
});
