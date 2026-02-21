// Web Worker: SHA-256 Proof-of-Work solver
// Uses hash-wasm for synchronous WASM SHA-256 (orders of magnitude faster than
// iterating crypto.subtle.digest which has per-call async overhead).
//
// Message in:  { nonce: string, timestamp: number, difficulty: number }
// Message out: { solution: string }

import { createSHA256 } from 'hash-wasm';

interface SolveMessage {
  nonce: string;
  timestamp: number;
  difficulty: number;
}

/**
 * Check if the first `difficulty` bits of a SHA-256 hex digest are zero.
 * Must match the server-side implementation exactly.
 */
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

self.onmessage = async (event: MessageEvent<SolveMessage>) => {
  const { nonce, timestamp, difficulty } = event.data;

  // Initialize the hasher once — after this, .init()/.update()/.digest() are synchronous
  const hasher = await createSHA256();
  const encoder = new TextEncoder();
  const tsStr = timestamp.toString();

  let counter = 0;
  while (true) {
    const solution = counter.toString(16).padStart(16, '0');

    hasher.init();
    hasher.update(encoder.encode(nonce + solution + tsStr));
    const hashHex = hasher.digest('hex');

    if (hashMeetsDifficulty(hashHex, difficulty)) {
      self.postMessage({ solution });
      return;
    }
    counter++;
  }
};
