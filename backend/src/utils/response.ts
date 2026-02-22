import type { APIGatewayProxyResult } from 'aws-lambda';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN ?? '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Pow-Solution,X-Pow-Nonce,X-Pow-Timestamp',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  };
}

export function success<T>(data: T, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify({ success: true, data }),
  };
}

export function error(message: string, statusCode = 400, details?: string[]): APIGatewayProxyResult {
  const body: Record<string, unknown> = { error: message, statusCode };
  if (details) body.details = details;
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}
