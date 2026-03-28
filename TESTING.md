# PassVault - Testing Guide

## Overview

Testing is split into three layers:

| Layer | Tool | When to run |
|---|---|---|
| **Unit tests** | Vitest | Every code change |
| **Type checking** | TypeScript | Every code change |
| **Manual UI testing** | Vite dev server + deployed dev stack | Before promoting to beta/prod |

---

## 1. Unit Tests

### Running tests

```bash
# Run all tests across all packages (from repo root)
npm test

# Run tests for a single package
npm test --workspace=backend
npm test --workspace=frontend
npm test --workspace=cdk

# Watch mode (re-runs on file save)
npm run test:watch --workspace=backend
```

### Current coverage

501 tests across 35 files (all passing): 261 backend, 183 frontend, 57 shared.

#### Backend (`backend/src/`)

| File | Tests | What is covered |
|---|---|---|
| `src/utils/jwt.test.ts` | 6 | `signToken`/`verifyToken` round-trips, tamper detection, wrong secret, missing env var |
| `src/utils/crypto.test.ts` | 13 | `hashPassword`/`verifyPassword`, `generateOtp`, `generateSalt` |
| `src/utils/password.test.ts` | 10 | `validatePassword` — all policy rules, username rejection, common patterns |
| `src/middleware/auth.test.ts` | 13 | Valid/invalid JWT extraction, missing header, wrong role, expired token |
| `src/middleware/pow.test.ts` | 7 | Valid/invalid PoW solutions, difficulty check, TTL expiry, disabled mode |
| `src/middleware/honeypot.test.ts` | 8 | Hidden field detection (email/phone/website), disabled mode |
| `src/services/challenge.test.ts` | 3 | Challenge generation, PoW solution validation |
| `src/services/auth.test.ts` | 31 | Login (OTP, normal, passkeyToken), changePassword, lockout, OTP expiry, status checks (locked/retired/expired) |
| `src/services/admin.test.ts` | 69 | adminLogin, adminChangePassword, createUserInvitation, listUsers, lockout, lockUser, unlockUser, expireUser, retireUser, verifyEmailToken |
| `src/services/vault.test.ts` | 24 | getVault, putVault, downloadVault, sendVaultEmail, createVault (plan limits), deleteVault |
| `src/services/passkey.test.ts` | 11 | Challenge JWTs, passkey tokens, WebAuthn assertion/attestation verification |
| `src/handlers/auth.test.ts` | 25 | Handler routing, PoW/honeypot middleware, passkey endpoints, email verification, logout |
| `src/handlers/admin.test.ts` | 28 | Handler routing, auth middleware, all admin endpoints including lock/unlock/expire/retire |
| `src/handlers/challenge.test.ts` | 3 | Challenge handler routing |
| `src/handlers/vault.test.ts` | 13 | Handler routing, auth middleware, vault CRUD, status checks (expired/locked) |
| `src/handlers/health.test.ts` | 4 | Health check handler |

All tests mock AWS SDK calls (`@aws-sdk/client-dynamodb`, `@aws-sdk/client-s3`) and SSM (`getJwtSecret`) — no real AWS credentials are required to run them.

#### Frontend (`frontend/src/`)

| File | Tests | What is covered |
|---|---|---|
| `src/services/honeypot.test.ts` | 6 | Hidden field generation and timing |
| `src/hooks/useAutoLogout.test.ts` | 7 | Timer countdown, auto-logout, activity reset |
| `src/hooks/useVault.computeWarnings.test.ts` | 8 | `computeWarnings` — duplicate_password, too_simple_password detection and code reset |
| `src/context/AuthContext.test.tsx` | 4 | Auth state, plan field, logout |
| `src/components/vault/CountdownTimer.test.tsx` | 8 | Timer display, expiry callback |
| `src/components/vault/ConfirmDialog.test.tsx` | 5 | Confirm/cancel dialog |
| `src/components/admin/OtpDisplay.test.tsx` | 5 | OTP display, copy, Done |
| `src/components/admin/AdminBreadcrumbs.test.tsx` | 10 | Breadcrumb rendering for all routes |
| `src/components/admin/AdminSidebar.test.tsx` | 15 | Sidebar nav, collapsible sections |
| `src/components/admin/CreateUserForm.test.tsx` | 7 | Email validation, OTP display, error handling |
| `src/components/admin/UserList.test.tsx` | 28 | Table, sorting, filters, actions (download/refresh OTP/delete), status badges |
| `src/components/admin/pages/DashboardPage.test.tsx` | 9 | Stats cards, chart rendering |
| `src/components/admin/pages/AdminPage.test.tsx` | 10 | Admin account management |
| `src/components/admin/pages/UserDetailPage.test.tsx` | 17 | User detail, lock/unlock/expire/retire buttons, OTP refresh, delete |
| `src/components/admin/pages/LoginsPage.test.tsx` | 34 | Login events table, sorting, filtering |
| `src/components/layout/Layout.test.tsx` | 11 | Layout rendering, environment banner |

#### Shared (`shared/src/`)

57 tests covering `validatePassword`, environment configs, constants, and API type contracts.

**Pattern for mocking AWS in new tests:**

```typescript
vi.mock('../config.js', () => ({
  config: { environment: 'dev', features: { ... } },
  getJwtSecret: vi.fn().mockResolvedValue('test-secret'),
  DYNAMODB_TABLE: 'test-table',
  FILES_BUCKET: 'test-bucket',
}));
```

### Adding new tests

Place test files alongside the source file they test, using the `.test.ts` / `.test.tsx` suffix. Vitest discovers them automatically — no config file is needed.

```
backend/src/utils/
  crypto.ts
  crypto.test.ts   ← add here
```

---

## 2. Type Checking

TypeScript type checking across all packages:

```bash
# Check all packages (from repo root)
npm run typecheck

# Check a single package
npm run typecheck --workspace=backend
npm run typecheck --workspace=frontend
npm run typecheck --workspace=shared
npm run typecheck --workspace=cdk
```

Type checking does not require a deployed stack or AWS credentials.

---

## 3. Manual UI Testing Against the Dev Stack

The `scripts/dev-ui.sh` script automates the full local testing workflow:

1. Exports `AWS_PROFILE` if `--profile` is given — picked up by both the AWS CLI and the AWS SDK (used by `init-admin.ts`)
2. Reads `ApiUrl` and `UsersTableName` from the CloudFormation stack outputs
3. Checks DynamoDB for the admin user:
   - **Not found** → runs `scripts/init-admin.ts` automatically and prints the one-time password; waits for you to press Enter before continuing
   - **Found** → skips initialisation
4. Writes `frontend/.env.local` with the correct `VITE_*` variables
5. Starts the Vite dev server at `http://localhost:5173`
6. On exit (Ctrl-C or normal termination) — kills the server and **deletes `frontend/.env.local`**

`frontend/.env.local` is covered by `.gitignore` and is never committed.

### Prerequisites

Run these steps **in order** before deploying or running the script:

```bash
# 1. Install / link all workspace packages (repo root)
npm install

# 2. Build backend Lambda bundles — CDK packages these at deploy time
npm run build --workspace=backend

# 3. Deploy the dev stack (from the cdk/ directory)
cd cdk && cdk deploy PassVault-Dev --context env=dev

# 4. Create the JWT secret in SSM (one-time; required for login)
aws ssm put-parameter \
  --name /passvault/dev/jwt-secret \
  --value "$(openssl rand -hex 32)" \
  --type SecureString \
  --region eu-central-1
```

Steps 1–2 must happen before step 3: CDK packages `backend/dist/` into the Lambda ZIP at deploy time. If the bundles don't exist yet, the deployed Lambda code will be invalid and every endpoint will return "Internal server error" with no CloudWatch logs.

The script handles admin initialisation automatically — you do not need to run `init-admin.ts` separately.

### Usage

```bash
# Default AWS credential chain
./scripts/dev-ui.sh

# Named AWS profile (required when your default credentials lack access)
./scripts/dev-ui.sh --profile my-profile

# Custom region or stack name
./scripts/dev-ui.sh --profile my-profile --region eu-central-1 --stack PassVault-Dev
```

`--profile` sets the `AWS_PROFILE` environment variable, which is the standard mechanism used by both the AWS CLI and the AWS SDK. It is equivalent to running:

```bash
AWS_PROFILE=my-profile ./scripts/dev-ui.sh
```

Open `http://localhost:5173` in your browser. Press **Ctrl-C** to stop — the script cleans up automatically.

### Running init-admin.ts manually

If you need to run `init-admin.ts` outside of the script (e.g. to reinitialise after deleting the admin from DynamoDB):

```bash
# Default credentials
ENVIRONMENT=dev npx tsx scripts/init-admin.ts

# Named AWS profile
AWS_PROFILE=my-profile ENVIRONMENT=dev npx tsx scripts/init-admin.ts
```

### What to test in dev

The dev stack has `passkeyRequired: false` and `powEnabled: false`, so the login flow is simpler than prod:

**Admin flow:**
1. The script prints the one-time password on first run — copy it before pressing Enter
2. Navigate to `/login` and log in with the admin username and OTP
4. Change password when prompted
5. Passkey setup is **skipped** — you go directly to the dashboard
6. Create a test user account from the admin dashboard

**User flow:**
1. Log in with the test user's OTP
2. Change password when prompted
3. Passkey setup is **skipped** — you go directly to the vault
4. Type some text and save
5. Log out, log in again — confirm the text is still there and decrypts correctly
6. Download the encrypted backup and verify it downloads

**Session timeouts in dev:**
- View mode: 5 minutes (300 s)
- Edit mode: 10 minutes (600 s)
- Admin session: 24 hours

---

## 3a. New Feature Test Scenarios

These scenarios cover features introduced after the initial implementation. Run them manually against the dev or beta stack as appropriate. Email-dependent scenarios require a beta/prod stack with SES configured.

### OTP Expiry

| Scenario | Steps | Expected |
|---|---|---|
| OTP used before expiry | Create user; log in within expiry window | Login succeeds |
| OTP used after expiry | Create user; wait until `otpExpiresAt` passes (or manually set it in DynamoDB); attempt login | 401 with `OTP_EXPIRED` |
| Admin refresh OTP | After OTP expires, admin calls Refresh OTP; user logs in with new OTP | Login succeeds |
| Refresh OTP on active user | Admin attempts refresh on a user whose status is not `pending_first_login` | 400 error |

### Admin: Refresh OTP (`POST /api/admin/users/refresh-otp`)

- Refresh on a `pending_first_login` user → new OTP returned; old OTP no longer works
- On beta with email configured: confirm SES delivers new OTP email to user's inbox
- On beta without user email: refresh succeeds; no email sent; OTP returned to admin only

### Admin: Delete Pending User (`DELETE /api/admin/users?userId=`)

- Delete a `pending_first_login` or `pending_email_verification` user → user disappears from list; S3 vault files are removed
- Attempt to delete a user with status `active` or `pending_passkey_setup` → 400 error
- After deletion, attempting to log in with the deleted user's credentials → 401

### Registration Email (Prod)

- Create user with SES configured (prod) → single email sent with OTP + email verification link
- User clicks verification link → `GET /api/auth/verify-email?token=xxx` → status transitions `pending_email_verification` → `pending_first_login`; OTP login now works
- User attempts OTP login before clicking link → 403
- Expired verification link (> 7 days) → 400 `EMAIL_VERIFICATION_INVALID`
- Create user in dev/beta → status starts at `pending_first_login` directly; no verification required

### Admin: User Lifecycle (Lock / Unlock / Expire / Retire)

- **Lock:** Lock an active user → login returns 403 `ACCOUNT_SUSPENDED`; admin unlocks → login works again
- **Expire:** Mark user expired → login succeeds; vault GET works; vault PUT returns 403 `ACCOUNT_EXPIRED`
- **Retire:** Retire user → user disappears from admin list; original email address can be used to create a new account; retired user login returns 401 `INVALID_CREDENTIALS`
- Admin cannot lock/unlock/expire/retire another admin account → 403

### Multi-Vault (Plan Limits)

- Free user (default): first vault created on account creation; attempt to create second vault → 403 `VAULT_LIMIT_REACHED`
- Pro user: can create up to 10 vaults; attempt to create 11th → 403
- User cannot delete their last vault → 400 `CANNOT_DELETE_LAST_VAULT`

### Vault Email (`POST /api/vault/:vaultId/email`)

- User clicks "Email Encrypted Backup" → email arrives containing encrypted vault attachment
- Call with `SENDER_EMAIL` unset → 503

---

## 4. API Smoke Tests

`scripts/smoke-test.ts` runs automated API tests against any deployed stack. It reads the API URL from CloudFormation outputs, solves PoW challenges automatically, and exits 0 on success / 1 on failure.

```bash
# Public + rejection tests only (no credentials needed)
ENVIRONMENT=beta npx tsx scripts/smoke-test.ts

# Full suite including admin login and user listing
ENVIRONMENT=beta npx tsx scripts/smoke-test.ts --password <admin-password>

# Override the API base URL (skips CloudFormation lookup)
ENVIRONMENT=beta npx tsx scripts/smoke-test.ts \
  --base-url https://beta.pv.example.com \
  --password <admin-password>

# Named AWS profile + custom region
AWS_PROFILE=my-profile ENVIRONMENT=prod npx tsx scripts/smoke-test.ts \
  --region eu-central-1 \
  --password <admin-password>
```

**What is tested:**

| Test | Auth required |
|---|---|
| `GET /api/health` → `{status:"ok"}` | No |
| `GET /api/challenge` → nonce/difficulty/timestamp/ttl | No |
| `POST /api/admin/login` with wrong password → 401 | No |
| `POST /api/auth/login` with wrong password → 401 | No |
| `GET /api/vault` without token → 401 | No |
| `GET /api/admin/users` without token → 401 | No |
| `POST /api/admin/login` with real password → token | `--password` |
| `GET /api/admin/users` → list | `--password` |
| `GET /api/admin/users` with bad token → 401 | `--password` |

PoW is solved automatically using the same algorithm as the frontend worker (SHA-256 with leading zero bits). Dev stacks skip PoW entirely; beta/prod solve to the correct difficulty per endpoint.

---

## 5. Pre-Deployment Checklist

Before promoting from dev → beta → prod, verify:

- [ ] `npm test` passes (all unit tests green)
- [ ] `npm run typecheck` passes (no type errors in any package)
- [ ] `npm run build` succeeds (shared → backend → frontend)
- [ ] `ENVIRONMENT=<env> npx tsx scripts/smoke-test.ts --password <pw>` passes (all 9 tests)
- [ ] Admin login and first-password-change flow works end-to-end
- [ ] User creation (email as username), login, vault item creation/edit/delete work
- [ ] Multi-vault: free users blocked from creating second vault; pro users can create up to 10
- [ ] (Prod only) Passkey registration and login work correctly end-to-end
- [ ] OTP expiry enforced; expired OTPs return `OTP_EXPIRED`; Refresh OTP issues a working replacement
- [ ] User lifecycle: lock → login blocked → unlock → login works; expire → read-only vault; retire → gone from list → email reusable
- [ ] Delete pending user removes DynamoDB and S3 vault records; deleted user cannot log in
- [ ] Warning codes: two logins with same password show ⚠ badge; fix one → warning clears on next save
- [ ] (Prod) Email verification: new user receives link → click → OTP login works; unverified → OTP rejected
- [ ] (Prod) Vault email sends correct encrypted attachment to user's email address
- [ ] (Beta/prod) SES `SENDER_EMAIL` env var is set on auth, admin, and vault Lambdas; SES domain identity is verified
