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
