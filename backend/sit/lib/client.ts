import { getEnvironmentConfig, API_PATHS, POW_HEADERS } from '@passvault/shared';
import type { ChallengeResponse } from '@passvault/shared';
import { solveChallenge } from './pow.js';

const baseUrl = process.env.SIT_BASE_URL ?? '';
const env = process.env.SIT_ENV ?? 'dev';
const config = getEnvironmentConfig(env);

const { rateLimit } = config.throttle;
const MIN_INTERVAL_MS = Math.ceil(1000 / rateLimit) + 50;
let lastRequestTime = 0;

async function pace(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

interface RequestOptions {
  body?: unknown;
  token?: string;
  powDifficulty?: number;
}

interface RequestResult<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

async function doRequest<T = unknown>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<RequestResult<T>> {
  await pace();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (opts.token) {
    headers['Authorization'] = `Bearer ${opts.token}`;
  }

  if (opts.powDifficulty !== undefined && config.features.powEnabled) {
    const challengeRes = await fetch(`${baseUrl}${API_PATHS.CHALLENGE}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const challengeJson = (await challengeRes.json()) as { success: boolean; data: ChallengeResponse };
    const { nonce, timestamp } = challengeJson.data;
    const solution = solveChallenge(nonce, timestamp, opts.powDifficulty);
    headers[POW_HEADERS.SOLUTION] = solution;
    headers[POW_HEADERS.NONCE] = nonce;
    headers[POW_HEADERS.TIMESTAMP] = timestamp.toString();
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  // On 429, retry once after 2s backoff
  if (res.status === 429) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    lastRequestTime = Date.now();
    return doRequest(method, path, opts);
  }

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null as T;
  }

  return { status: res.status, data, headers: res.headers };
}

// Convenience wrapper: auto-applies PoW when enabled for this env
function pow(difficulty: number): number | undefined {
  return config.features.powEnabled ? difficulty : undefined;
}

export { doRequest as request, pow };
