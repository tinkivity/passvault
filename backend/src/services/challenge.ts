import { createHash } from 'crypto';
import { POW_CONFIG, type ChallengeResponse } from '@passvault/shared';
import { generateNonce } from '../utils/crypto.js';

/**
 * Check if the first `difficulty` bits of a SHA-256 hex digest are zero.
 * difficulty=16 → P=2^{-16} ≈ 65k iterations (~100ms in browser WASM)
 */
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

export function generateChallenge(difficulty: number): ChallengeResponse {
  return {
    nonce: generateNonce(POW_CONFIG.NONCE_BYTES),
    difficulty,
    timestamp: Math.floor(Date.now() / 1000),
    ttl: POW_CONFIG.CHALLENGE_TTL_SECONDS,
  };
}

export function validateSolution(nonce: string, solution: string, timestamp: number, difficulty: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > POW_CONFIG.CHALLENGE_TTL_SECONDS) return false;

  const hash = createHash('sha256')
    .update(nonce + solution + timestamp.toString())
    .digest('hex');

  return hashMeetsDifficulty(hash, difficulty);
}
