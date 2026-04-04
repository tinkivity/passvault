# PassVault - Testing Guide

## Running Tests

```bash
# All unit tests across all packages (from repo root)
npm test

# Single package
npm test --workspace=backend
npm test --workspace=frontend
npm test --workspace=cdk

# Type checking (all packages)
npm run typecheck
```

No AWS credentials or deployed stack required for unit tests or type checking.

---

## Package Testing Guides

| Package | Tests | Guide |
|---------|-------|-------|
| Backend | ~320 tests (services, handlers, middleware, utils) | [backend/TESTING.md](backend/TESTING.md) |
| Frontend | ~190 tests (components, hooks, services) | [frontend/TESTING.md](frontend/TESTING.md) |
| CDK | ~60 tests (stack synthesis, constructs) | Run with `npm test --workspace=cdk` |
| Shared | ~57 tests (password policy, configs, constants) | Run with `npm test --workspace=shared` |

---

## Smoke Tests

`scripts/smoke-test.ts` runs quick API health and auth checks against a deployed stack:

```bash
# Public + rejection tests (no credentials needed)
ENVIRONMENT=beta npx tsx scripts/smoke-test.ts

# Full suite including admin login
ENVIRONMENT=beta npx tsx scripts/smoke-test.ts --password <admin-password>
```

---

## System Integration Tests (SIT)

`scripts/sitest.sh` runs end-to-end scenario tests against a deployed stack. Tests exercise real API Gateway endpoints with PoW, authentication, vault CRUD, and audit logging — like a real browser session.

```bash
# Run against dev
scripts/sitest.sh --env dev

# Run against beta (PoW enabled)
scripts/sitest.sh --env beta

# Keep test data after run (for manual inspection)
scripts/sitest.sh --env dev --keep
```

**Cannot run on prod.** The script creates a temporary admin account, runs 7 scenario files (~40 tests), and cleans up all artifacts on exit.

### SIT Scenarios

| Scenario | Tests | What it covers |
|----------|-------|---------------|
| 01 Admin Auth | 5 | OTP login, password change, re-login, wrong password, health |
| 02 Admin User Mgmt | 10 | Create pro/free/admin users, list, stats, lock/unlock, self-expire guard |
| 03 User Onboarding | 4 | OTP login, set password, re-login, profile update |
| 04 Vault Lifecycle | 8 | Create, list, rename, delete, download, cannot-delete-last |
| 05 Vault Items | 6 | Encrypt + save items, fetch index/items, update, warning codes |
| 06 User Profile | 3 | Self-change password, re-login, logout |
| 07 Admin Audit | 12 | Config, event queries, pagination, filtering, sorting, vault ops |

See [backend/sit/SCENARIOS.md](backend/sit/SCENARIOS.md) for detailed scenario documentation.

---

## Penetration Tests

`scripts/pentest.sh` runs automated security tests organized by OWASP categories against a deployed stack.

```bash
# Run against dev
scripts/pentest.sh --env dev

# Run against beta
scripts/pentest.sh --env beta
```

**Cannot run on prod.** Creates 3 test users (admin, pro, free) with known passwords, runs ~64 security tests, and cleans up on exit.

### Pentest Categories

| Category | Tests | What it covers |
|----------|-------|---------------|
| 01 Auth Bypass | 10 | Missing/invalid/expired tokens, role checks, public endpoints |
| 02 Injection | 8 | SQL, NoSQL, XSS, path traversal, null bytes, CRLF |
| 03 Broken Auth | 6 | Brute-force lockout, locked/retired user login |
| 04 Authz Escalation | 8 | Cross-user vault access, role escalation, self-mod guards |
| 05 Rate Limiting | 3 | Burst limits, PoW latency |
| 06 Input Validation | 8 | Oversized fields, invalid JSON, type mismatches |
| 07 Data Exposure | 6 | No password hashes in responses, no stack traces |
| 08 CORS Headers | 3 | Preflight, PoW headers, Access-Control |
| 09 JWT Attacks | 4 | Tampered payload, expired, alg:none |
| 10 Vault Security | 4 | Cross-user access, unique salts, size limits |

See [backend/pentest/REPORT.md](backend/pentest/REPORT.md) for the findings template.

---

## Pre-Deployment Checklist

Before promoting from dev to beta to prod:

- [ ] `npm test` passes (all unit tests green)
- [ ] `npm run typecheck` passes (no type errors in any package)
- [ ] `npm run build` succeeds (shared, backend, frontend)
- [ ] `scripts/sitest.sh --env <env>` passes (all SIT scenarios green)
- [ ] `scripts/pentest.sh --env <env>` passes (no security findings)
- [ ] Admin login and first-password-change flow works end-to-end
- [ ] User creation, login, vault item CRUD works
- [ ] Multi-vault: free users limited to 1, pro users to 10
- [ ] (Prod only) Passkey registration and login work correctly
- [ ] OTP expiry enforced; Refresh OTP issues working replacement
- [ ] User lifecycle: lock/unlock/expire/retire work correctly
- [ ] Warning codes: duplicate password and breach detection work
- [ ] Audit log: events recorded for all categories when enabled
- [ ] (Prod) Email verification flow works
- [ ] (Beta/prod) SES `SENDER_EMAIL` is set; emails deliver
- [ ] i18n: language selector works, translations load correctly
