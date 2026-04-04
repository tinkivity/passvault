# PassVault System Integration Test Scenarios

## Overview

System integration tests (SIT) run against a **live deployed stack** (dev or beta) and exercise the full API surface through HTTP calls. They verify end-to-end behavior including authentication, user management, vault encryption/decryption, and audit logging.

## How to run

```bash
scripts/sitest.sh --env dev
scripts/sitest.sh --env beta --profile my-aws-profile
scripts/sitest.sh --env dev --keep   # keep SIT admin after tests
```

The shell script:
1. Creates a temporary SIT admin in DynamoDB
2. Runs all scenarios sequentially via vitest
3. Cleans up the SIT admin and all created users (unless `--keep`)

## Rate limiting

All requests go through `sit/lib/client.ts` which enforces a minimum interval between requests derived from the environment's `throttle.rateLimit` config (default: 100ms + 50ms buffer per request). On HTTP 429, the client retries once after a 2s backoff.

## Architecture

All scenarios run in a **single test file** (`scenarios/sit.test.ts`). Each scenario is a plain function that receives a shared `SitContext` object by reference — no file I/O or IPC. The call order in `sit.test.ts` defines the execution order.

To add a new scenario:
1. Create `scenarios/XX-name.ts` exporting a function `nameScenarios(ctx: SitContext)`.
2. Import it in `sit.test.ts` and call it after the scenario it depends on.

## Data flow between scenarios

Scenarios run **sequentially** and share state via the in-memory `SitContext` object:

```
01 Admin Auth  -->  adminToken, adminPassword
02 User Mgmt   -->  proUserId, proUserOtp, freeUserId, freeUserOtp, adminUserId
03 Onboarding  -->  proUserToken, proUserPassword
04 Vault Life  -->  vaultId, vaultSalt
05 Vault Items -->  (reads/writes encrypted vault data)
06 Profile     -->  (updates proUserPassword)
07 Audit       -->  (reads login events)
```

## Scenarios by role and use case

### Administrator

#### 01 — Authentication (`01-admin-auth.ts`)

| # | Name | Endpoint | Method | Expected |
|---|------|----------|--------|----------|
| 1 | Login with OTP | `/api/admin/login` | POST | 200, requirePasswordChange=true |
| 2 | Change password | `/api/admin/change-password` | POST | 200, success |
| 3 | Re-login with new password | `/api/admin/login` | POST | 200, token |
| 4 | Wrong password rejected | `/api/admin/login` | POST | 401 |
| 5 | Health check | `/api/health` | GET | 200, status=ok |

#### 02 — User Management (`02-admin-user-mgmt.ts`)

| # | Name | Endpoint | Method | Expected |
|---|------|----------|--------|----------|
| 1 | Create pro user | `/api/admin/users` | POST | 201, OTP + userId |
| 2 | Create free user | `/api/admin/users` | POST | 201, OTP + userId |
| 3 | List users | `/api/admin/users` | GET | 200, contains both |
| 4 | Get admin stats | `/api/admin/stats` | GET | 200, totalUsers >= 2 |
| 5 | Lock free user | `/api/admin/users/{id}/lock` | POST | 200 |
| 6 | Locked user login | `/api/auth/login` | POST | 401 or 403 |
| 7 | Unlock free user | `/api/admin/users/{id}/unlock` | POST | 200 |
| 8 | Create admin user | `/api/admin/users` | POST | 201, plan=administrator |
| 9 | Self-expire blocked | `/api/admin/users/{id}/expire` | POST | 403 |

#### 07 — Audit (`07-admin-audit.ts`)

| # | Name | Endpoint | Method | Expected |
|---|------|----------|--------|----------|
| 1 | Get admin stats | `/api/admin/stats` | GET | 200, numeric fields |
| 2 | Get login events | `/api/admin/login-events` | GET | 200, events array |
| 3 | Events include admin logins | `/api/admin/login-events` | GET | admin email in events |
| 4 | Events include user logins | `/api/admin/login-events` | GET | pro user email in events |

### Regular User

#### 03 — Onboarding (`03-user-onboarding.ts`)

| # | Name | Endpoint | Method | Expected |
|---|------|----------|--------|----------|
| 1 | First login with OTP | `/api/auth/login` | POST | 200, requirePasswordChange |
| 2 | Set real password | `/api/auth/change-password` | POST | 200 |
| 3 | Login with new password | `/api/auth/login` | POST | 200, active |
| 4 | Update profile | `/api/auth/profile` | PATCH | 200 |

#### 04 — Vault Lifecycle (`04-vault-lifecycle.ts`)

| # | Name | Endpoint | Method | Expected |
|---|------|----------|--------|----------|
| 1 | Create vault | `/api/vaults` | POST | 201, vaultId + salt |
| 2 | List vaults | `/api/vaults` | GET | 200, contains vault |
| 3 | Get empty vault | `/api/vaults/{id}` | GET | 200, empty content |
| 4 | Rename vault | `/api/vaults/{id}` | PATCH | 200 |
| 5 | Create second vault | `/api/vaults` | POST | 201 |
| 6 | Delete second vault | `/api/vaults/{id}` | DELETE | 200 |
| 7 | Cannot delete last | `/api/vaults/{id}` | DELETE | 400 |
| 8 | Download vault | `/api/vaults/{id}/download` | GET | 200, encryption params |

#### 05 — Vault Items (`05-vault-items.ts`)

| # | Name | Endpoint | Method | Expected |
|---|------|----------|--------|----------|
| 1 | Save 3 items (encrypted) | `/api/vaults/{id}` | PUT | 200 |
| 2 | Get + decrypt (3 items) | `/api/vaults/{id}` | GET | 200, 3 items |
| 3 | Update (modify 1, add 1) | `/api/vaults/{id}` | PUT | 200 |
| 4 | Verify 4 items | `/api/vaults/{id}` | GET | 200, 4 items |
| 5 | Warning codes catalog | `/api/config/warning-codes` | GET | 200, 2 codes |

#### 06 — Profile & Security (`06-user-profile.ts`)

| # | Name | Endpoint | Method | Expected |
|---|------|----------|--------|----------|
| 1 | Self-change password | `/api/auth/change-password/self` | POST | 200 |
| 2 | Login with new password | `/api/auth/login` | POST | 200 |
| 3 | Logout | `/api/auth/logout` | POST | 200 |
