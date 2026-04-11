# Scripts

Operational scripts for deploying, seeding, testing, and cleaning up PassVault stacks.
All scripts assume AWS credentials are available in the environment (profile, env vars, or EC2 role).

---

## init-admin.ts

Creates the admin user in DynamoDB with a one-time password printed to the console.

**When to run:** Once after the first `cdk deploy` for a given environment.

**Usage:**

```bash
ENVIRONMENT=dev ADMIN_EMAIL=you@example.com npx tsx scripts/init-admin.ts
```

**Required environment variables:**

| Variable       | Description                              |
| -------------- | ---------------------------------------- |
| `ENVIRONMENT`  | Target environment (`dev`, `beta`, `prod`) |
| `ADMIN_EMAIL`  | Email address for the admin user         |

AWS credentials must be configured. The DynamoDB users table must already exist.

---

## seed-dev.ts

Populates a dev stack with ready-to-use test accounts and sample vault content (writes directly to DynamoDB and S3).

**When to run:** After deploying a dev stack, to get working test accounts without going through the OTP / change-password flow. Called automatically by `post-deploy.sh` on first dev startup.

**Safety:** Refuses to run against beta or prod.

**Usage:**

```bash
ENVIRONMENT=dev FILES_BUCKET=passvault-files-dev-xxxx npx tsx scripts/seed-dev.ts
```

**Required environment variables:**

| Variable       | Description                                    |
| -------------- | ---------------------------------------------- |
| `ENVIRONMENT`  | Must be `dev`                                  |
| `FILES_BUCKET` | S3 bucket name for vault files (from CFN outputs) |

Idempotent -- users that already exist are skipped.

---

## post-deploy.sh

Builds and deploys the frontend, or starts a local Vite dev server pointed at a deployed stack.

**When to run:** Whenever you need to deploy a frontend update or start local development.

**Usage:**

```bash
# Local dev server (writes .env.local, cleans up on exit)
./scripts/post-deploy.sh --env dev

# Deploy to beta (S3 + CloudFront invalidation)
./scripts/post-deploy.sh --env beta

# Deploy to prod (requires confirmation)
./scripts/post-deploy.sh --env prod

# With explicit AWS profile and region
./scripts/post-deploy.sh --env beta --profile my-profile --region eu-central-1
```

**Options:**

| Flag        | Description                                              |
| ----------- | -------------------------------------------------------- |
| `--env`     | Target environment: `dev`, `beta`, `prod` (required)     |
| `--profile` | AWS named profile (omit for default credential chain)    |
| `--region`  | AWS region (default: `eu-central-1`)                     |
| `--stack`   | CloudFormation stack name (overrides default from --env)  |

---

## smoke-test.ts

Runs API smoke tests against any deployed stack (health, challenge, and optionally auth/users endpoints).

**When to run:** After a deployment to verify the stack is healthy.

**Usage:**

```bash
# Basic (health + challenge only)
ENVIRONMENT=beta npx tsx scripts/smoke-test.ts

# With auth tests
ENVIRONMENT=beta npx tsx scripts/smoke-test.ts --password <admin-password>

# Custom base URL
ENVIRONMENT=prod npx tsx scripts/smoke-test.ts --base-url https://pv.example.com --password <pass>
```

**Required environment variables:**

| Variable      | Description                                          |
| ------------- | ---------------------------------------------------- |
| `ENVIRONMENT` | Target environment (`dev`, `beta`, `prod`)           |

**Optional flags:**

| Flag           | Description                                            |
| -------------- | ------------------------------------------------------ |
| `--password`   | Admin password -- enables auth and users tests         |
| `--base-url`   | Override API base URL (skips CloudFormation lookup)     |
| `--profile`    | AWS named profile                                      |
| `--region`     | AWS region (default: `eu-central-1`)                   |
| `--stack`      | CloudFormation stack name (overrides ENVIRONMENT default) |

Exit code 0 means all tests passed; 1 means one or more failed.

---

## sitest.sh

Runs system integration tests (SIT) against a deployed stack. Creates a temporary admin, exercises auth, vault, admin, and audit flows, and cleans up all artifacts on exit.

**When to run:** After deploying a stack, to validate end-to-end functionality.

**Usage:**

```bash
# Run against dev
./scripts/sitest.sh --env dev

# Keep test data for inspection
./scripts/sitest.sh --env dev --keep

# Clean up a previous --keep run (auto-discovers state file)
./scripts/sitest.sh --cleanup --env dev

# Clean up with a specific state file
./scripts/sitest.sh --cleanup .sit-state-dev-bold-hawk.json
```

**Options:**

| Flag          | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| `--env`       | Target environment: `dev`, `beta` (required; prod blocked)      |
| `--profile`   | AWS named profile                                               |
| `--region`    | AWS region (default: `eu-central-1`)                            |
| `--stack`     | CloudFormation stack name (overrides default from --env)        |
| `--base-url`  | API base URL override (skips CloudFormation lookup)             |
| `--keep`      | Keep test data after run (writes a state file for later cleanup)|
| `--cleanup`   | Skip tests; only clean up data from a previous `--keep` run    |

**Cleanup covers:** users, vaults, S3 vault files, login events, audit events.

---

## pentest.sh

Runs automated penetration tests organized by OWASP categories against a deployed stack. Creates 3 test users (admin, pro, free) with known passwords and cleans up on exit.

**When to run:** Before promoting a stack from dev to beta or beta to prod.

**Usage:**

```bash
# Run against dev
./scripts/pentest.sh --env dev

# Keep test data for inspection
./scripts/pentest.sh --env dev --keep

# Clean up a previous --keep run (auto-discovers state file)
./scripts/pentest.sh --cleanup --env dev

# Clean up with a specific state file
./scripts/pentest.sh --cleanup .pentest-state-dev-a1b2c3d4.json
```

**Options:**

| Flag          | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| `--env`       | Target environment: `dev`, `beta` (required; prod blocked)      |
| `--profile`   | AWS named profile                                               |
| `--region`    | AWS region (default: `eu-central-1`)                            |
| `--stack`     | CloudFormation stack name (overrides default from --env)        |
| `--base-url`  | API base URL override (skips CloudFormation lookup)             |
| `--keep`      | Keep test data after run (writes a state file for later cleanup)|
| `--cleanup`   | Skip tests; only clean up data from a previous `--keep` run    |

**Cleanup covers:** users, vaults, S3 vault files, login events, audit events.

---

## e2etest.sh

Runs Playwright E2E browser tests against a deployed stack. Creates a temporary admin user, onboards it (OTP login + password change), starts a local Vite dev server, runs tests, and cleans up on exit.

**When to run:** After deploying a stack, to validate browser-level user flows.

**Usage:**

```bash
# Run against dev (creates its own admin, cleans up after)
./scripts/e2etest.sh --env dev

# Keep test user for inspection
./scripts/e2etest.sh --env dev --keep

# Clean up a previous --keep run
./scripts/e2etest.sh --cleanup --env dev

# Interactive debugging with Playwright UI
./scripts/e2etest.sh --env dev --ui

# Headed mode (visible browser)
./scripts/e2etest.sh --env dev --headed
```

**Options:**

| Flag | Description |
|------|-------------|
| `--env` | Target environment: `dev`, `beta` (required; prod blocked) |
| `--profile` | AWS named profile |
| `--region` | AWS region (default: `eu-central-1`) |
| `--stack` | CloudFormation stack name override |
| `--base-url` | API base URL override (skips CloudFormation lookup) |
| `--keep` | Keep test user after run (writes state file for later cleanup) |
| `--cleanup` | Skip tests; only clean up from a previous `--keep` run |
| `--headed` | Run with visible browser |
| `--ui` | Run in Playwright UI mode (interactive debugging) |

**Cleanup covers:** E2E admin user, vaults, S3 files, audit events. Vite server and `.env.local` are always cleaned up on exit.

---

## perftest.sh

Runs performance tests (response times, concurrent users, payload scaling) against a deployed stack. Creates a temporary admin user, onboards it (OTP login + password change), runs vitest perf scenarios, and cleans up on exit.

**When to run:** After deploying a stack, to verify API performance against checked-in baselines.

**Usage:**

```bash
# Run against dev
./scripts/perftest.sh --env dev

# Run against beta
./scripts/perftest.sh --env beta

# Keep test data after run (for manual inspection)
./scripts/perftest.sh --env dev --keep

# Clean up a previous --keep run (auto-discovers state file)
./scripts/perftest.sh --cleanup --env dev

# Clean up with a specific state file
./scripts/perftest.sh --cleanup .perf-state-dev-rapid-tiger.json
```

**Options:**

| Flag | Description |
|------|-------------|
| `--env` | Target environment: `dev`, `beta` (required; prod blocked) |
| `--profile` | AWS named profile |
| `--region` | AWS region (default: `eu-central-1`) |
| `--stack` | CloudFormation stack name override |
| `--base-url` | API base URL override (skips CloudFormation lookup) |
| `--keep` | Keep test data after run (writes state file for later cleanup) |
| `--cleanup` | Skip tests; only clean up data from a previous `--keep` run |

**Cleanup covers:** perf admin user, created users, vaults, S3 files, login events, audit events.

---

## qualify.sh

Runs the full qualification pipeline for `dev`, `beta`, or `prod`: build, unit tests, deploy, SIT, pentest, E2E browser tests, performance tests — then auto-destroys on success or preserves the stack on failure for debugging.

**When to run:** Before merging feature branches to main, before promoting to beta.

**Usage:**

```bash
# Dev qualification (default)
./scripts/qualify.sh --profile <aws-profile>

# Beta qualification — reads PlusAddress + domain from the deployed stack
./scripts/qualify.sh --env beta --profile <aws-profile>

# Beta in CI (skip the "real mail will be sent" confirmation)
./scripts/qualify.sh --env beta --yes --profile <aws-profile>

# Cleanup after debugging failures
./scripts/qualify.sh --cleanup --env beta --profile <aws-profile>

# Cleanup with specific state file
./scripts/qualify.sh --cleanup .qualify-state-beta-20260406-120000.json --profile <aws-profile>
```

**Options:**

| Flag | Description |
|------|-------------|
| `--env <name>` | Target environment: `dev` (default), `beta`, or `prod`. Stack name derived automatically. |
| `--profile` | AWS named profile |
| `--region` | AWS region (default: `eu-central-1`) |
| `--domain <d>` | Root domain. Pass through to `cdk deploy` for fresh beta/prod deploys. |
| `--plus-address <addr>` | Mailbox for qualification mail (beta/prod). If omitted, read from the stack's `PlusAddress` CfnOutput. When set, test users become `local+<tag>@<domain>`; otherwise falls back to `@passvault-test.local`. |
| `--yes` | Skip the beta/prod "real mail will be sent" prompt (CI). |
| `--resume` | Skip build/test/deploy; run tests against an existing stack. |
| `--cleanup [file]` | Cleanup-only mode (auto-discovers state file if not specified) |

**Pipeline:** Build → Unit tests → CDK deploy → SIT → Pentest → E2E → Performance → Evaluate

**Email routing:** Dev always uses `@passvault-test.local` (no real mail sent — dev Lambdas have no `SENDER_EMAIL`). Beta/prod qualification reads the `PlusAddress` CfnOutput (deployed via `cdk deploy --context plusAddress=...`) and routes all ~15 test-user invitations to `local+<tag>@<domain>`. Before the first beta qualification against a newly-verified SES domain, run the send-email smoke test in [cdk/DEPLOYMENT.md §4a](../cdk/DEPLOYMENT.md) to isolate SES identity problems from application wiring.

See [docs/QUALIFICATION.md](../docs/QUALIFICATION.md) for full documentation.

---

## generate-template-manifest.ts

Generates `cdk/assets/email-templates/_meta.json` — a SHA-256 hash manifest of all email templates. Used by the backend to detect which templates have been modified from their CDK-deployed originals.

**When to run:** After changing any email template in `cdk/assets/email-templates/`. Run before deploying.

**Usage:**

```bash
npx tsx scripts/generate-template-manifest.ts
```

---

## post-destroy.sh

Removes AWS resources left behind after `cdk destroy` (DynamoDB tables with RETAIN policy, S3 buckets, orphaned CloudWatch log groups).

**When to run:** After running `cdk destroy` for a stack.

**Usage:**

```bash
./scripts/post-destroy.sh --env dev
./scripts/post-destroy.sh --env prod --profile my-profile --region eu-central-1
```

**Options:**

| Flag        | Description                                           |
| ----------- | ----------------------------------------------------- |
| `--env`     | Target environment: `dev`, `beta`, `prod` (required)  |
| `--profile` | AWS named profile                                     |
| `--region`  | AWS region                                            |

**Resources cleaned up:**

- DynamoDB tables: `passvault-users-{env}`, `passvault-vaults-{env}`
- S3 files bucket (auto-named, found via CFN stack tag)
- CloudWatch log groups: `/aws/lambda/passvault-*-{env}`
