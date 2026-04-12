/**
 * Resolve environment-specific baselines from baselines.json.
 *
 * The JSON has a "default" section (calibrated for dev, no PoW) and optional
 * per-environment overrides ("beta", "prod") that account for PoW overhead,
 * network latency, and Lambda configuration differences.
 *
 * Resolution: environment-specific value if present, otherwise default.
 */

import raw from '../baselines.json';

export interface Baselines {
  version: string;
  endpoints: Record<string, { p95: number }>;
  concurrent: { max_per_user_ms: number; allow_429: boolean };
  payload: Record<string, number>;
}

type RawBaselines = typeof raw;
type EnvOverride = Partial<{
  endpoints: Record<string, { p95: number }>;
  concurrent: Partial<{ max_per_user_ms: number; allow_429: boolean }>;
  payload: Record<string, number>;
}>;

/**
 * Resolve baselines for the given environment.
 * Merges environment-specific overrides on top of the default section.
 */
export function resolveBaselines(env: string): Baselines {
  const defaults = raw.default;
  const override: EnvOverride = (raw as Record<string, unknown>)[env] as EnvOverride ?? {};

  return {
    version: raw.version,
    endpoints: {
      ...defaults.endpoints,
      ...(override.endpoints ?? {}),
    },
    concurrent: {
      ...defaults.concurrent,
      ...(override.concurrent ?? {}),
    },
    payload: {
      ...defaults.payload,
      ...(override.payload ?? {}),
    },
  };
}
