# PassVault Qualification Pipeline

## Overview

The qualification pipeline is an automated full-stack verification for the dev environment. It builds, tests, deploys, and validates the entire system — then cleans up automatically if everything passes. If anything fails, the deployed stack is preserved for debugging.

**When to run:**
- Before merging feature branches to main
- Before promoting changes to beta
- After significant refactoring

**Expected runtime:** 8-12 minutes (depends on Lambda cold starts and network latency)

## Prerequisites

- Node.js 22+ with npm workspaces
- AWS CLI v2 configured with a named profile
- AWS CDK v2 bootstrapped for your account/region
- All dependencies installed (`npm install` at root)
- No existing `PassVault-Dev` stack (destroy first or use `--cleanup`)

## Running a Qualification

```bash
./scripts/qualify.sh --profile AndreasDevAccess
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--profile <name>` | No | (none) | AWS named profile for all AWS operations |
| `--region <region>` | No | `eu-central-1` | AWS region |
| `--resume` | No | (none) | Skip build/test/deploy; run SIT/pentest/E2E/perf against existing stack |
| `--cleanup [file]` | No | (none) | Cleanup-only mode (see below) |
| `-h, --help` | No | | Show usage |

The script is hardcoded to the `dev` environment. There is no `--env` flag.

## Pipeline Steps

### Step 1: Build

Builds all 4 workspaces: shared, backend, frontend, CDK.

```
npm run build
```

**On failure:** Aborts immediately. No AWS resources are created.

### Step 2: Unit Tests

Runs vitest in each workspace:
- shared (~57 tests)
- backend (~360 tests)
- frontend (~189 tests)
- CDK (~61 tests)

**On failure:** Aborts immediately. No AWS resources are created.

### Step 3: CDK Deploy

Deploys the full `PassVault-Dev` stack:
- DynamoDB tables (users, vaults, audit, config, passkey credentials, login events)
- S3 buckets (vault files, email templates, frontend)
- Lambda functions (8 handlers)
- API Gateway with all routes
- EventBridge digest schedule
- Email template seeding

**On failure:** Attempts automatic cleanup (`cdk destroy` + `post-destroy.sh`), then aborts.

### Step 4: SIT (System Integration Tests)

Runs the full SIT suite against the deployed stack:
- Creates test users (admin + regular users)
- Tests all API endpoints end-to-end
- Verifies auth flows, user management, vault operations, email templates, audit logging

Uses `scripts/sitest.sh --env dev --keep` internally.

**On failure:** Continues to next step. Stack preserved for debugging.

### Step 5: Pentest (Penetration Tests)

Runs OWASP-focused security tests:
- Authentication bypass attempts
- Injection attacks
- Authorization escalation
- Rate limiting verification
- JWT manipulation
- CORS header validation
- Email template endpoint security

Uses `scripts/pentest.sh --env dev --keep` internally.

**On failure:** Continues to next step. Stack preserved for debugging.

### Step 6: E2E (Browser Tests)

Uses `scripts/e2etest.sh --env dev --keep --base-url <api-url>` internally. The script handles the full lifecycle:
- Creates a temporary admin user and onboards it (OTP login + password change)
- Builds the frontend and starts a local `vite preview` server
- Runs Playwright browser tests (auth, admin users, templates, language switching)
- Writes a state file (`.e2e-state-dev-*.json`) for later cleanup

**On failure:** Continues to next step. Stack and E2E state preserved for debugging.
**If Playwright not installed:** Skips with warning.

### Step 7: Performance Tests

Uses `scripts/perftest.sh --env dev --keep --base-url <api-url>` internally. The script handles the full lifecycle:
- Creates a temporary admin user + test user
- Onboards both users and creates a vault with seed data
- Runs response time benchmarks (10 endpoints), concurrent access (5 streams), payload scaling (1KB–1MB)
- Writes a state file (`.perf-state-dev-*.json`) for later cleanup

Generates 3 report formats: terminal ASCII chart, self-contained HTML (`backend/perf/perf-report.html`), markdown+SVG (`docs/perf/report.md`).

**On failure:** Continues to evaluation. Stack and perf state preserved for debugging.
**If perf config not found:** Skips with warning.

### Step 8: Evaluate

Checks all step results:
- **All pass** (or skipped): Automatically destroys the stack and cleans up all test data
- **Any failure**: Preserves the stack, prints summary with failure details and report paths

## Reading Results

### Success Output

```
═══════════════════════════════════════════════
  PassVault Dev Qualification — PASS ✓
═══════════════════════════════════════════════
  Build    ✓  12s
  Tests    ✓  25s
  Deploy   ✓  148s
  SIT      ✓  45s
  Pentest  ✓  60s
  E2E      ✓  90s
  Perf     ✓  120s
─────────────────────────────────────────────
  Total: 8m 20s
  Stack destroyed and cleaned up.
═══════════════════════════════════════════════
```

### Failure Output

```
═══════════════════════════════════════════════
  PassVault Dev Qualification — FAIL ✗
═══════════════════════════════════════════════
  Build    ✓  12s
  Tests    ✓  25s
  Deploy   ✓  148s
  SIT      ✓  45s
  Pentest  ✗  60s    ← FAILED
  E2E      ✓  90s
  Perf     ✓  120s
─────────────────────────────────────────────
  Stack PassVault-Dev left deployed for debugging.
  State: .qualify-state-dev-20260406-120000.json
  SIT state: .sit-state-dev-bold-hawk.json
  Pentest state: .pentest-state-dev-a1b2c3d4.json
  E2E state: .e2e-state-dev-swift-raven.json
  Perf state: .perf-state-dev-rapid-tiger.json

  To clean up after fixing:
    ./scripts/qualify.sh --cleanup
═══════════════════════════════════════════════
```

## Debugging Failures

### Build or test failures (Steps 1-2)
Fix the code locally. No cloud resources to worry about — nothing was deployed.

### Deploy failure (Step 3)
The script attempts automatic cleanup. If that fails, run manually:
```bash
cd cdk && npx cdk destroy PassVault-Dev --context env=dev --force
./scripts/post-destroy.sh --env dev --profile AndreasDevAccess
```

### SIT or pentest failures (Steps 4-5)
The stack is running. You can:
1. Inspect CloudWatch logs: `/aws/lambda/passvault-*-dev`
2. Re-run individual tests: `./scripts/sitest.sh --env dev --profile AndreasDevAccess`
3. Hit endpoints directly using the API URL from the state file

### E2E failures (Step 6)
Open the HTML report for screenshots and traces:
```bash
open frontend/e2e-report/index.html
npx playwright show-trace frontend/e2e-results/<test-name>/trace.zip
```

### Performance failures (Step 7)
Open the HTML report for charts comparing actual vs. baseline:
```bash
open backend/perf/perf-report.html
```
If baselines need updating (e.g., after adding a new dependency that legitimately slows an endpoint), edit `backend/perf/baselines.json`.

## Cleanup After Failure

After fixing issues and verifying locally:

```bash
# Automatic cleanup (reads state file, destroys everything)
./scripts/qualify.sh --cleanup --profile AndreasDevAccess

# Or specify the state file explicitly
./scripts/qualify.sh --cleanup .qualify-state-dev-20260406-120000.json --profile AndreasDevAccess
```

Cleanup performs:
1. SIT test data cleanup (removes test users, vaults, events)
2. Pentest test data cleanup
3. E2E test data cleanup (removes E2E admin user and created users)
4. Perf test data cleanup (removes perf admin, test user, vaults, events)
5. `cdk destroy PassVault-Dev`
6. Post-destroy cleanup (retained DynamoDB tables, S3 buckets, log groups)
7. Removes all state files (qualify, SIT, pentest, E2E, perf)

## State File

The qualification creates `.qualify-state-dev-{timestamp}.json` in the repo root. This file tracks:
- Which steps passed/failed and their durations
- Paths to sub-script state files: `sitStateFile`, `pentestStateFile`, `e2eStateFile`, `perfStateFile`
- API URL, stack name, region, profile
- Overall result (`PASS` / `FAIL` / `running`)

The state file is gitignored and deleted automatically on successful cleanup.

## Updating Performance Baselines

Performance baselines are stored in `backend/perf/baselines.json` and checked into git. Update them when:
- A code change legitimately changes response times (new dependency, schema change)
- Infrastructure changes affect latency (memory size, region)
- The current baselines are too tight or too loose

To update: edit `baselines.json`, commit, and re-run qualification.

## Adding New Tests

### SIT scenario
Add to `backend/sit/scenarios/`, import in `sit.test.ts`. Follow existing patterns.

### Pentest scenario
Add to `backend/pentest/scenarios/`, import in `pentest.test.ts`. Follow OWASP naming convention.

### E2E spec
Add to `frontend/e2e/specs/`. Use the auth fixture for pre-authenticated pages. Follow the numbered naming convention.

### Performance scenario
Add to `backend/perf/scenarios/`, import in `perf.test.ts`. Add corresponding baselines to `baselines.json`.
