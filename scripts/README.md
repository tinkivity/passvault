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

**When to run:** After deploying a dev stack, to get working test accounts without going through the OTP / change-password flow. Called automatically by `setup.sh` on first dev startup.

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

## setup.sh

Builds and deploys the frontend, or starts a local Vite dev server pointed at a deployed stack.

**When to run:** Whenever you need to deploy a frontend update or start local development.

**Usage:**

```bash
# Local dev server (writes .env.local, cleans up on exit)
./scripts/setup.sh --env dev

# Deploy to beta (S3 + CloudFront invalidation)
./scripts/setup.sh --env beta

# Deploy to prod (requires confirmation)
./scripts/setup.sh --env prod

# With explicit AWS profile and region
./scripts/setup.sh --env beta --profile my-profile --region eu-central-1
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

## cleanup.sh

Removes AWS resources left behind after `cdk destroy` (DynamoDB tables with RETAIN policy, S3 buckets, orphaned CloudWatch log groups).

**When to run:** After running `cdk destroy` for a stack.

**Usage:**

```bash
./scripts/cleanup.sh --env dev
./scripts/cleanup.sh --env prod --profile my-profile --region eu-central-1
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
