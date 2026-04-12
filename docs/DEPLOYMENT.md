# PassVault - Deployment Guide

## Overview

PassVault deploys to AWS using CDK. Three environments are supported: **dev**, **beta**, and **prod**, each as a fully isolated CloudFormation stack.

| Environment | Passkeys | PoW | CloudFront | Monthly Cost |
|-------------|----------|-----|------------|-------------|
| Dev | Disabled | Disabled | Disabled | ~$0 |
| Beta | Disabled | Enabled | Enabled | ~$0 |
| Prod | Required | Enabled | Enabled | ~$0-2 |

---

## Prerequisites

- Node.js 22+, npm 8+
- AWS CLI v2 configured with credentials
- AWS CDK v2 (`npm install -g aws-cdk`)

---

## Qualification Gate

Before promoting changes to beta, run the qualification pipeline. Dev is the
fast, mail-safe path used on feature branches; beta exercises the full
SES/email path via [test email routing](../cdk/DEPLOYMENT.md#4b-routing-qualification-test-mail-to-your-inbox)
and is the gate before cutting a beta release. **Prod is not qualifiable** —
`qualify.sh --env prod` is rejected outright to keep test traffic off
production.

```bash
# Dev — self-contained, no real mail sent
./scripts/qualify.sh --profile <your-profile>

# Beta, first run against a fresh PassVault-Beta stack (flags required)
./scripts/qualify.sh --env beta \
  --domain example.com \
  --plus-address you@example.com \
  --profile <your-profile>

# Beta, subsequent runs (values read from the deployed stack's outputs)
./scripts/qualify.sh --env beta --resume --profile <your-profile>
```

Both modes automate: build, unit tests, CDK deploy, SIT, pentest, E2E browser
tests, and performance benchmarks. See [QUALIFICATION.md](QUALIFICATION.md)
for the flag reference and the full contract.

---

## Quick Start (Dev)

```bash
# 1. Install dependencies
npm install

# 2. Build shared types and backend Lambda bundles
npm run build -w shared -w backend

# 3. Bootstrap CDK (one-time)
cd cdk
cdk bootstrap aws://ACCOUNT-ID/eu-central-1

# 4. Create JWT secret in SSM (one-time per environment)
#    Note: this secret is also the KDF input for vault displayName encryption
#    at rest. Rotating it requires the runbook in cdk/DEPLOYMENT.md because
#    every encrypted displayName in DynamoDB must be re-encrypted under the
#    new key.
aws ssm put-parameter \
  --name /passvault/dev/jwt-secret \
  --value "$(openssl rand -hex 32)" \
  --type SecureString \
  --region eu-central-1

# 5. Deploy
cdk deploy PassVault-Dev --context env=dev --context adminEmail=you@example.com

# 6. Initialize admin account
cd ..
ENVIRONMENT=dev ADMIN_EMAIL=you@example.com npx tsx scripts/init-admin.ts

# 7. Start local UI for testing
./scripts/post-deploy.sh --env dev --profile my-profile
```

---

## Full Deployment Guide

For complete instructions covering all environments, custom domains, SES email, monitoring, kill switch setup, and troubleshooting, see:

**[cdk/DEPLOYMENT.md](../cdk/DEPLOYMENT.md)**

---

---

## Frontend Environment Variables

The frontend reads configuration from `VITE_*` env vars at build time. Set these in `.env.local` (for local dev) or inject them during CI builds:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | API base URL; empty for beta/prod (CloudFront proxies) | `http://localhost:3000` |
| `VITE_ENVIRONMENT` | Target environment | `dev` / `beta` / `prod` |
| `VITE_PASSKEY_REQUIRED` | Whether passkeys are required | `false` / `true` |
| `VITE_SESSION_TIMEOUT_SECONDS` | Session inactivity timeout | `300` |
| `VITE_VAULT_TIMEOUT_SECONDS` | Per-vault unlock timeout | `60` (dev/beta), `180` (prod) |

> **v2 change:** `VITE_VIEW_TIMEOUT_SECONDS`, `VITE_EDIT_TIMEOUT_SECONDS`, and `VITE_ADMIN_TIMEOUT_SECONDS` have been removed. They are replaced by `VITE_SESSION_TIMEOUT_SECONDS` and `VITE_VAULT_TIMEOUT_SECONDS`.

---

## System Integration Tests (SIT)

After deploying, run the SIT suite to validate the API end-to-end:

```bash
# Run and clean up automatically
scripts/sitest.sh --env dev

# Keep test data for inspection, clean up later
scripts/sitest.sh --env dev --keep
scripts/sitest.sh --cleanup --env dev
```

The SIT creates a temporary admin, exercises auth, vault, admin, and audit flows, and cleans up all artifacts (users, vaults, S3 files, events) on exit. Use `--keep` to preserve data for debugging, then `--cleanup` to remove it later. See `backend/sit/SCENARIOS.md` for the full scenario list.

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [cdk/DEPLOYMENT.md](../cdk/DEPLOYMENT.md) | Full deployment guide (SSM, CDK context, SES, monitoring) |
| [cdk/ARCHITECTURE.md](../cdk/ARCHITECTURE.md) | CDK constructs, DynamoDB tables, Lambda definitions, API Gateway |
| [scripts/README.md](../scripts/README.md) | Operational scripts (post-deploy, post-destroy, sitest, pentest, smoke-test) |
| [BOTPROTECTION.md](BOTPROTECTION.md) | Bot defense layers, CloudFront flat-rate plan, kill switch, cost analysis |
| [COSTS.md](COSTS.md) | Detailed cost projections per user count |
