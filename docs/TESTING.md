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

# Clean up a previous --keep run
scripts/sitest.sh --cleanup --env dev
```

**Cannot run on prod.** The script creates a temporary admin account, runs 7 scenario files (~40 tests), and cleans up all artifacts (users, vaults, S3 files, login events, audit events) on exit. Use `--keep` to preserve test data for inspection, then `--cleanup` to remove it later.

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
| 08 Email Templates | 23 | List/download/upload templates, language variants, i18n, version, export all/modified, import zip, modified flag detection, unsubscribe, notification prefs |

See [backend/sit/SCENARIOS.md](backend/sit/SCENARIOS.md) for detailed scenario documentation.

---

## Penetration Tests

`scripts/pentest.sh` runs automated security tests organized by OWASP categories against a deployed stack.

```bash
# Run against dev
scripts/pentest.sh --env dev

# Run against beta
scripts/pentest.sh --env beta

# Keep test data after run (for manual inspection)
scripts/pentest.sh --env dev --keep

# Clean up a previous --keep run
scripts/pentest.sh --cleanup --env dev
```

**Cannot run on prod.** Creates 3 test users (admin, pro, free) with known passwords, runs ~64 security tests, and cleans up all artifacts (users, vaults, S3 files, login events, audit events) on exit. Use `--keep` to preserve test data for inspection, then `--cleanup` to remove it later.

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
| 11 Email Templates | 28 | Auth/authz for templates, export, import, version endpoints; input validation (empty body, invalid base64, non-zip data); unsubscribe token attacks |

See [backend/pentest/REPORT.md](backend/pentest/REPORT.md) for the findings template.

---

## E2E Browser Tests (Playwright)

Playwright tests verify user-facing flows in a headless Chromium browser against a deployed dev stack.

```bash
# Run all E2E tests
cd frontend && E2E_BASE_URL=https://<api-url> npx playwright test

# Run with UI mode (interactive debugging)
cd frontend && E2E_BASE_URL=https://<api-url> npx playwright test --ui

# View the last HTML report
cd frontend && npx playwright show-report e2e-report
```

**Environment variables:**
- `E2E_BASE_URL` — API Gateway URL (set automatically by `qualify.sh`)
- `E2E_ADMIN_EMAIL` — Admin email (from SIT setup)
- `E2E_ADMIN_PASSWORD` — Admin password (from SIT setup)

### E2E Specs

| Spec | Tests | What it covers |
|------|-------|---------------|
| 01-auth | 6 | Login, invalid creds, logout, route guards |
| 02-admin-users | 6 | Dashboard, create/edit/lock/delete users |
| 03-admin-templates | 5 | Template cards, preview, download, upload, edited badge |
| 04-vault-unlock | 3 | Password entry, wrong password, successful unlock |
| 05-vault-items | 3 | Create/search/delete items |
| 06-notifications | 3 | Backup frequency dialog, quarterly option |
| 07-language | 2 | Switch to German, switch back to English |

### What's NOT tested via E2E
- **Passkeys**: WebAuthn requires hardware/platform authenticator — not automatable
- **Email delivery**: SES is AWS-internal
- **CloudFront**: Dev doesn't use CloudFront
- **Kill switch / digest**: EventBridge-triggered, not browser-triggerable

### Debugging E2E failures
- **Screenshots**: Captured on failure in `frontend/e2e-results/`
- **Video**: Retained on failure in `frontend/e2e-results/`
- **Traces**: View with `npx playwright show-trace frontend/e2e-results/<test>/trace.zip`
- **HTML report**: `frontend/e2e-report/index.html`

---

## Performance Tests

Performance tests measure API response times, concurrent user handling, and payload scaling against checked-in baselines.

`scripts/perftest.sh` automates the full workflow: creates a temporary admin, onboards it (OTP login + password change), runs perf scenarios, and cleans up on exit.

```bash
# Run against dev (recommended)
scripts/perftest.sh --env dev

# Run against beta
scripts/perftest.sh --env beta

# Keep test data after run (for manual inspection)
scripts/perftest.sh --env dev --keep

# Clean up a previous --keep run
scripts/perftest.sh --cleanup --env dev

# Manual run (without the wrapper script)
cd backend && SIT_BASE_URL=https://<api-url> SIT_ENV=dev SIT_ADMIN_EMAIL=... SIT_ADMIN_OTP=... SIT_ADMIN_PASSWORD=... npx vitest run --config perf/vitest.config.ts

# View results
open backend/perf/perf-report.html
```

**Cannot run on prod.** The script creates a temporary admin account, onboards it, runs 19 perf tests, and cleans up all artifacts (users, vaults, S3 files, login events, audit events) on exit. Use `--keep` to preserve test data for inspection, then `--cleanup` to remove it later.

### Performance Scenarios

| Scenario | Tests | What it measures |
|----------|-------|-----------------|
| 01 Response Times | 10 | p50/p95/p99 latency per endpoint (health, auth, vault, admin) |
| 02 Concurrent Users | 3 | 5 parallel users, no 429s, per-user completion time |
| 03 Payload Size | 6 | Vault PUT+GET with 1KB to 1MB payloads |

### Baselines

Stored in `backend/perf/baselines.json`. Key thresholds (p95):

| Endpoint | Baseline |
|----------|----------|
| health | 200ms |
| auth login | 1500ms |
| vault list | 800ms |
| admin users | 2000ms |
| admin export | 5000ms |

### Reports

Performance tests generate 3 output formats:
1. **Terminal**: ASCII bar chart (immediate feedback during qualification)
2. **HTML**: `backend/perf/perf-report.html` — inline SVG charts, self-contained, no dependencies
3. **Markdown+SVG**: `docs/perf/YYYY-MM-DD.md` — visible on GitHub, tracks history

### Updating baselines

Edit `backend/perf/baselines.json` when response times legitimately change (new dependencies, infrastructure changes). Commit the updated file.

---

## Qualification Pipeline

The qualification script automates the complete verification pipeline for dev:

```bash
# Full qualification
./scripts/qualify.sh --profile AndreasDevAccess

# Cleanup after debugging failures
./scripts/qualify.sh --cleanup --profile AndreasDevAccess
```

**Pipeline:** Build → Unit tests → CDK deploy → SIT → Pentest → E2E → Performance → Evaluate

- All pass: stack auto-destroyed, clean exit
- Any fail: stack preserved, reports available, cleanup via `--cleanup`

See [QUALIFICATION.md](QUALIFICATION.md) for full documentation.

---

## Test Pyramid

| Layer | Framework | ~Count | Runs in | Purpose |
|-------|-----------|--------|---------|---------|
| Unit | vitest | 620+ | Local, CI, qualify | Component-level correctness |
| SIT | vitest + HTTP | 70+ | Qualify | API integration against live stack |
| Pentest | vitest + HTTP | 90+ | Qualify | Security verification (OWASP) |
| E2E | Playwright | 28+ | Qualify | Browser-level user flows |
| Perf | vitest + HTTP | 19+ | Qualify | Response time and load baselines |

---

## Pre-Deployment Checklist

Before promoting from dev to beta to prod:

- [ ] **`./scripts/qualify.sh --profile <name>` passes** (runs all automated checks below)
- [ ] `npm test` passes (all unit tests green)
- [ ] `npm run typecheck` passes (no type errors in any package)
- [ ] `npm run build` succeeds (shared, backend, frontend)
- [ ] `scripts/sitest.sh --env <env>` passes (all SIT scenarios green)
- [ ] `scripts/pentest.sh --env <env>` passes (no security findings)
- [ ] E2E browser tests pass (Playwright)
- [ ] Performance baselines met
- [ ] Admin login and first-password-change flow works end-to-end
- [ ] User creation, login, vault item CRUD works
- [ ] Multi-vault: free users limited to 1, pro users to 10
- [ ] (Beta/Prod) Passkey registration and two-step admin login work correctly
- [ ] OTP expiry enforced; Refresh OTP issues working replacement
- [ ] User lifecycle: lock/unlock/expire/retire work correctly
- [ ] Warning codes: duplicate password and breach detection work
- [ ] Audit log: events recorded for all categories when enabled
- [ ] (Prod) Email verification flow works
- [ ] (Beta/prod) SES `SENDER_EMAIL` is set; emails deliver
- [ ] i18n: language selector works, translations load correctly
