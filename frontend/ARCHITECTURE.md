# Frontend Architecture

## Directory Structure

```
src/
├── pages/                        ← page components, feature-organised
│   ├── auth/
│   │   ├── LoginPage.tsx
│   │   ├── PasswordChangePage.tsx
│   │   └── PasskeySetupPage.tsx
│   ├── vault/
│   │   ├── VaultUnlockPage.tsx
│   │   ├── VaultItemsPage.tsx
│   │   ├── VaultItemNewPage.tsx
│   │   └── VaultItemDetailPage.tsx
│   └── admin/
│       ├── DashboardPage.tsx
│       ├── UsersPage.tsx
│       ├── UserDetailPage.tsx
│       └── LoginsPage.tsx
│
├── components/                   ← reusable, non-page components
│   ├── auth/                     ← auth page implementations (pages/ re-exports these)
│   ├── vault/                    ← vault shell, sidebar, breadcrumbs, page implementations
│   │   ├── VaultShell.tsx        ← layout shell; re-exports VaultShellContext
│   │   ├── VaultSidebar.tsx
│   │   ├── VaultBreadcrumbs.tsx
│   │   ├── SecretField.tsx
│   │   └── pages/                ← vault page implementations (pages/ re-exports these)
│   ├── admin/                    ← admin widgets and page implementations
│   │   ├── AdminBreadcrumbs.tsx
│   │   ├── CreateUserForm.tsx
│   │   ├── DataTable.tsx
│   │   ├── DateRangeFilter.tsx
│   │   ├── OtpDisplay.tsx
│   │   ├── UserList.tsx
│   │   └── pages/                ← admin page implementations (pages/ re-exports these)
│   ├── shared/                   ← cross-feature widgets
│   │   ├── AccountDialog.tsx
│   │   ├── Breadcrumbs.tsx
│   │   ├── NavUser.tsx
│   │   ├── NotificationsDialog.tsx
│   │   └── ShellHeader.tsx
│   ├── layout/
│   │   ├── EnvironmentBanner.tsx
│   │   └── Layout.tsx
│   └── ui/                       ← shadcn primitives (generated, do not edit)
│
├── router/                       ← route definitions, split by feature
│   ├── index.tsx                 ← assembles the final router
│   ├── authRoutes.tsx            ← /login, /change-password, /passkey-setup
│   ├── vaultRoutes.tsx           ← /ui/:vaultId/...
│   └── adminRoutes.tsx           ← /ui/admin/...
│
├── guards/                       ← route guard components
│   ├── RequireAuth.tsx
│   ├── RequireAdmin.tsx
│   └── RequireOnboarding.tsx
│
├── context/                      ← React contexts
│   ├── AuthContext.tsx
│   ├── EncryptionContext.tsx
│   └── VaultShellContext.tsx     ← VaultShell layout state shared with vault pages
│
├── hooks/                        ← custom React hooks
├── services/                     ← API client, crypto, PoW solver
├── lib/                          ← pure utilities (password generation, etc.)
├── config.ts                     ← all env var reads centralised here
└── routes.ts                     ← typed ROUTES constant (single source of truth for paths)
```

---

## Routing

The router is assembled in `router/index.tsx` from three sub-routers:

```
/                    → redirect to /login
/login               → LoginPage
/change-password     → RequireOnboarding(password) → PasswordChangePage
/passkey-setup       → RequireOnboarding(passkey)  → PasskeySetupPage
/ui                  → RequireAuth → VaultShell
  /ui/:vaultId                    → VaultUnlockPage
  /ui/:vaultId/items              → VaultItemsPage
  /ui/:vaultId/items/new          → VaultItemNewPage
  /ui/:vaultId/items/:itemId      → VaultItemDetailPage
  /ui/admin          → RequireAdmin
    /ui/admin/dashboard           → DashboardPage
    /ui/admin/users               → UsersPage
    /ui/admin/users/:userId       → UserDetailPage
    /ui/admin/logs/logins         → LoginsPage
```

### Guards

- **`RequireAuth`** — redirects unauthenticated users to `/login`; redirects mid-onboarding users to the correct onboarding step.
- **`RequireAdmin`** — redirects non-admin users to `/ui`.
- **`RequireOnboarding`** — validates the user's status matches the expected onboarding step; redirects otherwise.

### Path constants

All route paths are defined in `routes.ts` as the `ROUTES` constant. Never hard-code path strings — always use `ROUTES.*`. Dynamic paths use builder functions:

```ts
ROUTES.UI.VAULT(vaultId)          // /ui/:vaultId
ROUTES.UI.ITEMS(vaultId)          // /ui/:vaultId/items
ROUTES.UI.ITEM(vaultId, itemId)   // /ui/:vaultId/items/:itemId
ROUTES.UI.ADMIN.USER(userId)      // /ui/admin/users/:userId
```

---

## State Management

| Context | What it holds | When to use |
|---|---|---|
| `AuthContext` | token, role, username, status, plan | Any component that needs auth state or auth actions (login/logout) |
| `EncryptionContext` | per-vault derived keys | Vault pages that encrypt/decrypt content |
| `VaultShellContext` | vaults list, warning catalog, refreshVaults | Vault pages that need the sidebar's vault list |

`VaultShellContext` is provided by `VaultShell` and consumed by vault pages via `useVaultShellContext()`. It is defined in `context/VaultShellContext.tsx` and re-exported from `VaultShell.tsx` for convenience.

---

## Data Fetching

- **Route-level data** (data always needed when a route mounts): fetched in `useEffect` inside page components using the `useAdmin`, `useVault`, `useVaults` hooks.
- **Lazy / optional data** (e.g. `UserActivityCard`): fetched in the component that renders it, managing its own loading/error state. This prevents shared loading flags from disabling unrelated UI.

The `useAdmin` hook manages a single `loading` flag for all admin operations. Components that have independent data needs (like `UserActivityCard`) manage their own state to avoid the shared flag disabling action buttons while data loads.

---

## Configuration

### Environment variables (`config.ts`)

All `import.meta.env.VITE_*` reads are centralised in `src/config.ts`. Never read env vars directly in components — import from `config` instead:

```ts
import { config } from '../../config.js';

config.passkeyRequired      // VITE_PASSKEY_REQUIRED === 'true'
config.isDev                // VITE_ENVIRONMENT === 'dev'
config.isProd               // VITE_ENVIRONMENT === 'prod'
config.timeouts.view        // VITE_VIEW_TIMEOUT_SECONDS
config.timeouts.admin       // VITE_ADMIN_TIMEOUT_SECONDS
```

### Required env vars (`.env.local` for dev)

```
VITE_API_BASE_URL=           # empty for prod/beta (CloudFront proxies); set to http://... for local dev
VITE_ENVIRONMENT=dev         # dev | beta | prod
VITE_PASSKEY_REQUIRED=false  # true only in prod
VITE_VIEW_TIMEOUT_SECONDS=900
VITE_EDIT_TIMEOUT_SECONDS=600
VITE_ADMIN_TIMEOUT_SECONDS=86400
```

---

## Security

- **PoW** — every API request requires solving a proof-of-work challenge (difficulty LOW/MEDIUM/HIGH). Solved in a Web Worker (`services/pow-solver.ts`) to avoid blocking the UI.
- **Honeypot** — the login form includes a hidden field (`email_confirm`) that bots fill in but real users don't.
- **E2E encryption** — vault content is encrypted with AES-256-GCM. Key derivation uses Argon2id (`services/crypto.ts`). The derived key never leaves the browser.
- **Passkeys (WebAuthn)** — required in prod (`VITE_PASSKEY_REQUIRED=true`). Skipped in dev/beta.
- **Never log passwords** — activity logs record that a change occurred, never the password value.
- **Auto-logout** — `useAutoLogout` hook triggers logout after inactivity (configurable per role via `config.timeouts`).

---

## Adding a New Page

1. **Add the path** to `src/routes.ts`:
   ```ts
   ROUTES.UI.MY_FEATURE = '/ui/my-feature'
   // or a builder: MY_ITEM: (id: string) => `/ui/my-feature/${id}`
   ```

2. **Add the route** to the appropriate sub-router in `src/router/`:
   ```tsx
   { path: 'my-feature', element: <MyFeaturePage /> }
   ```

3. **Create the page** in `src/pages/<feature>/MyFeaturePage.tsx`.

4. **Add the re-export shim** (optional, for gradual migration) if the implementation lives in `src/components/`:
   ```ts
   // src/pages/<feature>/MyFeaturePage.tsx
   export { MyFeaturePage } from '../../components/<feature>/MyFeaturePage.js';
   ```

5. **Add a guard** if the page requires auth/admin — compose with existing guards in the router.
