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

Playwright tests verify user-facing flows in a headless Chromium browser against a deployed dev or beta stack. The `e2etest.sh` script handles the full lifecycle: creates a temporary admin user, onboards it (OTP login + password change), builds the frontend, starts a local preview server, runs the tests, and cleans up on exit.

### Running E2E tests

```bash
# Recommended: use the wrapper script (handles admin setup + cleanup)
./scripts/e2etest.sh --env dev --profile <aws-profile>

# Keep test user for debugging failures
./scripts/e2etest.sh --env dev --profile <aws-profile> --keep

# Clean up after a --keep run
./scripts/e2etest.sh --cleanup --env dev --profile <aws-profile>

# Interactive debugging with Playwright UI
./scripts/e2etest.sh --env dev --profile <aws-profile> --ui

# Headed mode (visible browser)
./scripts/e2etest.sh --env dev --profile <aws-profile> --headed
```

### How authentication works in E2E

The auth fixture (`frontend/e2e/fixtures/auth.fixture.ts`) authenticates via **direct API call** and injects the session into `sessionStorage`, bypassing browser form submission. This avoids race conditions with `vite preview` where native form POST can fire before React attaches event handlers.

**Environment variables** (set automatically by `e2etest.sh`):

| Variable | Description |
|----------|-------------|
| `E2E_BASE_URL` | Frontend URL (`http://localhost:5173`) |
| `E2E_API_BASE_URL` | API Gateway URL (used by the auth fixture for direct API login) |
| `E2E_ADMIN_EMAIL` | E2E admin email (auto-generated) |
| `E2E_ADMIN_PASSWORD` | E2E admin password (auto-generated) |

### E2E specs

| Spec | Tests | Status | What it covers |
|------|-------|--------|---------------|
| 01-auth | 6 | Active | Login (API-based), logout (header icon), invalid creds, route guards |
| 02-admin-users | 6 | Active | Dashboard, users table, create user + OTP dialog, view/edit/delete user |
| 03-admin-templates | 5 | Active | Template cards, language tabs, preview, download, upload + edited badge |
| 04-vault-unlock | 3 | Fixme | Password entry, wrong password, successful unlock (needs vault fixture) |
| 05-vault-items | 3 | Fixme | Create/search/delete items (needs vault fixture) |
| 06-notifications | 3 | Fixme | Notification prefs (only available for `role=user`, not admin) |
| 07-language | 2 | Active | Switch to German via globe icon, switch back to English |

**Current results:** 19 passed, 9 skipped (fixme), 0 failed.

### Example output

```
Running 28 tests using 1 worker

  ✓   1 01-auth.spec.ts › shows login page by default (315ms)
  ✓   2 01-auth.spec.ts › error on invalid credentials (933ms)
  ✓   3 01-auth.spec.ts › login with valid admin credentials (3.4s)
  ✓   4 01-auth.spec.ts › logout redirects to login (3.3s)
  ✓   5 01-auth.spec.ts › unauthenticated /ui redirects to login (295ms)
  ✓   6 01-auth.spec.ts › unauthenticated /ui/admin redirects to login (277ms)
  ✓   7 02-admin-users.spec.ts › navigate to dashboard (3.4s)
  ✓   8 02-admin-users.spec.ts › navigate to users — table visible (3.3s)
  ✓   9 02-admin-users.spec.ts › create user — OTP dialog appears (25.6s)
  ✓  10 02-admin-users.spec.ts › view user detail (4.9s)
  ✓  11 02-admin-users.spec.ts › edit user — save succeeds (4.6s)
  ✓  12 02-admin-users.spec.ts › delete user — removed (8.0s)
  ✓  13 03-admin-templates.spec.ts › navigate to email templates (3.3s)
  ...
  ✓  27 07-language.spec.ts › switch to German (5.0s)
  ✓  28 07-language.spec.ts › switch back to English (4.4s)

  9 skipped
  19 passed (1.6m)
```

### What's NOT tested via E2E

- **Passkeys**: WebAuthn requires hardware/platform authenticator — not automatable in headless Chromium
- **Vault operations**: Need vault fixture with encryption keys (04-vault-unlock, 05-vault-items are fixme)
- **Notifications**: Only available for `role=user`; current fixture creates admin users
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

Performance tests measure API response times, concurrent user handling, and payload scaling against checked-in baselines. Each endpoint is called 10 times (5 for large payloads) and the p95 is compared against the baseline threshold.

`scripts/perftest.sh` automates the full workflow: creates a temporary admin + test user, onboards both, creates a vault with seed data, runs perf scenarios, and cleans up on exit.

### Running perf tests

```bash
# Run against dev (recommended)
./scripts/perftest.sh --env dev --profile <aws-profile>

# Run against beta
./scripts/perftest.sh --env beta --profile <aws-profile>

# Keep test data after run (for manual inspection)
./scripts/perftest.sh --env dev --profile <aws-profile> --keep

# Clean up a previous --keep run
./scripts/perftest.sh --cleanup --env dev --profile <aws-profile>

# View the HTML report with charts
open backend/perf/perf-report.html
```

**Cannot run on prod.** Creates temporary users, runs 22 tests (4 setup + 10 response time + 1 concurrent + 7 payload), and cleans up all artifacts on exit.

### Performance scenarios

| Scenario | Tests | What it measures |
|----------|-------|-----------------|
| 00 Setup | 4 | Admin login, create test user, onboard user, create vault with seed data |
| 01 Response Times | 10 | p50/p95/p99 latency per endpoint (10 iterations each) |
| 02 Concurrent Access | 1 | 5 parallel vault read streams, no 429s |
| 03 Payload Size | 7 | Vault PUT+GET with 1KB–500KB round-trips, 1MB PUT, 1.1MB rejection, data restore |

### Baselines

Stored in `backend/perf/baselines.json`. Tests fail if p95 exceeds the threshold.

| Endpoint | Baseline (p95) | Notes |
|----------|---------------|-------|
| health | 1000ms | Includes Lambda cold start |
| challenge | 500ms | Lightweight crypto nonce |
| auth_login | 3500ms | bcrypt 12 rounds (pure JS) on Lambda — intentionally slow |
| vault_list | 800ms | DynamoDB query |
| vault_get_index | 1200ms | DynamoDB + S3 (includes cold start) |
| vault_put | 1500ms | DynamoDB + S3 write |
| admin_users | 2000ms | DynamoDB scan |
| admin_stats | 2000ms | Aggregation across tables |
| admin_templates | 3000ms | S3 list + read operations |
| admin_export | 5000ms | Zip all templates from S3 |

Payload baselines: 1KB=1000ms, 50KB=1500ms, 200KB=3000ms, 500KB=3000ms, 1MB PUT=5000ms.

### Example output

```
  Endpoint Response Times (p95)
------------------------------------------------------------------------
  health              451ms   (bl: 1000ms) [#######         |] PASS
  challenge           175ms    (bl: 500ms) [###     |] PASS
  auth_login         3072ms   (bl: 3500ms) [#################################################|] PASS
  vault_list          409ms    (bl: 800ms) [#######      |] PASS
  vault_get_index     733ms    (bl: 800ms) [############ |] PASS
  vault_put           337ms   (bl: 1500ms) [#####                   |] PASS
  admin_users         381ms   (bl: 2000ms) [######                           |] PASS
  admin_stats         181ms   (bl: 2000ms) [###                              |] PASS
  admin_templates    2559ms   (bl: 3000ms) [##########################################       |] PASS
  admin_export       1022ms   (bl: 5000ms) [#################] PASS

  Concurrent Access
------------------------------------------------------------------------
  concurrent_5_streams p95=1947ms  max=1947ms

  Payload Size Scaling
------------------------------------------------------------------------
  1kb_roundtrip       p95=690ms   max=690ms  (bl: 1000ms) PASS
  50kb_roundtrip      p95=650ms   max=650ms  (bl: 1500ms) PASS
  200kb_roundtrip     p95=619ms   max=619ms  (bl: 3000ms) PASS
  500kb_roundtrip     p95=1033ms  max=1033ms (bl: 3000ms) PASS
  1mb_put             p95=613ms   max=613ms  (bl: 5000ms) PASS
```

### Reports

Performance tests generate 3 output formats:

| Format | Location | Contents |
|--------|----------|----------|
| **Terminal** | stdout | ASCII bar chart with pass/fail (shown above) |
| **HTML** | `backend/perf/perf-report.html` | Self-contained with inline SVG charts (bar chart, box plot, payload scaling line chart) |
| **Markdown** | `docs/perf/report.md` | Inline SVG bar chart + tables (renders on GitHub) |
| **JSON** | `backend/perf/results.json` | Raw results data for programmatic analysis |

Open the HTML report to see interactive charts: `open backend/perf/perf-report.html`

The HTML report includes:
- **Endpoint Response Times** — horizontal bar chart with baseline threshold markers
- **Response Time Distribution** — box plot showing min/p50/p95/p99/max per endpoint
- **Payload Size Scaling** — line chart comparing actual p95 vs baseline across payload sizes

### Updating baselines

Edit `backend/perf/baselines.json` when response times legitimately change (new dependencies, infrastructure changes, Lambda memory adjustments). Commit the updated file. Key considerations:

- `auth_login` is intentionally slow — bcrypt with 12 rounds in pure JavaScript on Lambda
- `health` baseline includes cold start latency; increase Lambda memory to reduce this
- Payload baselines account for both PUT + GET round-trip (except 1MB which is PUT-only)

---

## Qualification Pipeline

The qualification script automates the complete verification pipeline for dev:

```bash
# Full qualification
./scripts/qualify.sh --profile <aws-profile>

# Cleanup after debugging failures
./scripts/qualify.sh --cleanup --profile <aws-profile>
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
