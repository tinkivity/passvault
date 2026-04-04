import { createHash } from 'node:crypto';

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

export function solveChallenge(nonce: string, timestamp: number, difficulty: number): string {
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
