import { createHash } from 'crypto';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { POW_HEADERS, POW_CONFIG, ERRORS } from '@passvault/shared';
import { error } from '../utils/response.js';
import { config } from '../config.js';

// Checks whether a SHA-256 hex digest satisfies the required leading-zero bit count.
// Difficulty is measured in bits, not hex characters, so a difficulty of 20 means
// the first 20 bits of the hash must all be zero. The check works in two passes:
//   1. Full nibbles (4 bits each) — the hex character must be '0'.
//   2. Partial nibble — the remaining bits are isolated with a bitmask applied
//      to the next hex character, requiring those high bits to be zero.
function hashMeetsDifficulty(hash: string, difficulty: number): boolean {
  const fullNibbles = Math.floor(difficulty / 4);
  for (let i = 0; i < fullNibbles; i++) {
    if (hash[i] !== '0') return false;
  }
  const remainingBits = difficulty % 4;
  if (remainingBits > 0) {
    const nibble = parseInt(hash[fullNibbles], 16);
    const mask = 0xF << (4 - remainingBits) & 0xF;
    if (nibble & mask) return false;
  }
  return true;
}

// Validates a client-side Proof-of-Work solution before processing a request.
// PoW forces the browser to burn CPU time before submitting sensitive requests
// (login, vault writes), raising the cost of automated attacks significantly.
//
// The client sends three headers: a nonce it chose, the solution (counter it
// iterated until the hash met the target), and the Unix timestamp when it started.
// This function re-hashes SHA-256(nonce + solution + timestamp) and checks that
// the result has at least `difficulty` leading zero bits. It also rejects solutions
// older than POW_CONFIG.CHALLENGE_TTL_SECONDS to prevent replay attacks.
//
// Returns { valid: true } on success, or { errorResponse } with the appropriate
// 403 body so handlers can return early without extra branching.
export function validatePow(event: APIGatewayProxyEvent, difficulty: number) {
  if (!config.features.powEnabled) {
    return { valid: true, errorResponse: null };
  }

  const solution = event.headers?.[POW_HEADERS.SOLUTION] || event.headers?.['X-Pow-Solution'];
  const nonce = event.headers?.[POW_HEADERS.NONCE] || event.headers?.['X-Pow-Nonce'];
  const timestamp = event.headers?.[POW_HEADERS.TIMESTAMP] || event.headers?.['X-Pow-Timestamp'];

  if (!solution || !nonce || !timestamp) {
    return { valid: false, errorResponse: error(ERRORS.POW_REQUIRED, 403) };
  }

  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - ts > POW_CONFIG.CHALLENGE_TTL_SECONDS) {
    return { valid: false, errorResponse: error(ERRORS.POW_EXPIRED, 403) };
  }

  const hash = createHash('sha256')
    .update(nonce + solution + timestamp)
    .digest('hex');

  if (!hashMeetsDifficulty(hash, difficulty)) {
    return { valid: false, errorResponse: error(ERRORS.POW_INVALID, 403) };
  }

  return { valid: true, errorResponse: null };
}
