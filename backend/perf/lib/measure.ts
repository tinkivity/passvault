/**
 * Measurement utilities for perf benchmarks.
 */

export interface Stats {
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface BenchmarkResult extends Stats {
  name: string;
  samples: number[];
  baseline?: number;
}

/** Run an async function and return elapsed time in ms. */
export async function measure(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  const end = performance.now();
  return Math.round(end - start);
}

/** Compute percentile statistics from a sorted array of numbers. */
export function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const len = sorted.length;
  if (len === 0) {
    return { min: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  return {
    min: sorted[0],
    p50: sorted[Math.floor(len * 0.5)],
    p95: sorted[Math.ceil(len * 0.95) - 1],
    p99: sorted[Math.ceil(len * 0.99) - 1],
    max: sorted[len - 1],
  };
}

/**
 * Run an async function N times sequentially, collecting timing samples.
 * Returns a full BenchmarkResult with name, samples, and stats.
 */
export async function benchmark(
  name: string,
  fn: () => Promise<void>,
  iterations = 10,
): Promise<BenchmarkResult> {
  const samples: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const elapsed = await measure(fn);
    samples.push(elapsed);
  }

  const s = stats(samples);
  return { name, samples, ...s };
}
