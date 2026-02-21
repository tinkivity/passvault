import type { ChallengeResponse, PowHeaders } from '@passvault/shared';
import { POW_HEADERS } from '@passvault/shared';

/**
 * Solve a PoW challenge using a Web Worker (off the main thread).
 * Returns the headers to attach to the next request.
 */
export async function solveChallenge(challenge: ChallengeResponse): Promise<PowHeaders> {
  const { nonce, timestamp, difficulty } = challenge;

  const solution = await solveInWorker(nonce, timestamp, difficulty);

  return {
    [POW_HEADERS.SOLUTION]: solution,
    [POW_HEADERS.NONCE]: nonce,
    [POW_HEADERS.TIMESTAMP]: timestamp.toString(),
  } as PowHeaders;
}

function solveInWorker(nonce: string, timestamp: number, difficulty: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./pow-worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent<{ solution: string }>) => {
      worker.terminate();
      resolve(event.data.solution);
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(`PoW worker error: ${err.message}`));
    };

    worker.postMessage({ nonce, timestamp, difficulty });
  });
}
