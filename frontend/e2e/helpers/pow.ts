/**
 * PoW (Proof of Work) helper for E2E tests.
 *
 * On beta/prod, API endpoints require a solved PoW challenge. This module
 * provides helpers that fetch a challenge, solve it, and return the headers
 * needed for authenticated API calls via Playwright's APIRequestContext.
 *
 * On dev (powEnabled=false), these helpers return empty headers — the
 * middleware lets requests through without PoW.
 */

import type { APIRequestContext } from '@playwright/test';
import { createHash } from 'crypto';

const POW_HEADERS = {
  SOLUTION:  'X-Pow-Solution',
  NONCE:     'X-Pow-Nonce',
  TIMESTAMP: 'X-Pow-Timestamp',
};

interface ChallengeResponse {
  nonce: string;
  difficulty: number;
  timestamp: number;
  ttl: number;
}

function hashMeetsDifficulty(hash: string, difficulty: number): boolean {
  const fullNibbles = Math.floor(difficulty / 4);
  for (let i = 0; i < fullNibbles; i++) {
    if (hash[i] !== '0') return false;
  }
  const remainingBits = difficulty % 4;
  if (remainingBits > 0) {
    const nibble = parseInt(hash[fullNibbles], 16);
    const mask = (0xF << (4 - remainingBits)) & 0xF;
    if (nibble & mask) return false;
  }
  return true;
}

function solvePoW(nonce: string, timestamp: number, difficulty: number): string {
  let counter = 0;
  while (true) {
    const solution = counter.toString(16).padStart(16, '0');
    const hash = createHash('sha256')
      .update(nonce + solution + timestamp.toString())
      .digest('hex');
    if (hashMeetsDifficulty(hash, difficulty)) return solution;
    counter++;
  }
}

/**
 * Fetch a PoW challenge and solve it. Returns headers to include in the
 * subsequent API request.
 *
 * @param request  Playwright APIRequestContext
 * @param apiBase  API base URL (e.g. http://localhost:3000 or https://beta.pv.example.com)
 * @param difficulty  Target difficulty to solve to (override the challenge's own difficulty)
 * @returns Record of PoW headers, or empty object if challenge fetch fails (dev mode)
 */
export async function solvePowChallenge(
  request: APIRequestContext,
  apiBase: string,
  difficulty: number,
): Promise<Record<string, string>> {
  try {
    const res = await request.get(`${apiBase}/api/challenge`);
    const body = await res.json();
    if (!body.success || !body.data) return {};
    const challenge = body.data as ChallengeResponse;
    const solution = solvePoW(challenge.nonce, challenge.timestamp, difficulty);
    return {
      [POW_HEADERS.SOLUTION]: solution,
      [POW_HEADERS.NONCE]: challenge.nonce,
      [POW_HEADERS.TIMESTAMP]: challenge.timestamp.toString(),
    };
  } catch {
    // Challenge not available (dev mode or network error) — proceed without PoW
    return {};
  }
}

/** PoW difficulty levels matching shared/src/constants.ts POW_CONFIG.DIFFICULTY */
export const POW_DIFFICULTY = {
  LOW: 16,
  MEDIUM: 18,
  HIGH: 20,
} as const;

/**
 * POST with PoW — convenience wrapper that solves a challenge then makes the request.
 */
export async function postWithPoW(
  request: APIRequestContext,
  apiBase: string,
  path: string,
  opts: {
    data?: unknown;
    headers?: Record<string, string>;
    difficulty: number;
  },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const powHeaders = await solvePowChallenge(request, apiBase, opts.difficulty);
  const res = await request.post(`${apiBase}${path}`, {
    data: opts.data,
    headers: { ...opts.headers, ...powHeaders },
  });
  const body = await res.json();
  return { status: res.status(), body };
}

/**
 * GET with PoW — convenience wrapper that solves a challenge then makes the request.
 */
export async function getWithPoW(
  request: APIRequestContext,
  apiBase: string,
  path: string,
  opts: {
    headers?: Record<string, string>;
    difficulty: number;
  },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const powHeaders = await solvePowChallenge(request, apiBase, opts.difficulty);
  const res = await request.get(`${apiBase}${path}`, {
    headers: { ...opts.headers, ...powHeaders },
  });
  const body = await res.json();
  return { status: res.status(), body };
}

/**
 * DELETE with PoW — convenience wrapper.
 */
export async function deleteWithPoW(
  request: APIRequestContext,
  apiBase: string,
  path: string,
  opts: {
    headers?: Record<string, string>;
    difficulty: number;
  },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const powHeaders = await solvePowChallenge(request, apiBase, opts.difficulty);
  const res = await request.delete(`${apiBase}${path}`, {
    headers: { ...opts.headers, ...powHeaders },
  });
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { /* empty response */ }
  return { status: res.status(), body };
}
