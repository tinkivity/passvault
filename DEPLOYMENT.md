# PassVault - AWS CDK Deployment Guide

## Overview

This guide provides complete instructions for deploying PassVault to AWS using AWS Cloud Development Kit (CDK). PassVault supports three deployment environments — **dev**, **beta**, and **prod** — each deployed as a fully isolated CloudFormation stack.

**Architecture:**
- Frontend: React SPA hosted on S3 + CloudFront
- Backend: API Gateway + Lambda functions (Node.js)
- Storage: S3 (encrypted files) + DynamoDB (user metadata)
- Security: AWS WAF with Bot Control, TOTP-based 2FA (prod only)
- Encryption: Client-side end-to-end encryption (Argon2id + AES-256-GCM)

**Estimated Monthly Cost:**
- Dev/Beta: ~$0 (no WAF, no TOTP, within AWS free tier)
- Prod: $8-10 for 3-10 users (primarily AWS WAF costs)

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
  - WAF Web ACLs (1)

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
│   │   ├── constants.ts          # API paths, PoW config, TOTP config, error messages, limits
│   │   └── index.ts              # Barrel export
│   ├── package.json
│   └── tsconfig.json
├── cdk/                          # CDK infrastructure code
│   ├── bin/
│   │   └── passvault.ts          # CDK app entry point
│   ├── lib/
│   │   ├── passvault-stack.ts    # Main stack definition
│   │   └── constructs/
│   │       ├── storage.ts        # DynamoDB + 3 S3 buckets
│   │       ├── backend.ts        # 5 Lambdas + API Gateway + IAM
│   │       ├── security.ts       # WAF (prod only)
│   │       ├── frontend.ts       # CloudFront + S3 static hosting
│   │       └── monitoring.ts     # CloudWatch dashboards + alarms (prod only)
│   ├── package.json
│   ├── tsconfig.json
│   └── cdk.json
├── backend/                      # Lambda function code
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── auth.ts           # POST /auth/login, change-password, totp/*
│   │   │   ├── admin.ts          # POST /admin/login, change-password, totp/*, users; GET /admin/users
│   │   │   ├── vault.ts          # GET/PUT /vault, GET /vault/download
│   │   │   ├── challenge.ts      # GET /challenge
│   │   │   └── health.ts         # GET /health
│   │   ├── services/
│   │   │   ├── auth.ts           # login(), changePassword()
│   │   │   ├── admin.ts          # adminLogin(), createUserInvitation(), listUsers()
│   │   │   ├── totp.ts           # generateSecret(), generateQrUri(), verifyCode()
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
```

### CDK Bootstrap

Bootstrap AWS CDK in your account (one-time setup per AWS account/region):

```bash
cd cdk

# Bootstrap for default region
cdk bootstrap aws://ACCOUNT-ID/REGION

# Example:
cdk bootstrap aws://123456789012/us-east-1

# If deploying to multiple regions/accounts
cdk bootstrap aws://ACCOUNT-ID/us-east-1
cdk bootstrap aws://ACCOUNT-ID/eu-west-1
```

---

## 4. CDK Stack Architecture

### Main Stack Components

The PassVault CDK stack (`PassVaultStack`) consists of multiple constructs, some conditional on environment:

1. **StorageConstruct**: DynamoDB tables and S3 buckets (PITR/versioning: prod only)
2. **BackendConstruct**: Lambda functions and API Gateway (memory/timeout from config)
3. **SecurityConstruct**: WAF, IAM roles, and security policies (**prod only** — not deployed in dev/beta)
4. **FrontendConstruct**: CloudFront distribution and S3 static hosting (CloudFront optional in dev)
5. **MonitoringConstruct**: CloudWatch alarms and dashboards (**prod only** — log retention still applied per-function in all environments)

### Stack Dependencies

```
StorageConstruct
       ↓
BackendConstruct → SecurityConstruct
       ↓                ↓
FrontendConstruct ← MonitoringConstruct
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
- Encrypted user vault files
- Versioning enabled (prod only; disabled in dev/beta)
- Block all public access
- Lifecycle policy: None (user files retained indefinitely)

**Config Bucket:** `passvault-config-{environment}-{random}`
- Initial admin password
- Application configuration
- Block all public access
- Lifecycle policy: Delete initial password after 30 days (optional)

**Frontend Bucket:** `passvault-frontend-{environment}-{random}`
- Static React build artifacts
- CloudFront origin
- Block public access (CloudFront OAI only)

### 5.3 Lambda Functions

All Lambda functions use **ARM_64 (Graviton)** architecture for ~20% cost savings.

**Challenge Function:** `passvault-challenge-{env}`
- Runtime: Node.js 22.x (ARM64)
- Memory: 256 MB (all environments)
- Timeout: 5 seconds
- Handler: `challenge.handler`
- Purpose: Generate PoW challenges

**Auth Function:** `passvault-auth-{env}`
- Runtime: Node.js 22.x (ARM64)
- Memory: 256 MB (dev/beta) / 512 MB (prod)
- Timeout: 10 seconds
- Handler: `auth.handler`
- Purpose: Login, password change, TOTP setup/verify

**Admin Function:** `passvault-admin-{env}`
- Runtime: Node.js 22.x (ARM64)
- Memory: 256 MB (dev/beta) / 512 MB (prod)
- Timeout: 10 seconds
- Handler: `admin.handler`
- Purpose: User creation, admin management

**Vault Function:** `passvault-vault-{env}`
- Runtime: Node.js 22.x (ARM64)
- Memory: 256 MB (dev/beta) / 512 MB (prod)
- Timeout: 15 seconds
- Handler: `vault.handler`
- Purpose: File read/write operations

**Health Function:** `passvault-health-{env}`
- Runtime: Node.js 22.x (ARM64)
- Memory: 128 MB (all environments)
- Timeout: 5 seconds
- Handler: `health.handler`
- Purpose: Health check endpoint

### 5.4 API Gateway

**API Name:** `passvault-api-{environment}`

**Configuration:**
- Type: REST API
- Endpoint: Regional
- CORS: Enabled for frontend domain
- Throttling:
  - Burst: 20 requests/second
  - Rate: 10 requests/second
- Usage Plans:
  - Free tier: Default (no API key required)
  - Admin tier: Higher limits
- Stages: `dev`, `beta`, `prod`

**Endpoints:**
```
GET  /challenge          → Challenge Lambda
GET  /health             → Health check Lambda

POST /auth/login         → Auth Lambda
POST /auth/change-password → Auth Lambda
POST /auth/totp/setup    → Auth Lambda
POST /auth/totp/verify   → Auth Lambda

POST /admin/login        → Admin Lambda
POST /admin/change-password → Admin Lambda
POST /admin/totp/setup   → Admin Lambda
POST /admin/totp/verify  → Admin Lambda
POST /admin/users        → Admin Lambda
GET  /admin/users        → Admin Lambda

GET  /vault              → Vault Lambda
PUT  /vault              → Vault Lambda
GET  /vault/download     → Vault Lambda
```

### 5.5 AWS WAF (Prod Only)

**Web ACL Name:** `passvault-waf-prod`

> **Note**: WAF is only deployed in the prod environment. Dev and beta stacks do not include WAF to save costs (~$8/month).

**Attached to:** CloudFront distribution

**Rules (in order):**
1. **AWS Managed - Bot Control** (Priority: 1)
   - Detects and blocks common bots
   - Challenge suspected bots with CAPTCHA

2. **AWS Managed - Known Bad Inputs** (Priority: 2)
   - Blocks SQL injection, XSS attempts
   - Protects against OWASP Top 10

3. **Rate Limiting Rule** (Priority: 3)
   - Limit: 100 requests per 5 minutes per IP
   - Action: Block for 1 hour

4. **Geographic Restriction** (Priority: 4, Optional)
   - Allow/block specific countries
   - Configure based on requirements

**CAPTCHA Configuration:**
- Immunity time: 300 seconds (5 minutes)
- Challenge action for suspected bots
- Silent challenge (invisible to most users)

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
- Error pages:
  - 404 → /index.html (for SPA routing)
  - 403 → /index.html

**Behaviors:**
- Default (`*`) → S3 bucket (frontend)
- `/challenge`, `/health` → API Gateway (GET only)
- `/auth/*`, `/admin/*`, `/vault/*`, `/vault` → API Gateway (backend)
- Cache policies:
  - Static assets: 1 year
  - API responses: No cache (CacheDisabled)
  - HTML: 5 minutes

---

## 6. Deployment Steps

### Step 1: Configure Environment

All environment configs are defined in `shared/src/config/environments.ts`. The file exports dev, beta, and prod configurations:

```typescript
// shared/src/config/environments.ts (excerpt — prod config)
export const prodConfig: EnvironmentConfig = {
  stackName: 'PassVault-Prod',
  environment: 'prod',
  region: 'us-east-1',
  adminUsername: 'admin',

  features: {
    totpRequired: true,      // Mandatory in prod
    wafEnabled: true,         // Enabled in prod
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
};

// Dev and beta configs override specific values:
// - features.totpRequired = false
// - features.wafEnabled = false
// - Relaxed session timeouts (5min view, 10min edit)
// - Smaller Lambda memory (256 MB)
```

### Step 2: Synthesize CDK Stack

```bash
# Synthesize CloudFormation template
cdk synth

# Review the generated CloudFormation template
cat cdk.out/PassVaultStack.template.json

# Check for any issues
cdk doctor
```

### Step 3: Deploy Infrastructure

```bash
# Deploy dev stack (no WAF, no TOTP, no CloudFront required)
cdk deploy PassVault-Dev --context env=dev

# Deploy beta stack (no WAF, no TOTP, with CloudFront)
cdk deploy PassVault-Beta --context env=beta

# Deploy prod stack (full security — WAF, TOTP, CloudFront)
cdk deploy PassVault-Prod --context env=prod --require-approval broadening

# Deploy all stacks
cdk deploy --all

# Deploy with progress output
cdk deploy PassVault-Prod --context env=prod --progress events

# Expected output (prod example):
# ✅ PassVault-Prod
#
# Outputs:
# PassVault-Prod.ApiEndpoint = https://abc123.execute-api.us-east-1.amazonaws.com/prod
# PassVault-Prod.CloudFrontURL = https://d1234567890.cloudfront.net
# PassVault-Prod.ConfigBucket = passvault-config-prod-xyz123
# PassVault-Prod.AdminPasswordS3Key = admin-initial-password.txt
```

**Deployment time:** ~15-20 minutes for first prod deployment, ~5-10 minutes for dev/beta (no WAF)

### Step 4: Initialize Admin Account

After infrastructure deployment, initialize the admin account:

```bash
cd ../scripts

# Run admin initialization script
npm run init-admin

# This script will:
# 1. Generate secure random password (16+ characters)
# 2. Create admin user in DynamoDB
# 3. Upload initial password to S3 config bucket
# 4. Display admin credentials

# Example output:
# ✅ Admin account created successfully!
#
# Admin Credentials:
# Username: admin
# Password: Xy9$mK2#pL4&nQ8@rT6
#
# Initial password stored at:
# s3://passvault-config-prod-xyz123/admin-initial-password.txt
#
# ⚠️  Save these credentials securely!
# ⚠️  You must change the password on first login.
```

### Step 5: Build and Deploy Frontend

```bash
cd ../frontend

# Configure API endpoint (Vite uses VITE_ prefix)
cat > .env.production << EOF
VITE_ENVIRONMENT=prod
VITE_API_ENDPOINT=https://abc123.execute-api.us-east-1.amazonaws.com/prod
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
# Test health endpoint (no /api/ prefix — CloudFront routes directly)
curl https://d1234567890.cloudfront.net/health

# Expected response:
# {"success":true,"data":{"status":"ok","environment":"prod","timestamp":"2026-02-17T..."}}

# Test challenge endpoint
curl https://d1234567890.cloudfront.net/challenge

# Expected response:
# {"success":true,"data":{"nonce":"...","difficulty":16,"timestamp":1234567890,"ttl":60}}

# Open frontend in browser
open https://d1234567890.cloudfront.net
```

---

## 7. Post-Deployment Configuration

### 7.1 Admin First Login

1. Navigate to CloudFront URL (or API Gateway URL for dev)
2. Click "Admin Login" (or use `/admin` route)
3. Enter credentials:
   - Username: `admin`
   - Password: (from S3 config bucket)
4. Change password immediately
5. **Prod only**: Set up TOTP (scan QR code with authenticator app)
6. **Prod only**: Verify TOTP code
7. Access admin dashboard

> In dev/beta environments, TOTP setup is skipped — admin goes directly to the dashboard after changing the password.

### 7.2 Create User Accounts

From admin dashboard:

1. Enter username for new user
2. Click "Create User"
3. Copy one-time password (shown once)
4. Share credentials with user securely (encrypted email, password manager, etc.)

### 7.3 CloudWatch Alarms Setup

```bash
# Set up cost alert
aws cloudwatch put-metric-alarm \
  --alarm-name passvault-cost-alert \
  --alarm-description "Alert when monthly costs exceed $20" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold 20 \
  --comparison-operator GreaterThanThreshold

# Set up error rate alert
aws cloudwatch put-metric-alarm \
  --alarm-name passvault-error-rate \
  --alarm-description "Alert when error rate exceeds 5%" \
  --metric-name 5XXError \
  --namespace AWS/ApiGateway \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 0.05 \
  --comparison-operator GreaterThanThreshold
```

### 7.4 WAF Monitoring

```bash
# View WAF blocked requests
aws wafv2 get-sampled-requests \
  --web-acl-arn <web-acl-arn> \
  --rule-metric-name BlockedRequests \
  --scope CLOUDFRONT \
  --time-window StartTime=<start>,EndTime=<end> \
  --max-items 100

# Review WAF logs in CloudWatch
aws logs tail /aws/wafv2/passvault-waf-prod --follow
```

---

## 8. Environment Management

### 8.1 Multiple Environments

Deploy separate, fully isolated stacks for dev, beta, and production:

```bash
# Deploy dev stack (~$0/month, no WAF, no TOTP)
cdk deploy PassVault-Dev --context env=dev

# Deploy beta stack (~$0/month, no WAF, no TOTP, with CloudFront)
cdk deploy PassVault-Beta --context env=beta

# Deploy prod stack (~$8-10/month, full security)
cdk deploy PassVault-Prod --context env=prod --require-approval broadening

# Deploy all stacks at once
cdk deploy --all

# Destroy a specific stack
cdk destroy PassVault-Dev --context env=dev
```

### 8.2 Environment Configuration

All environments are defined in a single file (`shared/src/config/environments.ts`):

```typescript
// Key differences between environments:
//
// Dev:  totpRequired=false, wafEnabled=false, powEnabled=false
//       cloudFrontEnabled=false, relaxed timeouts, 256MB Lambda
//
// Beta: totpRequired=false, wafEnabled=false, powEnabled=true
//       cloudFrontEnabled=true, relaxed timeouts, 256MB Lambda
//
// Prod: totpRequired=true, wafEnabled=true, powEnabled=true
//       cloudFrontEnabled=true, strict timeouts, 512MB Lambda
```

See [SPECIFICATION.md Section 2.5](SPECIFICATION.md) for the full environment comparison table.

---

## 9. Monitoring & Alerts

### 9.1 CloudWatch Dashboards

> **Note**: CloudWatch dashboards and alarms are only deployed in the **prod** environment. All environments still get per-Lambda log retention via the `logRetention` property.

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

# View WAF logs
aws logs tail /aws/wafv2/passvault-waf-prod --follow
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
cdk destroy
cdk deploy --all
```

#### Issue: Lambda Function Timeout

```bash
# Increase timeout in CDK stack
// lib/constructs/backend.ts
const lambdaTimeout = Duration.seconds(30); // Increase from 15 to 30

# Redeploy
cdk deploy
```

#### Issue: API Gateway 403 Forbidden

**Cause:** WAF blocking legitimate requests

```bash
# Temporarily disable WAF
aws wafv2 update-web-acl \
  --id <web-acl-id> \
  --scope CLOUDFRONT \
  --default-action Allow={}

# Check WAF logs for blocked requests
aws logs filter-log-events \
  --log-group-name /aws/wafv2/passvault-waf-prod \
  --filter-pattern "BLOCK"
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

# Check for bot attacks (high request count)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value=passvault-api-prod \
  --start-time 2026-02-13T00:00:00Z \
  --end-time 2026-02-14T00:00:00Z \
  --period 3600 \
  --statistics Sum

# If under attack, enable stricter WAF rules
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

- **WAF**: Disabled (saves $8/month per stack)
- **TOTP**: Disabled (no authenticator app needed during development)
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
          aws-region: us-east-1

      - name: Install Dependencies
        run: npm ci

      - name: Install CDK
        run: npm install -g aws-cdk

      - name: Deploy Infrastructure
        run: |
          cd cdk
          cdk deploy --all --require-approval never

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
