export const config = {
  environment: import.meta.env.VITE_ENVIRONMENT as 'dev' | 'beta' | 'prod' | undefined,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  passkeyRequired: import.meta.env.VITE_PASSKEY_REQUIRED === 'true',
  timeouts: {
    session: Number(import.meta.env.VITE_SESSION_TIMEOUT_SECONDS ?? 300),
    vault:   Number(import.meta.env.VITE_VAULT_TIMEOUT_SECONDS   ?? 600),
  },
  isDev:  import.meta.env.VITE_ENVIRONMENT === 'dev',
  isProd: import.meta.env.VITE_ENVIRONMENT === 'prod',
} as const;
