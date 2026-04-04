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
│   ├── admin/
│   │   ├── DashboardPage.tsx
│   │   ├── UsersPage.tsx
│   │   ├── UserDetailPage.tsx
│   │   └── AuditPage.tsx
│   └── auth/
│       ├── VerifyEmailChangePage.tsx
│       └── LockAccountPage.tsx
│
├── components/                   ← reusable, non-page components
│   ├── auth/                     ← auth page implementations (pages/ re-exports these)
│   ├── vault/                    ← vault shell, sidebar, breadcrumbs, page implementations
│   │   ├── VaultShell.tsx        ← layout shell; re-exports VaultShellContext
│   │   ├── VaultSidebar.tsx
│   │   ├── VaultBreadcrumbs.tsx
│   │   ├── SecretField.tsx
│   │   ├── ImportVaultDialog.tsx  ← import exported vault backup (client-side decrypt + re-encrypt)
│   │   └── pages/                ← vault page implementations (pages/ re-exports these)
│   ├── admin/                    ← admin widgets and page implementations
│   │   ├── AdminBreadcrumbs.tsx
│   │   ├── CreateUserForm.tsx
│   │   ├── DataTable.tsx
│   │   ├── DateRangeFilter.tsx
│   │   ├── OtpDisplay.tsx
│   │   ├── UserList.tsx
│   │   └── pages/                ← admin page implementations (pages/ re-exports these)
│   ├── auth/                     ← auth page implementations
│   │   ├── VerifyEmailChangePage.tsx
│   │   └── LockAccountPage.tsx
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
    /ui/admin/logs/audit          → AuditPage
/verify-email-change          → VerifyEmailChangePage (public, token in query string)
/lock-account                 → LockAccountPage (public, lock token in query string)
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

### Split vault data fetching (v2)

Vault data is stored as two separate S3 files (index + items). The `useVault` hook exposes two fetch functions:

- **`fetchIndex(vaultId)`** — fetches the lightweight index blob (item names, categories, warning codes). Called immediately when a vault is opened.
- **`fetchItems(vaultId)`** — fetches the full encrypted items blob. Called lazily when the user opens an individual item detail page.

This split enables faster initial vault load times since the index is much smaller than the full items payload.

---

## Configuration

### Environment variables (`config.ts`)

All `import.meta.env.VITE_*` reads are centralised in `src/config.ts`. Never read env vars directly in components — import from `config` instead:

```ts
import { config } from '../../config.js';

config.passkeyRequired      // VITE_PASSKEY_REQUIRED === 'true'
config.isDev                // VITE_ENVIRONMENT === 'dev'
config.isProd               // VITE_ENVIRONMENT === 'prod'
config.timeouts.session     // VITE_SESSION_TIMEOUT_SECONDS
config.timeouts.vaultTimeout // VITE_VAULT_TIMEOUT_SECONDS
```

### Required env vars (`.env.local` for dev)

```
VITE_API_BASE_URL=           # empty for prod/beta (CloudFront proxies); set to http://... for local dev
VITE_ENVIRONMENT=dev         # dev | beta | prod
VITE_PASSKEY_REQUIRED=false  # true only in prod
VITE_SESSION_TIMEOUT_SECONDS=300
VITE_VAULT_TIMEOUT_SECONDS=60
```

---

## Security

- **PoW** — every API request requires solving a proof-of-work challenge (difficulty LOW/MEDIUM/HIGH). Solved in a Web Worker (`services/pow-solver.ts`) to avoid blocking the UI.
- **Honeypot** — the login form includes a hidden field (`email_confirm`) that bots fill in but real users don't.
- **E2E encryption** — vault content is encrypted with AES-256-GCM. Key derivation uses Argon2id (`services/crypto.ts`). The derived key never leaves the browser.
- **Passkeys (WebAuthn)** — required in prod (`VITE_PASSKEY_REQUIRED=true`). Skipped in dev/beta. Users can register multiple passkeys (max 10); admins can register up to 2.
- **Never log passwords** — activity logs record that a change occurred, never the password value.
- **Auto-logout** — `useAutoLogout` hook triggers logout after inactivity (configurable per role via `config.timeouts`).

---

## Security Dialog and Passkey Management

`SecurityDialog` (in `components/shared/`) replaces the former `ChangePasswordDialog`. It is opened from the `NavUser` dropdown menu (menu item labeled "Security" instead of "Change Password").

The dialog contains two sections:

1. **Password change** -- standard current/new password form. This section is disabled for users who have registered passkeys, since password-based login is superseded by passkey authentication.
2. **Passkey management** -- lists the user's registered passkeys (name, provider, registration date) with the ability to register new passkeys (with a user-provided name) and revoke existing ones. Duplicate providers (same aaguid) are prevented.

`PasskeySetupPage` (onboarding flow) now includes a name input field for the passkey being registered and an optional skip button in dev/beta environments.

---

## Audit Page (v2)

`AuditPage` (`components/admin/pages/AuditPage.tsx`) replaces the former `LoginsPage`. It displays audit events from the `GET /api/admin/audit-events` endpoint, filterable by category. The page also provides a configuration panel to toggle which audit categories are enabled (via `GET/PUT /api/admin/audit-config`).

---

## Import Vault Dialog (v2)

`ImportVaultDialog` (`components/vault/ImportVaultDialog.tsx`) allows Pro+ users to import a previously exported vault backup. The flow:

1. User selects a `.json` backup file (must match `VaultDownloadResponse` format)
2. User enters the password that was used when the backup was created
3. Client decrypts the backup, shows a preview (item count, categories)
4. On confirm, the items are re-encrypted with the current vault key and saved

This is entirely client-side -- no new backend endpoint is required.

---

## Email Change Flow (v2)

Two public pages handle the email change verification flow (beta/prod only):

- **`VerifyEmailChangePage`** (`pages/auth/VerifyEmailChangePage.tsx`) — the user clicks a link in the verification email; the page reads the token from the query string and calls `POST /api/auth/verify-email-change`.
- **`LockAccountPage`** (`pages/auth/LockAccountPage.tsx`) — the original email owner receives a fraud-notification email with a lock link; clicking it calls `POST /api/auth/lock-self` to immediately lock the account.

Both pages are routed as flat siblings at the root level (no auth required).

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

---

## Encryption Flow

Vault content is encrypted end-to-end in the browser. The server only stores encrypted blobs.

1. **Key derivation**: `Argon2id(password, user.encryptionSalt)` → 256-bit key (via `services/crypto.ts`)
2. **Encrypt on save**: `JSON.stringify(VaultFile)` → `AES-256-GCM(plaintext, key, random IV)` → base64 → `PUT /api/vault/:id`
3. **Decrypt on load**: `GET /api/vault/:id` → base64 → `AES-256-GCM-decrypt` → `JSON.parse()` → `VaultFile`
4. **Warning codes**: `computeWarnings()` runs before every save, storing `warningCodes` inside the encrypted blob (zero-knowledge)
5. **Key lifecycle**: derived after login, held in `EncryptionContext`, cleared on logout

The derived key never leaves the browser and is never persisted to disk.

### Key functions (`services/crypto.ts`)

| Function | Purpose |
|----------|---------|
| `deriveKey(password, salt)` | Argon2id → CryptoKey (AES-256-GCM) |
| `encrypt(plaintext, key)` | AES-256-GCM encrypt → `{ ciphertext, iv, salt }` |
| `decrypt(encrypted, key)` | AES-256-GCM decrypt → plaintext string |
| `verifyPassword(password, salt, ciphertext)` | Derives temp key, attempts decrypt, returns boolean |

---

## Proof of Work

Every API request requires solving a SHA-256 PoW challenge. The solver runs in a **Web Worker** (`services/pow-solver.ts`) to avoid blocking the UI thread.

Flow: `GET /api/challenge` → `{ nonce, difficulty, timestamp, ttl }` → worker finds solution → headers attached to the actual request.

Difficulty levels: LOW (public), MEDIUM (auth), HIGH (admin/vault). Dev stacks skip PoW entirely (`powEnabled: false`).

---

## Honeypot

`services/honeypot.ts` generates hidden form fields and tracks timing. The login form includes a hidden `email_confirm` field — bots fill it, humans don't. Submit time < 1s is rejected as bot-like.

---

## Session & Vault Timeouts

Two independent timeout hooks manage session lifecycle:

### `useAutoLogout` — session inactivity timeout
`hooks/useAutoLogout.ts` manages the overall session timeout. A countdown timer is always visible in the shell header. User activity (mouse, keyboard, touch) resets the countdown. An "Extend session" button (modal with countdown) allows the user to reset the timer without re-authenticating. On expiry, `logout()` is called automatically.

| Environment | Session timeout |
|-------------|----------------|
| Dev/Beta | 5 min |
| Prod | 10 min |

### `useVaultTimeout` — per-vault unlock timeout
`hooks/useVaultTimeout.ts` manages how long a vault remains unlocked after password entry. When the timeout fires, the vault's derived encryption key is cleared (auto-lock), but the session remains active. A lock indicator appears next to the vault in the sidebar. The user must re-enter their password to unlock the vault again.

| Environment | Vault timeout |
|-------------|---------------|
| Dev/Beta | 10 min |
| Prod | 60 sec |

Timeouts are configured via `config.timeouts.session` and `config.timeouts.vaultTimeout` (from `VITE_SESSION_TIMEOUT_SECONDS` and `VITE_VAULT_TIMEOUT_SECONDS`).
