# PassVault - AWS CDK Deployment Guide

## Overview

This guide provides complete instructions for deploying PassVault to AWS using AWS Cloud Development Kit (CDK). PassVault supports three deployment environments — **dev**, **beta**, and **prod** — each deployed as a fully isolated CloudFormation stack.

**Architecture:**
- Frontend: React SPA hosted on S3 + CloudFront
- Backend: API Gateway + Lambda functions (Node.js)
- Storage: S3 (encrypted files) + DynamoDB (user metadata)
- Security: CloudFront flat-rate plan (WAF + DDoS + bot management), passkey-based 2FA / WebAuthn (prod only)
- Encryption: Client-side end-to-end encryption (Argon2id + AES-256-GCM)

**Estimated Monthly Cost:**
- Dev/Beta: ~$0 (no passkey requirement, within AWS free tier)
- Prod: ~$0-2 for 3-100 users (CloudFront flat-rate plan is free; primary cost is CloudFront data transfer at scale)

See [BOTPROTECTION.md](BOTPROTECTION.md) for bot attack defense layers and worst-case cost analysis.

See [SPECIFICATION.md Section 2.5](SPECIFICATION.md) for full environment comparison.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Structure](#2-project-structure)
3. [Initial Setup](#3-initial-setup)
4. [CDK Stack Architecture](#4-cdk-stack-architecture)
5. [Infrastructure Components](#5-infrastructure-components)
6. [Deployment Steps](#6-deployment-steps)
7. [Post-Deployment Configuration](#7-post-deployment-configuration)
8. [Environment Management](#8-environment-management)
9. [Monitoring & Alerts](#9-monitoring--alerts)
10. [Troubleshooting](#10-troubleshooting)
11. [Maintenance](#11-maintenance)
12. [Cost Optimization](#12-cost-optimization)

---

## 1. Prerequisites

### Required Software

- **Node.js**: v22.x or higher
- **npm**: v8.x or higher
- **AWS CLI**: v2.x configured with credentials
- **AWS CDK**: v2.x
- **Git**: For version control

### AWS Account Requirements

- Active AWS account with administrative access
- AWS CLI configured with appropriate credentials
- Sufficient service quotas for:
  - Lambda functions (minimum 10)
  - API Gateway (1 REST API)
  - DynamoDB tables (1)
  - S3 buckets (2-3)
  - CloudFront distributions (1)

### Installation

```bash
# Install AWS CDK globally
npm install -g aws-cdk

# Verify installation
cdk --version

# Configure AWS credentials (if not already done)
aws configure

# Verify AWS credentials
aws sts get-caller-identity
```

---

## 2. Project Structure

```
passvault/
├── shared/                       # Contract layer (types, configs, constants)
│   ├── src/
│   │   ├── types/                # EnvironmentConfig, User, Auth, Admin, Vault, Challenge, Api types
│   │   ├── config/               # Environment configs, password policy, crypto params
│   │   ├── constants.ts          # API paths, PoW config, passkey config, error messages, limits
│   │   └── index.ts              # Barrel export
│   ├── package.json
│   └── tsconfig.json
├── cdk/                          # CDK infrastructure code
│   ├── bin/
│   │   └── passvault.ts          # CDK app entry point
│   ├── lib/
│   │   ├── passvault-stack.ts    # Main stack definition
│   │   ├── kill-switch-handler.ts        # Lambda handler: SNS → set Lambda concurrency to 0
│   │   ├── kill-switch-reenable-handler.ts # Lambda handler: EventBridge → restore concurrency
│   │   └── constructs/
│   │       ├── storage.ts        # DynamoDB + 2 S3 buckets
│   │       ├── backend.ts        # 5 Lambdas + API Gateway + IAM
│   │       ├── frontend.ts       # CloudFront + S3 static hosting
│   │       ├── monitoring.ts     # CloudWatch dashboards + alarms + SNS (prod only)
│   │       └── kill-switch.ts    # Kill switch + re-enable Lambdas + EventBridge Scheduler (prod only)
│   ├── package.json
│   ├── tsconfig.json
│   └── cdk.json
├── backend/                      # Lambda function code
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── auth.ts           # POST /auth/login, change-password, passkey/*
│   │   │   ├── admin.ts          # POST /admin/login, change-password, passkey/*, users; GET /admin/users
│   │   │   ├── vault.ts          # GET/PUT /vault, GET /vault/download
│   │   │   ├── challenge.ts      # GET /challenge
│   │   │   └── health.ts         # GET /health
│   │   ├── services/
│   │   │   ├── auth.ts           # login(), changePassword()
│   │   │   ├── admin.ts          # adminLogin(), createUserInvitation(), listUsers()
│   │   │   ├── passkey.ts        # challenge JWTs, passkey tokens, WebAuthn verify/register
│   │   │   ├── vault.ts          # getVault(), putVault(), downloadVault()
│   │   │   └── challenge.ts      # generateChallenge(), validateSolution()
│   │   ├── middleware/
│   │   │   ├── auth.ts           # JWT extraction + validation
│   │   │   ├── pow.ts            # Proof of Work validation
│   │   │   └── honeypot.ts       # Hidden field bot detection
│   │   ├── utils/
│   │   │   ├── crypto.ts         # bcrypt hash/verify, OTP generation, salt generation
│   │   │   ├── password.ts       # Password policy validation (calls shared)
│   │   │   ├── jwt.ts            # signToken(), verifyToken()
│   │   │   ├── s3.ts             # getVaultFile(), putVaultFile(), getAdminPassword()
│   │   │   ├── dynamodb.ts       # getUserByUsername(), getUserById(), createUser(), updateUser()
│   │   │   └── response.ts       # success(), error() Lambda response builders
│   │   └── config.ts             # Loads EnvironmentConfig from ENVIRONMENT env var
│   ├── build.mjs                 # esbuild bundling script
│   ├── package.json
│   └── tsconfig.json
├── frontend/                     # React application (pending implementation)
│   ├── src/
│   │   ├── services/             # crypto, api, pow-solver, honeypot
│   │   ├── context/              # AuthContext, EncryptionContext
│   │   ├── hooks/                # useAuth, useEncryption, useAutoLogout, useVault, useAdmin
│   │   ├── components/           # auth/, vault/, admin/, layout/
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── package.json
│   └── tsconfig.json
├── package.json                  # Root monorepo (npm workspaces)
├── tsconfig.base.json
├── SPECIFICATION.md              # Complete technical specification
├── IMPLEMENTATION.md             # 8-step build plan
├── DEPLOYMENT.md                 # This file
├── RECOVERY.md                   # File recovery manual
├── COSTS.md                      # Cost analysis and projections
├── LICENSE                       # MIT License
└── README.md                     # Project overview
```

---

## 3. Initial Setup

### Clone and Install

```bash
# Clone the repository (or create new project)
git clone <repository-url>
cd passvault

# Install all dependencies (monorepo — npm workspaces)
npm install

# Build shared types and Lambda bundles
# shared/ must be compiled before backend/ can import from @passvault/shared.
# backend/ must be bundled (esbuild → dist/) before CDK can package the Lambda functions.
# Run from the repo root — workspace flag ensures correct build order.
npm run build -w shared -w backend
```

> **Note:** The frontend is built separately in [Step 5](#step-5-build-and-deploy-frontend), after infrastructure is deployed and the API URL is known.

### CDK Bootstrap

Bootstrap AWS CDK in your account (one-time setup per AWS account/region):

```bash
cd cdk

# Bootstrap for the primary region
cdk bootstrap aws://ACCOUNT-ID/eu-central-1

# If using a custom domain (see Section 6, Step 3), also bootstrap us-east-1.
# The CertificateStack (ACM certificate for CloudFront) must be deployed there.
cdk bootstrap aws://ACCOUNT-ID/us-east-1
```

---

## 4. CDK Stack Architecture

### Main Stack Components

The deployment uses one or two CloudFormation stacks depending on whether a custom domain is provided:

**`CertificateStack`** (optional, deployed to `us-east-1`):
- Created only when `--context domain=...` is provided and `cloudFrontEnabled` is true
- Looks up the existing Route 53 hosted zone and issues an ACM certificate via DNS validation
- CloudFront requires certificates in us-east-1 regardless of the primary region

**`PassVaultStack`** (always, deployed to the primary region):
1. **StorageConstruct**: DynamoDB table and S3 buckets (PITR/versioning: prod only)
2. **BackendConstruct**: Lambda functions and API Gateway (memory/timeout from config)
3. **FrontendConstruct**: CloudFront distribution, S3 static hosting, optional Route 53 alias record
4. **MonitoringConstruct**: CloudWatch alarms, dashboards, and SNS alert topic (**prod only**)
5. **KillSwitchConstruct**: Kill switch + re-enable Lambdas + EventBridge Scheduler (**prod only**, requires monitoring)

### Stack Dependencies

```
CertificateStack (us-east-1, optional)
       ↓
StorageConstruct
       ↓
BackendConstruct
       ↓
FrontendConstruct   MonitoringConstruct
                         ↓
                   KillSwitchConstruct
```

---

## 5. Infrastructure Components

### 5.1 DynamoDB Table

**Table Name:** `passvault-users-{environment}`

**Schema:**
```typescript
{
  partitionKey: { name: 'userId', type: AttributeType.STRING },
  globalSecondaryIndexes: [
    {
      indexName: 'username-index',
      partitionKey: { name: 'username', type: AttributeType.STRING }
    }
  ],
  billingMode: BillingMode.PAY_PER_REQUEST,  // On-demand pricing
  encryption: TableEncryption.AWS_MANAGED,   // Encryption at rest
  pointInTimeRecovery: true,                 // Prod only (disabled in dev/beta)
  removalPolicy: RemovalPolicy.RETAIN        // Don't delete on stack destroy
}
```

### 5.2 S3 Buckets

**User Files Bucket:** `passvault-files-{environment}-{random}`
- Encrypted user vault files (`.enc` objects, one per user)
- Versioning enabled (prod only; disabled in dev/beta)
- Block all public access

**Frontend Bucket:** `passvault-frontend-{environment}-{random}`
- Static React build artifacts
- CloudFront origin
- Block public access (CloudFront OAI only)

### 5.3 Lambda Functions

All Lambda functions use **ARM_64 (Graviton)** architecture for ~20% cost savings.

**JWT Secret:** The auth, admin, and vault functions receive the SSM parameter *name* (`/passvault/{env}/jwt-secret`) as a `JWT_SECRET_PARAM` environment variable. At cold-start, each function calls the SSM API to fetch and decrypt the value. The secret is cached in memory for the lifetime of the Lambda container. See [Step 0](#step-0-create-jwt-secret-in-ssm-parameter-store) for how to create this parameter before deploying.

**Reserved concurrency (prod only):** Each function has a `reservedConcurrentExecutions` cap in prod to limit blast radius. This setting is omitted in dev/beta — new AWS accounts can have a total Lambda concurrency quota as low as 10, and AWS requires at least 10 unreserved executions to remain in the account pool at all times, so reserving any slots would cause the deployment to fail.

**Challenge Function:** `passvault-challenge-{env}`
- Runtime: Node.js 22.x (ARM64)
- Memory: 256 MB (all environments)
- Timeout: 5 seconds
- Reserved concurrency: 5 (prod only)
- Handler: `challenge.handler`
- Purpose: Generate PoW challenges

**Auth Function:** `passvault-auth-{env}`
- Runtime: Node.js 22.x (ARM64)
- Memory: 256 MB (dev/beta) / 512 MB (prod)
- Timeout: 10 seconds
- Reserved concurrency: 3 (prod only)
- Handler: `auth.handler`
- Purpose: Login, password change, passkey challenge/verify/register

**Admin Function:** `passvault-admin-{env}`
- Runtime: Node.js 22.x (ARM64)
- Memory: 256 MB (dev/beta) / 512 MB (prod)
- Timeout: 10 seconds
- Reserved concurrency: 2 (prod only)
- Handler: `admin.handler`
- Purpose: User creation, admin management

**Vault Function:** `passvault-vault-{env}`
- Runtime: Node.js 22.x (ARM64)
- Memory: 256 MB (dev/beta) / 512 MB (prod)
- Timeout: 15 seconds
- Reserved concurrency: 5 (prod only)
- Handler: `vault.handler`
- Purpose: File read/write operations

**Health Function:** `passvault-health-{env}`
- Runtime: Node.js 22.x (ARM64)
- Memory: 128 MB (all environments)
- Timeout: 5 seconds
- Reserved concurrency: 2 (prod only)
- Handler: `health.handler`
- Purpose: Health check endpoint

**Kill Switch Function:** `passvault-kill-switch-{env}` (prod only)
- Runtime: Node.js 22.x (ARM64)
- Memory: 128 MB
- Timeout: 30 seconds
- Trigger: SNS (subscribed to alert topic)
- Purpose: Sets all Lambda concurrency to 0 on sustained-traffic alarm; schedules re-enable via EventBridge Scheduler in 4 hours

**Re-enable Function:** `passvault-kill-switch-reenable-{env}` (prod only)
- Runtime: Node.js 22.x (ARM64)
- Memory: 128 MB
- Timeout: 30 seconds
- Trigger: EventBridge Scheduler (one-time, 4 hours after kill switch fires)
- Purpose: Restores original Lambda reserved concurrency (challenge=5, auth=3, admin=2, vault=5, health=2)

> **Log Groups**: All Lambda functions use explicit `logs.LogGroup` constructs with `removalPolicy: DESTROY`. Log groups are named `/aws/lambda/{function-name}` and are deleted when the stack is destroyed.

### 5.4 API Gateway

**API Name:** `passvault-api-{environment}`

**Configuration:**
- Type: REST API
- Endpoint: Regional
- CORS: Enabled for frontend domain
- Throttling (configurable per environment in `shared/src/config/environments.ts`):
  - Burst: 20 requests/second (default for all environments)
  - Rate: 10 requests/second (default for all environments)
- Stages: `dev`, `beta`, `prod`

**Endpoints:**
```
GET  /api/challenge          → Challenge Lambda
GET  /api/health             → Health check Lambda

POST /api/auth/login         → Auth Lambda
POST /api/auth/change-password → Auth Lambda
GET  /api/auth/passkey/challenge          → Auth Lambda
POST /api/auth/passkey/verify             → Auth Lambda
GET  /api/auth/passkey/register/challenge → Auth Lambda
POST /api/auth/passkey/register           → Auth Lambda

POST /api/admin/login        → Admin Lambda
POST /api/admin/change-password → Admin Lambda
GET  /api/admin/passkey/challenge          → Admin Lambda
POST /api/admin/passkey/verify             → Admin Lambda
GET  /api/admin/passkey/register/challenge → Admin Lambda
POST /api/admin/passkey/register           → Admin Lambda
POST /api/admin/users        → Admin Lambda
GET  /api/admin/users        → Admin Lambda

GET  /api/vault              → Vault Lambda
PUT  /api/vault              → Vault Lambda
GET  /api/vault/download     → Vault Lambda
```

### 5.5 CloudFront Flat-Rate Plan (Bot Protection) {#cloudfront-flat-rate-plan}

PassVault uses the **CloudFront Flat-Rate Pricing Plan** (Free tier) for edge-level protection. This is configured outside CDK — enroll the distribution after the first deployment.

**What's included (Free tier, $0/month):**
- AWS-managed WAF with bot control rules
- DDoS protection (Shield Standard)
- Bot management and analytics
- Included in the Free tier: 1M requests/month + 100GB data transfer

**Blocked attacks do not count against your monthly allowance.**

**One-time enrollment (after first `cdk deploy`):**
1. Open the [AWS CloudFront console](https://console.aws.amazon.com/cloudfront/)
2. Select the `passvault-cdn-prod` distribution
3. Navigate to **Security** → **Pricing plan**
4. Choose **Flat-Rate Plan** → select **Free**
5. Accept the plan terms

For full details on all defense layers and worst-case attack cost analysis, see [BOTPROTECTION.md](BOTPROTECTION.md).

### 5.6 CloudFront Distribution

**Distribution Name:** `passvault-cdn-{environment}`

**Configuration:**
- Origin: S3 frontend bucket (OAI)
- Origin fallback: API Gateway (custom domain)
- Price class: PriceClass_100 (US, Canada, Europe)
- SSL/TLS: TLS 1.2 minimum
- HTTP/2 and HTTP/3 enabled
- Compression: Enabled (gzip, brotli)
- Default root object: `index.html`
- SPA routing: A CloudFront Function (`passvault-spa-{env}`) on the default behavior rewrites all paths without a file extension to `/index.html`, so React Router routes (`/admin/login`, `/vault`, etc.) are served correctly. API paths (`/api/*`) are matched by the more-specific behavior first and never reach this function.

**Custom domain (optional):** When `--context domain=example.com` is provided, the distribution is configured with a custom subdomain and an ACM certificate. Subdomains per environment:

| Environment | URL |
|---|---|
| prod | `pv.example.com` |
| beta | `beta.pv.example.com` |
| dev | `dev.pv.example.com` (CloudFront disabled by default) |

A Route 53 alias A record is created automatically and **deleted on `cdk destroy`**.

**Behaviors:**
- Default (`*`) → S3 bucket (frontend); SPA function rewrites extensionless paths to `/index.html`
- `/api/*` → API Gateway (all methods, no cache); covers all backend endpoints
- Cache policies:
  - Static assets: Optimized (long TTL, immutable)
  - API responses (`/api/*`): No cache (CacheDisabled)

---

## 6. Deployment Steps

> **Working directory:** All `cdk` commands must be run from the `cdk/` subdirectory. `cdk.json` (which tells CDK how to find the app entry point) lives there. Running `cdk` from the repo root will fail with `--app is required`.
> ```bash
> cd cdk   # do this once before running any cdk command
> ```

### CDK Context Variables Reference

All `cdk` commands accept context variables via `--context key=value`:

| Variable | Required | Applies to | Description |
|---|---|---|---|
| `env` | **Yes** | All commands | Deployment environment. Must be `dev`, `beta`, or `prod`. Selects the environment config from `shared/src/config/environments.ts` and names the CloudFormation stack (`PassVault-Dev`, `PassVault-Beta`, `PassVault-Prod`). |
| `domain` | No | All commands | Root domain name of an existing Route 53 hosted zone (e.g. `example.com`). When provided and `cloudFrontEnabled` is true for the selected environment, CDK creates a `CertificateStack` in `us-east-1` and configures CloudFront with a custom subdomain (`pv.example.com` for prod, `beta.pv.example.com` for beta, `dev.pv.example.com` for dev). Omit to use the auto-generated CloudFront URL. |
| `alertEmail` | No | `env=prod` only | Email address to subscribe to the SNS alert topic. Receives traffic spike alarms and daily cost alerts. After deploy, AWS sends a confirmation email — the subscription is inactive until the link is clicked. Has no effect in dev or beta (no SNS topic is created). |
| `passkeyRpId` | `env=prod` | `env=prod` | WebAuthn relying party ID — the domain users will authenticate from (e.g. `vault.example.com`). Required when `passkeyRequired=true`. Can also be set via the `PASSKEY_RP_ID` environment variable before running `cdk deploy`. |
| `passkeyOrigin` | `env=prod` | `env=prod` | WebAuthn relying party origin — the full origin URL (e.g. `https://vault.example.com`). Required when `passkeyRequired=true`. Can also be set via `PASSKEY_ORIGIN` environment variable. |

**Minimal (dev):**
```bash
cdk deploy PassVault-Dev --context env=dev
```

**With custom domain (beta):**

When `domain` is provided and `cloudFrontEnabled` is `true` (beta and prod), CDK synthesises **two stacks**: a `CertificateStack` in `us-east-1` (CloudFront requires ACM certificates there) and the main `PassVaultStack` in `eu-central-1`. Both must be deployed together. Use `--all` or name both stacks explicitly:

```bash
# Recommended — CDK resolves the dependency order automatically
cdk deploy --all --context env=beta --context domain=example.com

# Equivalent explicit form
cdk deploy PassVault-Beta-Cert PassVault-Beta --context env=beta --context domain=example.com
```

**Full production:**
```bash
cdk deploy --all \
  --context env=prod \
  --context domain=example.com \
  --context alertEmail=you@example.com \
  --context passkeyRpId=vault.example.com \
  --context passkeyOrigin=https://vault.example.com
```

---

### Step 0: Create JWT Secret in SSM Parameter Store

The CDK stack references a pre-existing SSM SecureString parameter for the JWT signing key. This must be created **once per environment** before the first `cdk deploy`. It is never managed by CloudFormation — creating it manually ensures the secret is not exposed in the CloudFormation template or CDK Cloud Assembly.

> **Region:** All stacks deploy to `eu-central-1`. The `--region eu-central-1` flag is required unless `eu-central-1` is already your AWS CLI default region. The Lambda will fail to fetch the secret at cold-start if the parameter is in the wrong region.

```bash
# Dev
aws ssm put-parameter \
  --name /passvault/dev/jwt-secret \
  --value "$(openssl rand -hex 32)" \
  --type SecureString \
  --region eu-central-1

# Beta
aws ssm put-parameter \
  --name /passvault/beta/jwt-secret \
  --value "$(openssl rand -hex 32)" \
  --type SecureString \
  --region eu-central-1

# Prod
aws ssm put-parameter \
  --name /passvault/prod/jwt-secret \
  --value "$(openssl rand -hex 32)" \
  --type SecureString \
  --region eu-central-1
```

On success, each command prints `{"Version": 1, "Tier": "Standard"}`. Any other output (or an error) means the parameter was not created.

> **Important:** Run this command only once per environment. The `put-parameter` command without `--overwrite` will fail if the parameter already exists, which prevents accidental secret rotation. All existing user sessions would be invalidated if the secret changes.

**Verify via AWS CLI** (confirms existence without revealing the value):
```bash
aws ssm get-parameter \
  --name /passvault/dev/jwt-secret \
  --region eu-central-1 \
  --query "Parameter.{Name:Name,Type:Type,Version:Version}"
```
Expected output:
```json
{
    "Name": "/passvault/dev/jwt-secret",
    "Type": "SecureString",
    "Version": 1
}
```

**Verify via AWS Console:**
1. Open **AWS Console** → set region to **EU (Frankfurt) `eu-central-1`**
2. Navigate to **Systems Manager** → **Parameter Store**
3. In the search box, enter `/passvault/` and press Enter
4. You should see your parameter(s) listed with type **SecureString** and a KMS key ID
5. Click a parameter name to view its details (ARN, last modified date, description)
6. The value is intentionally hidden — click **Show** only if you need to confirm it (requires `kms:Decrypt` permission on the default AWS-managed key)

### Step 1: Configure Environment

All environment configs are defined in `shared/src/config/environments.ts`. The file exports dev, beta, and prod configurations:

```typescript
// shared/src/config/environments.ts (excerpt — prod config)
export const prodConfig: EnvironmentConfig = {
  stackName: 'PassVault-Prod',
  environment: 'prod',
  region: 'eu-central-1',
  adminUsername: 'admin',

  features: {
    passkeyRequired: true,   // Mandatory in prod
    powEnabled: true,
    honeypotEnabled: true,
    cloudFrontEnabled: true,
  },

  session: {
    viewModeTimeoutSeconds: 60,
    editModeTimeoutSeconds: 120,
    adminTokenExpiryHours: 8,
    userTokenExpiryMinutes: 5,
  },

  lambda: { memorySize: 512, timeout: 15 },
  monitoring: { logRetentionDays: 30, costAlertThreshold: 20 },
  throttle: { rateLimit: 10, burstLimit: 20 },
};

// Dev and beta configs override specific values:
// - features.passkeyRequired = false
// - Relaxed session timeouts (5min view, 10min edit)
// - Smaller Lambda memory (256 MB)
// Throttle limits (rateLimit/burstLimit) are configurable per environment.
```

### Step 2: Synthesize CDK Stack

> **Prerequisite:** `backend/dist/` must exist before synthesizing. If you haven't built yet, run `npm run build -w shared -w backend` from the repo root first.

```bash
# Synthesize CloudFormation template (--context env is required)
cdk synth --context env=dev

# Review the generated CloudFormation template
# The file is named after the stack, e.g. PassVault-Dev.template.json
cat cdk.out/PassVault-Dev.template.json

# Check for any issues
cdk doctor
```

### Step 3: Deploy Infrastructure

**Without custom domain:**
```bash
cdk deploy PassVault-Dev --context env=dev
cdk deploy PassVault-Beta --context env=beta
cdk deploy PassVault-Prod --context env=prod --context alertEmail=you@example.com --require-approval broadening
```

**With custom domain** (requires an existing Route 53 hosted zone for the domain):

Providing `--context domain=...` when `cloudFrontEnabled` is `true` causes CDK to synthesise a second stack — `{StackName}-Cert` — deployed to `us-east-1` to hold the ACM certificate (CloudFront requires certificates in that region). **Both stacks must be deployed.** Use `--all` so CDK handles the dependency order automatically:

```bash
# Beta with custom domain — deploys PassVault-Beta-Cert (us-east-1) then PassVault-Beta (eu-central-1)
cdk deploy --all --context env=beta --context domain=example.com

# Prod with custom domain — deploys PassVault-Prod-Cert (us-east-1) then PassVault-Prod (eu-central-1)
cdk deploy --all \
  --context env=prod \
  --context domain=example.com \
  --context alertEmail=you@example.com \
  --require-approval broadening
```

If you name a single stack (e.g. `cdk deploy PassVault-Beta`) when a domain is provided, the cert stack is silently skipped and the deployment will fail or produce a distribution without a custom domain.

> **Note:** CDK performs a Route 53 hosted zone lookup during synthesis. AWS credentials must have `route53:ListHostedZonesByName` permission, and the hosted zone for the domain must already exist.

**Expected output (prod with custom domain):**
```
✅ PassVault-Prod-Cert
✅ PassVault-Prod

Outputs:
PassVault-Prod.ApiUrl = https://abc123.execute-api.eu-central-1.amazonaws.com/prod
PassVault-Prod.CloudFrontUrl = https://d1234567890.cloudfront.net
PassVault-Prod.AlertTopicArn = arn:aws:sns:eu-central-1:123456789012:passvault-prod-alerts
```

The application will be accessible at `https://pv.example.com` once DNS propagates (~1-2 minutes).

**Deployment time:** ~15-20 minutes for first prod deployment (ACM DNS validation adds ~5 minutes when using a custom domain), ~5-10 minutes for dev/beta.

### Step 4: Initialize Admin Account

After infrastructure deployment, initialize the admin account:

```bash
# Run from the repo root. ENVIRONMENT selects the config (admin username, region, table name).
ENVIRONMENT=prod npx tsx scripts/init-admin.ts

# If your AWS CLI default profile lacks access, export AWS_PROFILE first:
AWS_PROFILE=my-profile ENVIRONMENT=prod npx tsx scripts/init-admin.ts
```

The script:
1. Checks whether the admin user already exists (exits with an error if it does)
2. Creates the admin user in DynamoDB with `status="pending_first_login"`
3. Generates a secure random one-time password (16+ characters)
4. Prints the OTP to the console — it is **not** stored anywhere

```
✓ Admin user created successfully.

  Username          : admin
  One-time password : Xy9$mK2#pL4&nQ8@rT6

Use these credentials to log in at /admin/login.
You will be prompted to set a new password on first login.
```

> **Save the one-time password** before closing the terminal — it cannot be recovered. If lost, delete the admin item from DynamoDB and re-run the script.

> **Dev stack note:** `scripts/dev-ui.sh` runs `init-admin.ts` automatically on first launch if the admin account is absent. You do not need to run it manually for dev.

> **Beta stack note:** `scripts/beta-deploy-ui.sh` automates admin initialisation and the full frontend deploy (build → S3 sync → CloudFront invalidation). See [scripts/beta-deploy-ui.sh](scripts/beta-deploy-ui.sh) for usage.

### Step 5: Build and Deploy Frontend

```bash
cd ../frontend

# Configure API endpoint and feature flags (Vite uses VITE_ prefix)
# VITE_API_BASE_URL must be EMPTY for beta/prod — API calls are made as relative paths
# (/api/auth/login, etc.) which CloudFront routes to API Gateway via the /api/* behavior.
# Setting it to the CloudFront or API Gateway URL causes CORS failures when the page
# is served from a custom domain whose Origin doesn't match the Lambda's FRONTEND_ORIGIN.
cat > .env.production << EOF
VITE_ENVIRONMENT=prod
VITE_API_BASE_URL=
VITE_PASSKEY_REQUIRED=true
EOF

# Build production bundle
npm run build

# Deploy to S3
aws s3 sync dist/ s3://passvault-frontend-prod-xyz123/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"

# Wait for invalidation to complete (~2-5 minutes)
```

### Step 6: Verify Deployment

```bash
# Test health endpoint (all API paths are under /api/)
curl https://d1234567890.cloudfront.net/api/health

# Expected response:
# {"success":true,"data":{"status":"ok","environment":"prod","timestamp":"2026-02-17T..."}}

# Test challenge endpoint
curl https://d1234567890.cloudfront.net/api/challenge

# Expected response:
# {"success":true,"data":{"nonce":"...","difficulty":16,"timestamp":1234567890,"ttl":60}}

# Open frontend in browser
open https://d1234567890.cloudfront.net
```

For the complete testing guide — unit tests, type checking, the dev UI testing script, API smoke tests, and the pre-deployment checklist — see **[TESTING.md](TESTING.md)**.

---

## 7. Post-Deployment Configuration

### 7.1 Admin First Login

1. Navigate to CloudFront URL (or API Gateway URL for dev)
2. Click "Admin Login" (or navigate to `/admin/login`)
3. Enter credentials:
   - Username: `admin`
   - Password: (printed to console by `scripts/init-admin.ts`)
4. Change password immediately
5. **Prod only**: Register passkey (biometric/PIN/security key) on the passkey setup page
6. Access admin dashboard

> In dev/beta environments, passkey setup is skipped — admin goes directly to the dashboard after changing the password.

### 7.2 Create User Accounts

From admin dashboard:

1. Enter username for new user
2. Click "Create User"
3. Copy one-time password (shown once)
4. Share credentials with user securely (encrypted email, password manager, etc.)

### 7.3 Monitoring & Kill Switch (Prod Only)

All CloudWatch alarms, the SNS alert topic, and the kill switch are deployed automatically by CDK for the prod stack. No manual CLI setup is needed.

**What is deployed:**
- **SNS topic** `passvault-prod-alerts` — receives all alarm notifications
- **Sustained traffic alarm** — triggers when API Gateway request count is ≥ 550/minute for 3 consecutive minutes (≈ 92% of the 10 req/s steady-state throttle limit); sends ALARM and OK notifications to the SNS topic
- **AWS Budget** — `$5/day` daily cost budget; sends alert to SNS topic at 100% threshold
- **Kill switch Lambda** `passvault-kill-switch-prod` — subscribed to the SNS topic; on ALARM, sets all Lambda concurrency to 0 (API Gateway returns 429) and schedules auto-recovery via EventBridge Scheduler in 4 hours
- **Re-enable Lambda** `passvault-kill-switch-reenable-prod` — invoked by EventBridge Scheduler 4 hours after kill switch fires; restores original Lambda reserved concurrency
- **Email subscription** (optional) — pass `--context alertEmail=you@example.com` during `cdk deploy` to receive email alerts

**Kill switch automatic recovery:** EventBridge Scheduler automatically re-enables Lambda functions 4 hours after the kill switch fires.

**Kill switch manual recovery** (to restore before the 4-hour window):
```bash
aws lambda put-function-concurrency --function-name passvault-challenge-prod --reserved-concurrent-executions 5
aws lambda put-function-concurrency --function-name passvault-auth-prod     --reserved-concurrent-executions 3
aws lambda put-function-concurrency --function-name passvault-admin-prod    --reserved-concurrent-executions 2
aws lambda put-function-concurrency --function-name passvault-vault-prod    --reserved-concurrent-executions 5
aws lambda put-function-concurrency --function-name passvault-health-prod   --reserved-concurrent-executions 2
```

See [BOTPROTECTION.md](BOTPROTECTION.md) for full kill switch details and worst-case cost analysis.

---

## 8. Environment Management

### 8.1 Multiple Environments

Deploy separate, fully isolated stacks for dev, beta, and production:

```bash
# Deploy dev stack (~$0/month, no passkey required)
cdk deploy PassVault-Dev --context env=dev

# Deploy beta stack (~$0/month, no passkey required, with CloudFront)
# --all is required when domain is provided: deploys PassVault-Beta-Cert (us-east-1) + PassVault-Beta
cdk deploy --all --context env=beta --context domain=example.com

# Deploy prod stack (~$0-2/month, full security)
cdk deploy --all --context env=prod --context domain=example.com --require-approval broadening

# Destroy (Route 53 alias record is removed automatically)
cdk destroy --all --context env=prod --context domain=example.com
```

### 8.2 Environment Configuration

All environments are defined in a single file (`shared/src/config/environments.ts`):

```typescript
// Key differences between environments:
//
// Dev:  passkeyRequired=false, powEnabled=false
//       cloudFrontEnabled=false, relaxed timeouts, 256MB Lambda
//
// Beta: passkeyRequired=false, powEnabled=true
//       cloudFrontEnabled=true, relaxed timeouts, 256MB Lambda
//
// Prod: passkeyRequired=true, powEnabled=true
//       cloudFrontEnabled=true, strict timeouts, 512MB Lambda
//
// All envs: throttle.rateLimit=10 req/s, throttle.burstLimit=20 req/s
```

See [SPECIFICATION.md Section 2.5](SPECIFICATION.md) for the full environment comparison table.

---

## 9. Monitoring & Alerts

### 9.1 CloudWatch Dashboards

> **Note**: CloudWatch dashboards, alarms, the SNS alert topic, and the kill switch Lambda are only deployed in the **prod** environment. All environments get explicit `logs.LogGroup` constructs with `removalPolicy: DESTROY` for each Lambda function.

**Main Dashboard:** `passvault-prod-dashboard`

Metrics monitored:
- API Gateway: Request count, latency (p50/p99)
- Lambda: Invocations, errors, duration, throttles
- DynamoDB: Read/write capacity, throttled requests

### 9.2 Log Groups

```bash
# View API Gateway logs
aws logs tail /aws/apigateway/passvault-api-prod --follow

# View Lambda logs
aws logs tail /aws/lambda/passvault-auth-prod --follow
aws logs tail /aws/lambda/passvault-vault-prod --follow

# View kill switch logs
aws logs tail /aws/lambda/passvault-kill-switch-prod --follow
```

### 9.3 Cost Monitoring

```bash
# Check current month costs
aws ce get-cost-and-usage \
  --time-period Start=2026-02-01,End=2026-02-14 \
  --granularity MONTHLY \
  --metrics "BlendedCost" \
  --group-by Type=SERVICE

# Forecast next month
aws ce get-cost-forecast \
  --time-period Start=2026-03-01,End=2026-03-31 \
  --metric BLENDED_COST \
  --granularity MONTHLY
```

---

## 10. Troubleshooting

### Common Issues

#### Issue: CDK Deploy Fails with "Stack already exists"

```bash
# Check existing stacks
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# If stack is stuck, delete and redeploy
cdk destroy --context env=dev
cdk deploy --all --context env=dev
```

#### Issue: Lambda Function Timeout

```bash
# Increase timeout in CDK stack
// lib/constructs/backend.ts
const lambdaTimeout = Duration.seconds(30); // Increase from 15 to 30

# Redeploy
cdk deploy --context env=<env>
```

#### Issue: API Gateway 429 Too Many Requests (Unexpected)

**Cause:** Kill switch active (Lambda concurrency set to 0) or throttle limit hit.

```bash
# Check Lambda concurrency
aws lambda get-function-concurrency --function-name passvault-auth-prod

# If ReservedConcurrentExecutions is 0, kill switch is active.
# Restore manually:
aws lambda put-function-concurrency --function-name passvault-challenge-prod --reserved-concurrent-executions 5
aws lambda put-function-concurrency --function-name passvault-auth-prod     --reserved-concurrent-executions 3
aws lambda put-function-concurrency --function-name passvault-admin-prod    --reserved-concurrent-executions 2
aws lambda put-function-concurrency --function-name passvault-vault-prod    --reserved-concurrent-executions 5
aws lambda put-function-concurrency --function-name passvault-health-prod   --reserved-concurrent-executions 2
```

#### Issue: PoW Challenge Validation Failing

**Cause:** Clock skew between client and server

```bash
# Check Lambda function logs
aws logs tail /aws/lambda/passvault-challenge-prod --follow

# Increase challenge TTL (in challenge.ts)
const TTL = 120; // Increase from 60 to 120 seconds
```

#### Issue: High AWS Costs

```bash
# Identify cost drivers
aws ce get-cost-and-usage \
  --time-period Start=2026-02-01,End=2026-02-14 \
  --granularity DAILY \
  --metrics "BlendedCost" \
  --group-by Type=SERVICE

# Check for bot attacks (high API Gateway request count)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value=passvault-api-prod \
  --start-time 2026-02-13T00:00:00Z \
  --end-time 2026-02-14T00:00:00Z \
  --period 3600 \
  --statistics Sum

# If under attack, ensure CloudFront flat-rate plan is enrolled (see BOTPROTECTION.md)
# The kill switch fires automatically after 3 minutes at sustained throttle limit
```

---

## 11. Maintenance

### 11.1 Updates and Patches

```bash
# Update all dependencies (monorepo — npm workspaces)
npm update

# Check for security vulnerabilities
npm audit
npm audit fix
```

### 11.2 Backup Strategy

**Automated Backups (Prod Only):**
- DynamoDB: Point-in-time recovery (prod only; disabled in dev/beta)
- S3: Versioning enabled on user files bucket (prod only; disabled in dev/beta)

**Manual Backups:**

```bash
# Export DynamoDB table
aws dynamodb export-table-to-point-in-time \
  --table-arn <table-arn> \
  --s3-bucket passvault-backups \
  --s3-prefix dynamodb-backup-$(date +%Y%m%d) \
  --export-format DYNAMODB_JSON

# Sync S3 user files to backup bucket
aws s3 sync s3://passvault-files-prod-xyz123/ \
  s3://passvault-backups/files-backup-$(date +%Y%m%d)/
```

### 11.3 Disaster Recovery

**Recovery Time Objective (RTO):** 2 hours
**Recovery Point Objective (RPO):** 1 hour

**Recovery Steps:**

1. Restore DynamoDB from point-in-time recovery
2. Restore S3 files from versioning or backup
3. Redeploy CDK stack to new region (if needed)
4. Update DNS to point to new CloudFront distribution

---

## 12. Cost Optimization

### 12.1 Dev and Beta Environments

Dev and beta stacks are designed to run at ~$0/month by default:

- **Passkeys**: Disabled (no WebAuthn device needed during development)
- **Lambda memory**: 256 MB (reduced from 512 MB)
- **CloudWatch log retention**: 1 week (dev) / 2 weeks (beta)
- **DynamoDB PITR**: Disabled
- **S3 versioning**: Disabled

These settings are built into the environment configs — no manual tuning needed.

### 12.2 Production Cost Optimization

**Enable S3 Intelligent Tiering:**
```bash
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket passvault-files-prod-xyz123 \
  --id intelligent-tiering \
  --intelligent-tiering-configuration file://intelligent-tiering.json
```

**Optimize Lambda Memory:**
```bash
# Use AWS Lambda Power Tuning tool
# https://github.com/alexcasalboni/aws-lambda-power-tuning

# Run power tuning to find optimal memory size
```

**CloudFront Cost Optimization:**
- Use PriceClass_100 (US, Canada, Europe only)
- Enable compression (reduces data transfer)
- Set appropriate cache TTLs

---

## 13. CI/CD Integration (Optional)

### GitHub Actions Example

```yaml
# .github/workflows/deploy.yml
name: Deploy PassVault

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-central-1

      - name: Install Dependencies
        run: npm ci

      - name: Install CDK
        run: npm install -g aws-cdk

      - name: Deploy Infrastructure
        run: |
          cd cdk
          cdk deploy --all --context env=prod --require-approval never

      - name: Build Frontend
        run: |
          cd frontend
          npm run build

      - name: Deploy Frontend
        run: |
          aws s3 sync frontend/dist/ s3://${{ secrets.FRONTEND_BUCKET }}/ --delete
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_ID }} --paths "/*"
```

---

## Support

For deployment issues:

1. Check [Troubleshooting](#10-troubleshooting) section
2. Review CloudWatch logs
3. Check AWS Service Health Dashboard
4. Open issue on GitHub repository

---

## License

MIT License - See LICENSE file for details
