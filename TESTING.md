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

173 tests across 14 files in the `backend` package (all passing). `frontend`, `cdk`, and `shared` do not have unit tests — they are covered by TypeScript type checking and manual UI testing.

| File | Tests | What is covered |
|---|---|---|
| `src/utils/jwt.test.ts` | 5 | `signToken`/`verifyToken` round-trips, tamper detection, wrong secret, missing env var |
| `src/utils/crypto.test.ts` | 6 | `hashPassword`/`verifyPassword`, `generateOtp`, `generateSalt` |
| `src/utils/password.test.ts` | 8 | `validatePassword` — all policy rules, username rejection, common patterns |
| `src/utils/dynamodb.test.ts` | 5 | `getUserByUsername`, `getUserById`, `createUser`, `updateUser`, `listAllUsers` |
| `src/utils/s3.test.ts` | 6 | `getVaultFile`, `putVaultFile`, `getVaultFileSize` |
| `src/utils/response.test.ts` | 4 | `success()` / `error()` shape, CORS headers, details array |
| `src/middleware/auth.test.ts` | 8 | Valid/invalid JWT extraction, missing header, wrong role, expired token |
| `src/middleware/pow.test.ts` | 8 | Valid/invalid PoW solutions, difficulty check, TTL expiry, disabled mode |
| `src/middleware/honeypot.test.ts` | 5 | Hidden field detection (email/phone/website), disabled mode |
| `src/services/challenge.test.ts` | 6 | Challenge generation, PoW solution validation |
| `src/services/auth.test.ts` | 26 | Login (OTP, normal, passkeyToken), changePassword, account lockout (H2), input validation (M3) |
| `src/services/admin.test.ts` | 24 | adminLogin, adminChangePassword, createUserInvitation, listUsers, lockout, input validation |
| `src/services/vault.test.ts` | 12 | getVault, putVault, downloadVault — auth checks, S3 round-trips |
| `src/handlers/auth.test.ts` | 15 | Handler routing, PoW/honeypot middleware, invalid JSON body (C2 fix) |
| `src/handlers/admin.test.ts` | 15 | Handler routing, auth middleware, invalid JSON body (C2 fix) |
| `src/handlers/vault.test.ts` | 10 | Handler routing, auth middleware, invalid JSON body (C2 fix) |

All tests mock AWS SDK calls (`@aws-sdk/client-dynamodb`, `@aws-sdk/client-s3`) and SSM (`getJwtSecret`) — no real AWS credentials are required to run them.

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

- Delete a `pending_first_login` user → user disappears from list; S3 vault file is removed (`user-{userId}.enc` no longer exists)
- Attempt to delete a user with status `active` or `pending_passkey_setup` → 400 error
- After deletion, attempting to log in with the deleted user's credentials → 401

### Registration Email (Beta/Prod)

- Create user with `email` field provided and SES configured → email arrives with OTP and expiry notice
- Create user without `email` field → no email; OTP shown in admin UI only
- Create user with `email` in dev environment → `email` field ignored; no SES send

### Vault Email (`POST /api/vault/email`)

- User with email set clicks "Email Encrypted Backup" → email arrives containing JSON vault backup
- User without email set clicks button → 400 `NO_EMAIL_ADDRESS`; UI shows appropriate error
- Call from dev or with `SENDER_EMAIL` unset → 503 or `EMAIL_CHANGE_NOT_AVAILABLE`

### Email Change Flow (`POST /api/auth/email/change` + `POST /api/auth/email/verify`)

- Happy path (beta/prod): Submit new email + correct password → SES sends 6-digit code → submit code → user record updated; subsequent vault-email goes to new address
- Wrong password on change request → 401
- Wrong verification code → 400 `EMAIL_VERIFICATION_INVALID`
- Expired verification code → 400 `EMAIL_VERIFICATION_INVALID`
- Call either endpoint in dev → 400 `EMAIL_CHANGE_NOT_AVAILABLE`

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
- [ ] User creation, login, vault save/load, and backup download work
- [ ] (Prod only) Passkey registration and login work correctly end-to-end
- [ ] OTP expiry is enforced; expired OTPs return `OTP_EXPIRED`; Refresh OTP issues a working replacement
- [ ] Delete pending user removes DynamoDB record and S3 vault file; deleted user cannot log in
- [ ] (Beta/prod) Registration email delivered when email provided; admin UI always shows OTP
- [ ] (Beta/prod) Vault email sends correct JSON backup to user's registered address
- [ ] (Beta/prod) Email change flow: password confirmation → 6-digit code → address updated
- [ ] (Beta/prod) SES `SENDER_EMAIL` env var is set on auth, admin, and vault Lambdas; SES domain identity is verified
