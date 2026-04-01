export const ROUTES = {
  LOGIN:           '/login',
  CHANGE_PASSWORD: '/change-password',
  PASSKEY_SETUP:   '/passkey-setup',

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
      LOGINS:    '/ui/admin/logs/logins',
    },
  },
} as const;
