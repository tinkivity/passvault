export const ROUTES = {
  LOGIN:           '/login',
  ONBOARDING:      '/onboarding',
  CHANGE_PASSWORD: '/change-password',
  PASSKEY_SETUP:   '/passkey-setup',
  VERIFY_EMAIL_CHANGE: '/verify-email-change',
  LOCK_ACCOUNT: '/lock-account',

  UI: {
    ROOT:      '/ui',
    VAULT:     (vaultId: string) => `/ui/${vaultId}`,
    ITEMS:     (vaultId: string) => `/ui/${vaultId}/items`,
    ITEM_NEW:  (vaultId: string) => `/ui/${vaultId}/items/new`,
    ITEM:      (vaultId: string, itemId: string) => `/ui/${vaultId}/items/${itemId}`,

    ADMIN: {
      ROOT:      '/ui/admin',
      DASHBOARD: '/ui/admin/dashboard',
      USERS:     '/ui/admin/users',
      USER:      (userId: string) => `/ui/admin/users/${userId}`,
      /** @deprecated Use AUDIT instead */
      LOGINS:    '/ui/admin/logs/logins',
      AUDIT:     '/ui/admin/logs/audit',
    },
  },
} as const;
