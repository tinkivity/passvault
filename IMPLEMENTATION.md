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
| TOTP | `otplib` + `qrcode` |
| AWS SDK | `@aws-sdk/client-*` v3 |

---

## Build Order (8 Steps)

```
Step 1: shared/          ── types, configs, constants (the contract layer)
Step 2: cdk/             ── infrastructure as code
Step 3: backend/utils    ── crypto, JWT, S3, DynamoDB helpers
Step 4: backend/middle   ── auth, PoW, honeypot middleware
Step 5: backend/services ── auth, admin, totp, vault, challenge business logic
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
│   ├── user.ts           # User model, UserRole, UserStatus
│   ├── auth.ts           # LoginRequest/Response, ChangePasswordRequest/Response
│   ├── admin.ts          # CreateUserRequest/Response, ListUsersResponse
│   ├── vault.ts          # VaultGetResponse, VaultPutRequest, VaultDownloadResponse
│   ├── challenge.ts      # ChallengeResponse, PowHeaders
│   └── api.ts            # ApiResponse<T>, ApiError
├── config/
│   ├── environments.ts   # devConfig, betaConfig, prodConfig, getEnvironmentConfig()
│   ├── password-policy.ts# PASSWORD_MIN_LENGTH, validatePassword()
│   └── crypto-params.ts  # ARGON2_PARAMS, AES_PARAMS, SALT_LENGTH, IV_LENGTH
├── constants.ts          # API paths, header names, error messages
└── index.ts              # barrel export
```

Also: root `package.json` (workspaces), `tsconfig.base.json`, ESLint/Prettier config, all package scaffolding (empty dirs + package.json + tsconfig for backend/frontend/cdk).

**Done when**: `npm install` works, `tsc --noEmit` passes on shared, all other packages can `import { EnvironmentConfig } from '@passvault/shared'`.

**Status**: Complete

---

### Step 2: CDK Package (`cdk/`)

Infrastructure as code. Depends only on `shared/` for `EnvironmentConfig`.

```
cdk/
├── bin/passvault.ts              # entry point, reads --context env
└── lib/
    ├── passvault-stack.ts        # composes constructs, conditional WAF
    └── constructs/
        ├── storage.ts            # DynamoDB + 3 S3 buckets
        ├── backend.ts            # 5 Lambdas + API Gateway + IAM
        ├── security.ts           # WAF (only if wafEnabled)
        ├── frontend.ts           # CloudFront + S3 static hosting
        └── monitoring.ts         # CloudWatch dashboards + alarms (prod only)
```

Build order within step: storage → backend → security → frontend → monitoring → stack.

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
│   ├── s3.ts             # getVaultFile(), putVaultFile(), getAdminPassword()
│   ├── dynamodb.ts       # DynamoDB client, getUserByUsername(), getUserById(), createUser(), updateUser()
│   └── response.ts       # success(), error(), cors() Lambda response builders
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
├── auth.ts               # login(), changePassword() — env-conditional TOTP flow
├── admin.ts              # adminLogin(), adminChangePassword(), createUser(), listUsers()
├── totp.ts               # generateSecret(), generateQrUri(), verifyCode()
├── vault.ts              # getVault(), putVault(), downloadVault()
└── challenge.ts          # generateChallenge(), validateSolution()
```

Each service is a module of pure-ish functions that orchestrate utils. No Lambda event parsing here — that's the handler's job.

**Done when**: services are unit-tested with mocked DynamoDB/S3. Auth flow (OTP login → password change → TOTP setup → active) works in tests for both TOTP-enabled and TOTP-disabled configs.

**Status**: Complete

---

### Step 6: Backend Handlers (`backend/src/handlers/`)

Lambda entry points. Thin layer: parse event → call middleware → call service → return response. Depends on middleware (Step 4) + services (Step 5).

```
backend/src/handlers/
├── auth.ts               # POST /auth/login, /auth/change-password, /auth/totp/*
├── admin.ts              # POST /admin/login, /admin/change-password, /admin/totp/*, /admin/users; GET /admin/users
├── vault.ts              # GET /vault, PUT /vault, GET /vault/download
├── challenge.ts          # GET /challenge
└── health.ts             # GET /health
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
├── api.ts                # ApiClient class: auto PoW, auth headers, error handling
├── pow-solver.ts         # SHA-256 PoW solver (Web Worker)
└── honeypot.ts           # hidden field generation, timing tracking
```

**Done when**: crypto round-trip test passes (encrypt → decrypt = original). API client correctly fetches challenge and attaches PoW headers. PoW solver finds valid solutions.

**Status**: Pending

---

### Step 8: Frontend UI (`frontend/src/`)

Components, hooks, contexts, routing. Depends on services (Step 7).

Build order within step:

1. **Contexts**: `AuthContext.tsx`, `EncryptionContext.tsx`
2. **Hooks**: `useAuth.ts`, `useEncryption.ts`, `useAutoLogout.ts`, `useVault.ts`, `useAdmin.ts`
3. **Layout**: `EnvironmentBanner.tsx`, `Layout.tsx`
4. **Auth pages**: `LoginPage.tsx`, `AdminLoginPage.tsx`, `PasswordChangePage.tsx`, `TotpSetupPage.tsx`
5. **Vault pages**: `VaultPage.tsx` (view/edit orchestration), `VaultViewer.tsx`, `VaultEditor.tsx`, `CountdownTimer.tsx`, `ConfirmDialog.tsx`
6. **Admin pages**: `AdminDashboard.tsx`, `CreateUserForm.tsx`, `UserList.tsx`, `OtpDisplay.tsx`
7. **Wiring**: `router.tsx`, `App.tsx`

```
frontend/src/
├── context/
│   ├── AuthContext.tsx        # token, role, status in memory
│   └── EncryptionContext.tsx  # key lifecycle (derive, encrypt, decrypt, clear)
├── hooks/
│   ├── useAuth.ts             # login, logout, changePassword
│   ├── useEncryption.ts       # wraps EncryptionContext
│   ├── useAutoLogout.ts       # countdown timer, auto-trigger logout
│   ├── useVault.ts            # fetch+decrypt, encrypt+save, download
│   └── useAdmin.ts            # createUser, listUsers
├── components/
│   ├── auth/                  # LoginPage, AdminLoginPage, PasswordChangePage, TotpSetupPage
│   ├── vault/                 # VaultPage, VaultViewer, VaultEditor, CountdownTimer, ConfirmDialog
│   ├── admin/                 # AdminDashboard, CreateUserForm, UserList, OtpDisplay
│   └── layout/                # EnvironmentBanner, Layout
├── router.tsx                 # routes + guards
└── App.tsx                    # root wiring
```

**Done when**: full user flow works end-to-end against the deployed dev stack. Admin login → password change → create user → user login → password change → view vault → edit → save → re-login → content preserved. Environment banner shows. Auto-logout fires. Copy/download work.

**Status**: Pending

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
3. Admin login → password change → dashboard (no TOTP in dev)
4. Create user → OTP shown
5. User login with OTP → password change → vault
6. View empty vault → countdown timer ticking
7. Edit mode → type content → save → immediate logout
8. Re-login → content decrypted correctly
9. Copy to clipboard, download backup
10. Cancel with unsaved changes → confirmation dialog → logout
11. Auto-logout fires at timeout
12. "DEV ENVIRONMENT" banner visible
