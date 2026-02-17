import { createHash } from 'crypto';
import { POW_CONFIG, type ChallengeResponse } from '@passvault/shared';
import { generateNonce } from '../utils/crypto.js';

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

  const target = '0'.repeat(difficulty) + 'f'.repeat(64 - difficulty);
  return hash < target;
}
