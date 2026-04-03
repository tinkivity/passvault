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
./scripts/setup.sh --env dev --profile my-profile
```

---

## Full Deployment Guide

For complete instructions covering all environments, custom domains, SES email, monitoring, kill switch setup, and troubleshooting, see:

**[cdk/DEPLOYMENT.md](cdk/DEPLOYMENT.md)**

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [cdk/DEPLOYMENT.md](cdk/DEPLOYMENT.md) | Full deployment guide (SSM, CDK context, SES, monitoring) |
| [cdk/ARCHITECTURE.md](cdk/ARCHITECTURE.md) | CDK constructs, DynamoDB tables, Lambda definitions, API Gateway |
| [scripts/README.md](scripts/README.md) | Post-deploy scripts (init-admin, seed-dev, cleanup, setup) |
| [BOTPROTECTION.md](BOTPROTECTION.md) | Bot defense layers, CloudFront flat-rate plan, kill switch, cost analysis |
| [COSTS.md](COSTS.md) | Detailed cost projections per user count |
