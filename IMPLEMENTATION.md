# PassVault - Implementation Plan

## Overview

This document describes the sequential build plan for the PassVault MVP. The architecture maintains maximum separation of concerns through a 4-package monorepo where each package has clear boundaries. The build order follows the dependency chain: types first, then infrastructure, then backend bottom-up, then frontend bottom-up.

Each step produces a testable, self-contained layer. No step reaches into the internals of another — they communicate through the types defined in Step 1.

---

## Technical Choices

| Decision | Choice |
|----------|--------|
| Monorepo | npm workspaces |
| Frontend | Vite + React + Tailwind CSS v4 |
| Backend bundling | esbuild |
| Testing | Vitest |
| Argon2 (browser) | `argon2-browser` (WASM) |
| Argon2 (server) | `argon2` (native) |
| JWT | `jsonwebtoken` |
| Password hashing | `bcryptjs` |
| Passkeys (WebAuthn) | `@simplewebauthn/server` (backend), `@simplewebauthn/browser` (frontend) |
| AWS SDK | `@aws-sdk/client-*` v3 |

---

## Build Order (8 Steps)

```
Step 1: shared/          ── types, configs, constants (the contract layer)
Step 2: cdk/             ── infrastructure as code
Step 3: backend/utils    ── crypto, JWT, S3, DynamoDB helpers
Step 4: backend/middle   ── auth, PoW, honeypot middleware
Step 5: backend/services ── auth, admin, passkey, vault, challenge business logic
Step 6: backend/handlers ── Lambda entry points wiring middleware + services
Step 7: frontend/services── API client, encryption, PoW solver
Step 8: frontend/UI      ── components, hooks, contexts, routing
```

---

### Step 1: Shared Package (`shared/`)

The contract layer. Every other package imports from here, nothing imports into here.

```
shared/src/
├── types/
│   ├── environment.ts    # EnvironmentConfig, FeatureFlags, SessionConfig
│   ├── user.ts           # User model, UserRole, UserStatus, UserPlan
│   ├── auth.ts           # LoginRequest/Response (incl. plan), ChangePasswordRequest/Response
│   ├── admin.ts          # CreateUserRequest/Response, ListUsersResponse, AdminStats
│   ├── vault.ts          # VaultGetResponse, VaultPutRequest, VaultDownloadResponse, VaultSummary
│   ├── vault-schema.ts   # VaultFile, VaultItem, all 7 category types, WarningCode
│   ├── challenge.ts      # ChallengeResponse, PowHeaders
│   └── api.ts            # ApiResponse<T>, ApiError
├── config/
│   ├── environments.ts   # devConfig, betaConfig, prodConfig, getEnvironmentConfig()
│   ├── password-policy.ts# PASSWORD_MIN_LENGTH, validatePassword()
│   └── crypto-params.ts  # ARGON2_PARAMS, AES_PARAMS, SALT_LENGTH, ENCRYPTION_ALGORITHM
├── constants.ts          # API paths, error messages, LIMITS (incl. VAULT_LIMITS, EMAIL_PATTERN)
└── index.ts              # barrel export
```

Also: root `package.json` (workspaces), `tsconfig.base.json`, all package scaffolding (package.json + tsconfig for backend/frontend/cdk).

**Done when**: `npm install` works, `tsc --noEmit` passes on shared, all other packages can `import { EnvironmentConfig } from '@passvault/shared'`.

**Status**: Complete

---

### Step 2: CDK Package (`cdk/`)

Infrastructure as code. Depends only on `shared/` for `EnvironmentConfig`.

```
cdk/
├── bin/passvault.ts              # entry point, reads --context env
└── lib/
    ├── passvault-stack.ts        # composes constructs, conditional WAF + kill switch
    ├── kill-switch-handler.ts    # Lambda handler: SNS → WAF KillSwitchBlock flip
    └── constructs/
        ├── storage.ts            # DynamoDB + 2 S3 buckets
        ├── backend.ts            # 5 Lambdas + API Gateway + IAM
        ├── security.ts           # WAF (only if wafEnabled)
        ├── frontend.ts           # CloudFront + S3 static hosting
        ├── monitoring.ts         # CloudWatch dashboards + alarms + SNS (prod only)
        └── kill-switch.ts        # Kill switch Lambda + SNS subscription (prod only)
```

Build order within step: storage → backend → security → frontend → monitoring → kill-switch → stack.

**Done when**: `cdk synth --context env=dev` produces valid CloudFormation. All three environments synthesize without errors.

**Status**: Complete

---

### Step 3: Backend Utilities (`backend/src/utils/`)

The lowest layer of the backend. Pure functions with no handler or service dependencies.

```
backend/src/
├── utils/
│   ├── crypto.ts         # bcrypt hash/verify, random OTP generation, salt generation
│   ├── password.ts       # validatePassword() (server-side, calls shared policy)
│   ├── jwt.ts            # signToken(), verifyToken(), token payload types
│   ├── s3.ts             # getVaultFile(), putVaultFile(), deleteVaultFile(), getLegacyVaultFile(), migrateLegacyVaultFile()
│   ├── dynamodb.ts       # DynamoDB client, user CRUD, vault record CRUD (passvault-vaults table), login events
│   └── response.ts       # success(), error() Lambda response builders with CORS headers
├── config.ts             # loads EnvironmentConfig from ENVIRONMENT env var
└── package.json
```

**Done when**: each utility has unit tests with mocked AWS SDK. `npm test` passes.

**Status**: Complete

---

### Step 4: Backend Middleware (`backend/src/middleware/`)

Cross-cutting concerns that wrap handler logic. Depends on utils (Step 3).

```
backend/src/middleware/
├── auth.ts               # JWT extraction + validation, attaches user to context
├── pow.ts                # validates X-PoW-* headers, checks difficulty + TTL
└── honeypot.ts           # hidden field detection, timing validation
```

**Done when**: middleware functions are tested with mock events. Auth middleware correctly rejects expired/invalid tokens. PoW middleware validates solutions against difficulty target.

**Status**: Complete

---

### Step 5: Backend Services (`backend/src/services/`)

Business logic layer. Depends on utils (Step 3). Called by handlers (Step 6).

```
backend/src/services/
├── auth.ts               # login(), changePassword() — env-conditional passkey flow; locked/retired/expired status checks
├── admin.ts              # adminLogin(), createUserInvitation(), listUsers(), lockUser(), unlockUser(), expireUser(), retireUser(), verifyEmailToken()
├── passkey.ts            # challenge JWTs, passkey tokens, WebAuthn verify/register
├── vault.ts              # getVault(), putVault(), downloadVault(), createVault() (plan limits), deleteVault(), sendVaultEmail()
└── challenge.ts          # generateChallenge(), validateSolution()
```

Each service is a module of pure-ish functions that orchestrate utils. No Lambda event parsing here — that's the handler's job.

**Done when**: services are unit-tested with mocked DynamoDB/S3. Auth flow (OTP login → password change → passkey setup → active) works in tests for both passkey-enabled and passkey-disabled configs.

**Status**: Complete

---

### Step 6: Backend Handlers (`backend/src/handlers/`)

Lambda entry points. Thin layer: parse event → call middleware → call service → return response. Depends on middleware (Step 4) + services (Step 5).

```
backend/src/handlers/
├── auth.ts               # POST /api/auth/login, /api/auth/change-password, /api/auth/passkey/*
│                         # GET /api/auth/verify-email?token=xxx (prod: email verification link)
│                         # POST /api/auth/logout
├── admin.ts              # POST /api/admin/login, /api/admin/change-password, /api/admin/passkey/*
│                         # GET /api/admin/users, POST /api/admin/users (create)
│                         # GET /api/admin/users/:userId
│                         # POST /api/admin/users/lock, /unlock, /expire, /retire
│                         # POST /api/admin/users/refresh-otp
│                         # DELETE /api/admin/users?userId= (delete pending user)
│                         # GET /api/admin/stats
│                         # GET /api/admin/login-events
├── vault.ts              # GET /api/vaults, POST /api/vaults (create), DELETE /api/vaults/:vaultId
│                         # GET /api/vault/:vaultId, PUT /api/vault/:vaultId
│                         # GET /api/vault/:vaultId/download
│                         # POST /api/vault/:vaultId/email
│                         # GET /api/config/warning-codes (no auth — warning code catalog)
├── challenge.ts          # GET /api/challenge
└── health.ts             # GET /api/health
```

Each handler is a router: parses `event.httpMethod` + `event.path`, delegates to the right service function.

**Done when**: handlers tested with mock API Gateway events. `esbuild` bundles each handler into a single JS file for Lambda. Deploy to dev with `cdk deploy PassVault-Dev --context env=dev` and smoke-test all endpoints with curl.

**Status**: Complete

---

### Step 7: Frontend Services (`frontend/src/services/`)

The non-UI layer of the frontend. Depends only on `shared/` types.

```
frontend/src/services/
├── crypto.ts             # deriveKey() [Argon2id], encrypt() [AES-256-GCM], decrypt(), clearKey()
│                         # verifyPassword() — derives temp key, attempts decrypt, no backend call
├── api.ts                # ApiClient class: auto PoW, auth headers, error handling
│                         # getVaults(), createVault(), deleteVault()
│                         # getVault(vaultId), putVault(vaultId, ...), downloadVault(vaultId)
│                         # sendVaultEmail(vaultId), getWarningCodes()
├── pow-solver.ts         # SHA-256 PoW solver (Web Worker)
└── honeypot.ts           # hidden field generation, timing tracking
```

Also: `frontend/src/lib/password-gen.ts` — `generateSecurePassword(length?)` using `crypto.getRandomValues`; mixed character classes; used by password fields in vault item forms.

**Done when**: crypto round-trip test passes (encrypt → decrypt = original). `verifyPassword` returns true for correct password, false for wrong. API client correctly fetches challenge and attaches PoW headers. PoW solver finds valid solutions.

**Status**: Complete

---

### Step 8: Frontend UI (`frontend/src/`)

Components, hooks, contexts, routing. Depends on services (Step 7).

Build order within step:

1. **Contexts**: `AuthContext.tsx`, `EncryptionContext.tsx`
2. **Hooks**: `useAuth.ts`, `useEncryption.ts`, `useAutoLogout.ts`, `useVault.ts`, `useVaults.ts`, `useWarningCatalog.ts`, `useAdmin.ts`
3. **Vault shell**: `VaultShell.tsx`, `VaultSidebar.tsx`, `VaultBreadcrumbs.tsx`
4. **Auth pages**: `LoginPage.tsx`, `PasswordChangePage.tsx`, `PasskeySetupPage.tsx`
5. **Vault pages**: `VaultItemsPage.tsx`, `VaultItemDetailPage.tsx`, `VaultItemNewPage.tsx`, `SecretField.tsx`, `CountdownTimer.tsx`, `ConfirmDialog.tsx`
6. **Admin pages**: `AdminShell.tsx`, `AdminSidebar.tsx`, `AdminBreadcrumbs.tsx`, `CreateUserForm.tsx`, `UserList.tsx`, `OtpDisplay.tsx`, pages: `DashboardPage.tsx`, `AdminPage.tsx`, `UserDetailPage.tsx`, `LoginsPage.tsx`
7. **Wiring**: `router.tsx`, `App.tsx`

```
frontend/src/
├── context/
│   ├── AuthContext.tsx        # token, role, status, plan in memory
│   └── EncryptionContext.tsx  # key lifecycle (derive, encrypt, decrypt, clear)
├── hooks/
│   ├── useAuth.ts             # login, logout, changePassword
│   ├── useEncryption.ts       # wraps EncryptionContext
│   ├── useAutoLogout.ts       # countdown timer, auto-trigger logout
│   ├── useVault.ts            # fetchAndDecrypt, save, addItem, updateItem, deleteItem, download, sendEmail
│   │                          # exports computeWarnings() — recomputes warningCodes before every save
│   ├── useVaults.ts           # fetchVaults(), createVault(displayName), deleteVault(vaultId)
│   ├── useWarningCatalog.ts   # fetches GET /api/config/warning-codes once; getLabel(code) helper
│   └── useAdmin.ts            # createUser, listUsers, lockUser, unlockUser, expireUser, retireUser
├── lib/
│   └── password-gen.ts        # generateSecurePassword(length?) using crypto.getRandomValues
├── components/
│   ├── auth/                  # LoginPage, PasswordChangePage, PasskeySetupPage
│   ├── vault/
│   │   ├── VaultShell.tsx     # full-viewport shell: sidebar + outlet; loads vault list + warning catalog
│   │   ├── VaultSidebar.tsx   # one entry per vault; New Vault (if under plan limit); Logout footer
│   │   ├── VaultBreadcrumbs.tsx  # breadcrumb trail from URL
│   │   ├── VaultItemsPage.tsx    # table with Name/Category/Display field/⚠ badge; filter; + New Item
│   │   ├── VaultItemDetailPage.tsx  # view + edit + delete; SecretField for masked values; [Generate]
│   │   ├── VaultItemNewPage.tsx     # category selector → dynamic fields; [Generate] on password fields
│   │   ├── SecretField.tsx          # masked value; Eye/EyeOff toggle; Copy with Check feedback
│   │   ├── CountdownTimer.tsx   # session countdown display
│   │   └── ConfirmDialog.tsx    # generic confirmation dialog (used for delete + unsaved-changes)
│   ├── admin/
│   │   ├── AdminShell.tsx       # full-viewport shell: top bar + sidebar + Outlet
│   │   ├── AdminSidebar.tsx     # collapsible sections (Management, Logs); heroicons
│   │   ├── AdminBreadcrumbs.tsx # reads useLocation() pathname + state
│   │   ├── CreateUserForm.tsx   # email-as-username form; OtpDisplay on success
│   │   ├── UserList.tsx         # TanStack Table; lock icon badge; filter; Lock/Download/Refresh OTP/Delete actions
│   │   ├── OtpDisplay.tsx       # OTP + copy + Done
│   │   └── pages/
│   │       ├── DashboardPage.tsx    # stats cards + recharts area chart
│   │       ├── AdminPage.tsx        # admin account management (change password, passkey)
│   │       ├── UserDetailPage.tsx   # user detail; Lock/Unlock/Expire/Retire buttons; OTP refresh
│   │       └── LoginsPage.tsx       # login events table; sorting + filtering
│   └── layout/                  # EnvironmentBanner, Layout (auth pages wrapper)
├── router.tsx                   # /vault/:vaultId/* routes; /admin/* routes; auth guards
└── App.tsx                      # root wiring
```

**Done when**: full user flow works end-to-end against the deployed dev stack. Admin login → password change → create user → user login → password change → vault item list → add login item → warning badge appears for duplicate password → fix → badge clears on save → download backup. Lock/Unlock/Expire/Retire buttons work in admin User Detail. Auto-logout fires. Copy/download work.

**Status**: Complete

---

## Separation of Concerns

```
shared/          → WHAT (types, contracts, constants)
cdk/             → WHERE (infrastructure)
backend/utils    → HOW (low-level operations)
backend/middle   → WHEN (cross-cutting checks)
backend/services → WHY (business rules)
backend/handlers → ENTRY (Lambda ↔ service bridge)
frontend/services→ HOW (client-side operations)
frontend/UI      → INTERACTION (user-facing components)
```

No layer reaches into another's internals. Every boundary is a typed import from either `@passvault/shared` or the layer directly below.

---

## Verification

After Step 8, deploy to dev and run the full smoke test:

1. `cdk deploy PassVault-Dev --context env=dev`
2. `scripts/init-admin.ts` → creates admin
3. Admin login → password change → dashboard (no passkey in dev)
4. Create user (email address as username) → OTP shown
5. User login with OTP → password change → vault item list (Personal Vault)
6. Add login item → countdown timer ticking
7. Add second login with same password → both show ⚠ warning badge
8. Fix one password → badge clears on next save
9. Download encrypted backup (contains `warningCodes` in decrypted JSON)
10. Re-login → items decrypted correctly
11. Admin: Lock user → login returns `ACCOUNT_SUSPENDED`; Unlock → login works
12. Admin: Expire user → vault read-only; write blocked
13. Admin: Retire user → disappears from list; same email can create new account
14. Auto-logout fires at timeout
15. "DEV ENVIRONMENT" banner visible
