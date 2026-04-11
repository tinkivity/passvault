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

Qualification runs against **dev or beta only**. Prod is rejected outright —
the pipeline creates and destroys ephemeral test users and must never touch
production.

### Dev (default, self-contained)

```bash
./scripts/qualify.sh --profile <aws-profile>
```

Dev needs no operator input beyond the AWS profile. Test users use the
`@passvault-test.local` fallback; dev Lambdas have no `SENDER_EMAIL`
configured, so no real mail is ever sent.

### Beta — first run against a fresh stack

When `PassVault-Beta` is not yet deployed, `qualify.sh` will run
`cdk deploy` as part of Step 3. The operator **must** supply both:

```bash
./scripts/qualify.sh --env beta \
  --domain example.com \
  --plus-address you@example.com \
  --profile <aws-profile>
```

- `--domain <d>` is required because CDK needs `--context domain=<d>` to
  create the ACM cert stack, CloudFront distribution, Route 53 records, and
  SES notifier. Without it, `cdk deploy` synthesizes a dev-shaped stack and
  fails. The domain must already be a Verified SES identity in the target
  account/region — see [cdk/DEPLOYMENT.md §4a](../cdk/DEPLOYMENT.md#4a-ses-domain-verification-precondition-for---context-domain)
  and run the send-email smoke test first.
- `--plus-address <addr>` is required to route all ~15 qualification
  test-user invitations into a real mailbox. Without it the pipeline would
  fall back to `@passvault-test.local`, which hard-bounces at DNS and
  damages SES sender reputation. `addr` must be `local@<domain>` and its
  domain must equal `--domain`.

Both flags are persisted to the deployed stack as CloudFormation outputs
(`Domain`, `PlusAddress`), so you only have to pass them on the first run.

### Beta — subsequent runs against an already-deployed stack

Once `PassVault-Beta` exists, `qualify.sh` reads the `Domain` and
`PlusAddress` outputs directly from the stack. You can omit the flags:

```bash
./scripts/qualify.sh --env beta --resume --profile <aws-profile>
./scripts/qualify.sh --env beta --resume --yes --profile <aws-profile>   # CI: skip confirm
```

If you *do* pass `--domain` / `--plus-address` and they disagree with what's
in the stack outputs, qualify aborts with an error rather than silently
using one or the other — mismatched context would corrupt the final
`cdk destroy` at end-of-run.

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--env <name>` | No | `dev` | `dev` or `beta`. `prod` is rejected. |
| `--profile <name>` | No | (none) | AWS named profile for all AWS operations |
| `--region <region>` | No | `eu-central-1` | AWS region |
| `--domain <d>` | Beta fresh deploy only | (none) | Root domain, passed to `cdk deploy --context domain=<d>`. On beta runs against an existing stack, read from the `Domain` CfnOutput instead. |
| `--plus-address <addr>` | Beta fresh deploy only | (none) | Mailbox that receives all qualification test mail (e.g. `you@example.com`). On beta runs against an existing stack, read from the `PlusAddress` CfnOutput instead. |
| `--yes` | No | (none) | Skip the beta "real mail will be sent" confirmation prompt. Use in CI. |
| `--resume` | No | (none) | Skip build/test/deploy; run SIT/pentest/E2E/perf against an existing stack. |
| `--cleanup [file]` | No | (none) | Cleanup-only mode (see below). |
| `-h, --help` | No | | Show usage. |

## Test Email Routing

Qualification creates ~15 test users per run. Each triggers an invitation
email from the backend. Dev keeps the `@passvault-test.local` fallback safely
because dev Lambdas have no `SENDER_EMAIL`. Beta sends real mail.

The routing is driven by two CDK context values set at `cdk deploy` time:

- `--context domain=example.com` — the verified SES domain the backend sends
  *from* (as `noreply@{subdomain}.{domain}`).
- `--context plusAddress=you@example.com` — the inbox qualification test
  users send *to*, as `you+<tag>-<ts>@example.com`.

CDK emits these as `Domain` and `PlusAddress` CloudFormation outputs
([cdk/lib/passvault-stack.ts](../cdk/lib/passvault-stack.ts)). `qualify.sh
--env beta` reads the outputs on every run, exports
`PASSVAULT_PLUS_ADDRESS` into the child-script environment, and all test
users become `you+<tag>-<ts>@example.com` via the shared `testUserEmail`
helper ([backend/sit/lib/test-emails.ts](../backend/sit/lib/test-emails.ts)).

**Before the first beta deploy and before every `qualify.sh --env beta` run**,
run the SES send-email smoke test in [cdk/DEPLOYMENT.md §4a](../cdk/DEPLOYMENT.md#4a-ses-domain-verification-precondition-for---context-domain)
— it isolates SES identity problems from Lambda wiring at zero cost.

Inbox hygiene: add filters on `+sit-`, `+e2e-`, `+perf-` tags (and
`+qualify-admin` for the bootstrap admin mail) to auto-archive the noise. A
single qualification run produces roughly: 2× `+sit-pro-`, 2× `+sit-free-`,
1× `+sit-lockout-`, 1× `+sit-lang-`, 5–7× `+e2e-*`, 1× `+perf-user-`, 1×
`+qualify-admin-`.

Beta runs pause before sending real mail:

```
⚠  beta qualification will send real emails to you+*@example.com
   (~15 messages: one invitation per test user, plus vault-export and digest)

   Proceed? [y/N]
```

Pass `--yes` to bypass in CI. Dev runs are never prompted.

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

Deploys the full `PassVault-{Env}` stack (`PassVault-Dev` or `PassVault-Beta`):
- DynamoDB tables (users, vaults, audit, config, passkey credentials, login events)
- S3 buckets (vault files, email templates, frontend)
- Lambda functions (8 handlers)
- API Gateway with all routes
- EventBridge digest schedule
- Email template seeding
- **Beta only**: CloudFront distribution, ACM certificate, Route 53 records, SES notifier (driven by `--context domain=<d>`)

Beta deploys additionally pass `--context plusAddress=<addr>` so the
stack emits the `Domain` and `PlusAddress` CfnOutputs that subsequent
`--resume` / `--cleanup` runs read.

**On failure:** Attempts automatic cleanup (`cdk destroy` + `post-destroy.sh`), then aborts.

### Step 4: SIT (System Integration Tests)

Runs the full SIT suite against the deployed stack:
- Creates test users (admin + regular users)
- Tests all API endpoints end-to-end
- Verifies auth flows, user management, vault operations, email templates, audit logging

Uses `scripts/sitest.sh --env <env> --keep` internally (where `<env>` is
whatever you passed via `--env`). On beta, `PASSVAULT_PLUS_ADDRESS` is
exported into the child environment so test-user addresses become
`local+sit-*@<domain>`.

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

Uses `scripts/pentest.sh --env <env> --keep` internally.

**On failure:** Continues to next step. Stack preserved for debugging.

### Step 6: E2E (Browser Tests)

Uses `scripts/e2etest.sh --env <env> --keep --base-url <api-url>` internally. The script handles the full lifecycle:
- Creates a temporary admin user and onboards it (OTP login + password change)
- Builds the frontend and starts a local `vite preview` server
- Runs Playwright browser tests (auth, admin users, templates, language switching)
- Writes a state file (`.e2e-state-<env>-*.json`) for later cleanup

**On failure:** Continues to next step. Stack and E2E state preserved for debugging.
**If Playwright not installed:** Skips with warning.

### Step 7: Performance Tests

Uses `scripts/perftest.sh --env <env> --keep --base-url <api-url>` internally. The script handles the full lifecycle:
- Creates a temporary admin user + test user
- Onboards both users and creates a vault with seed data
- Runs response time benchmarks (10 endpoints), concurrent access (5 streams), payload scaling (1KB–1MB)
- Writes a state file (`.perf-state-<env>-*.json`) for later cleanup

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

(Beta runs print `PassVault Beta Qualification` instead; the state
files are named `.qualify-state-beta-*.json` and similar.)

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

For beta, the banner, stack name, and state files all use `beta` in
place of `dev`, and the cleanup hint shows
`./scripts/qualify.sh --cleanup --env beta`.

## Debugging Failures

### Build or test failures (Steps 1-2)
Fix the code locally. No cloud resources to worry about — nothing was deployed.

### Deploy failure (Step 3)
The script attempts automatic cleanup. If that fails, run manually:
```bash
# Dev
cd cdk && npx cdk destroy PassVault-Dev --context env=dev \
  --context adminEmail=qualify@passvault-test.local --force
./scripts/post-destroy.sh --env dev --profile <aws-profile>

# Beta — must pass the same domain/plusAddress context you deployed with
cd cdk && npx cdk destroy PassVault-Beta \
  --context env=beta \
  --context domain=example.com \
  --context plusAddress=you@example.com \
  --context adminEmail=you+qualify-admin@example.com --force
./scripts/post-destroy.sh --env beta --profile <aws-profile>
```

### SIT or pentest failures (Steps 4-5)
The stack is running. You can:
1. Inspect CloudWatch logs: `/aws/lambda/passvault-*-<env>`
2. Re-run individual tests: `./scripts/sitest.sh --env <env> --profile <aws-profile>`
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
# Automatic dev cleanup (reads state file, destroys everything)
./scripts/qualify.sh --cleanup --profile <aws-profile>

# Automatic beta cleanup
./scripts/qualify.sh --cleanup --env beta --profile <aws-profile>

# Or specify the state file explicitly (env inferred from the filename)
./scripts/qualify.sh --cleanup .qualify-state-beta-20260406-120000.json --profile <aws-profile>
```

For beta, cleanup reads `Domain` and `PlusAddress` directly from the
deployed stack's CfnOutputs, so you don't need to re-pass those flags as
long as the stack is still up. If the stack has already been destroyed
externally, cleanup skips the `cdk destroy` step and only removes the
sub-script state files.

Cleanup performs:
1. SIT test data cleanup (removes test users, vaults, events)
2. Pentest test data cleanup
3. E2E test data cleanup (removes E2E admin user and created users)
4. Perf test data cleanup (removes perf admin, test user, vaults, events)
5. `cdk destroy PassVault-{Env}` with the same context as the original deploy
6. Post-destroy cleanup (retained DynamoDB tables, S3 buckets, log groups)
7. Removes all state files (qualify, SIT, pentest, E2E, perf)

## State File

The qualification creates `.qualify-state-<env>-{timestamp}.json` in the
repo root (`<env>` is `dev` or `beta`). This file tracks:
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
