export const config = {
  environment: import.meta.env.VITE_ENVIRONMENT as 'dev' | 'beta' | 'prod' | undefined,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  passkeyRequired: import.meta.env.VITE_PASSKEY_REQUIRED === 'true',
  timeouts: {
    view:  Number(import.meta.env.VITE_VIEW_TIMEOUT_SECONDS  ?? 300),
    edit:  Number(import.meta.env.VITE_EDIT_TIMEOUT_SECONDS  ?? 600),
    admin: Number(import.meta.env.VITE_ADMIN_TIMEOUT_SECONDS ?? 86400),
  },
  isDev:  import.meta.env.VITE_ENVIRONMENT === 'dev',
  isProd: import.meta.env.VITE_ENVIRONMENT === 'prod',
} as const;
