# PassVault -- CDK Deployment Guide

For infrastructure architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).

For post-deploy scripts, see [../scripts/README.md](../scripts/README.md).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Initial Setup](#2-initial-setup)
3. [JWT Secret (SSM Parameter Store)](#3-jwt-secret-ssm-parameter-store)
4. [CDK Context Variables](#4-cdk-context-variables)
5. [Deployment Commands](#5-deployment-commands)
6. [Post-Deployment](#6-post-deployment)
7. [SES Email Setup (Beta/Prod)](#7-ses-email-setup-betaprod)
8. [CloudFront Flat-Rate Plan](#8-cloudfront-flat-rate-plan)
9. [Monitoring and Kill Switch (Prod)](#9-monitoring-and-kill-switch-prod)
10. [Environment Management](#10-environment-management)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

### Required Software

- **Node.js** v22.x or higher
- **npm** v8.x or higher
- **AWS CLI** v2.x configured with credentials
- **AWS CDK** v2.x (`npm install -g aws-cdk`)

### AWS Account Requirements

- Active AWS account with administrative access
- AWS CLI configured (`aws sts get-caller-identity` must succeed)
- Sufficient service quotas:
  - Lambda functions: 10 minimum
  - API Gateway: 1 REST API
  - DynamoDB tables: 6 (users, vaults, passkey-credentials, login-events, audit, config)
  - S3 buckets: 2-3
  - CloudFront distributions: 1

---

## 2. Initial Setup

### Clone and Install

```bash
git clone <repository-url>
cd passvault

# Install all dependencies (monorepo -- npm workspaces)
npm install

# Build shared types and Lambda bundles (order matters)
npm run build -w shared -w backend
```

The frontend is built separately after infrastructure is deployed (see [Section 6](#6-post-deployment)).

### CDK Bootstrap

Bootstrap CDK in your AWS account (one-time per account/region):

```bash
cd cdk

# Primary region
cdk bootstrap aws://ACCOUNT-ID/eu-central-1

# Also bootstrap us-east-1 if using a custom domain
# (CloudFront requires ACM certificates in us-east-1)
cdk bootstrap aws://ACCOUNT-ID/us-east-1
```

---

## 3. JWT Secret (SSM Parameter Store)

The CDK stack references a pre-existing SSM SecureString parameter for the JWT signing key. This must be created **once per environment** before the first `cdk deploy`. Creating it outside CloudFormation ensures the secret never appears in templates or the CDK Cloud Assembly.

```bash
# Create the parameter (replace {env} with dev, beta, or prod)
aws ssm put-parameter \
  --name /passvault/{env}/jwt-secret \
  --value "$(openssl rand -hex 32)" \
  --type SecureString \
  --region eu-central-1
```

On success, the command prints `{"Version": 1, "Tier": "Standard"}`.

**Important:** Without `--overwrite`, the command fails if the parameter already exists. This prevents accidental secret rotation, which would invalidate all active user sessions.

**Verify** (confirms existence without revealing the value):

```bash
aws ssm get-parameter \
  --name /passvault/{env}/jwt-secret \
  --region eu-central-1 \
  --query "Parameter.{Name:Name,Type:Type,Version:Version}"
```

---

## 4. CDK Context Variables

All `cdk` commands accept context variables via `--context key=value`.

| Variable | Required | Applies to | Description |
|---|---|---|---|
| `env` | Yes | All | Deployment environment: `dev`, `beta`, or `prod`. Names the stack `PassVault-Dev`, `PassVault-Beta`, or `PassVault-Prod`. |
| `adminEmail` | Yes | All | Initial admin username. Also subscribes to the SNS alert topic (beta/prod). |
| `domain` | No | beta, prod | Root domain of an existing Route 53 hosted zone (e.g. `example.com`). Creates a `CertificateStack` in us-east-1 and configures CloudFront with a custom subdomain. |
| `passkeyRpId` | Prod only | prod | WebAuthn relying party ID (e.g. `vault.example.com`). Also settable via `PASSKEY_RP_ID` env var. |
| `passkeyOrigin` | Prod only | prod | WebAuthn relying party origin (e.g. `https://vault.example.com`). Also settable via `PASSKEY_ORIGIN` env var. |

### Examples

**Minimal dev:**
```bash
cdk deploy PassVault-Dev --context env=dev --context adminEmail=you@example.com
```

**Beta with custom domain:**
```bash
cdk deploy --all --context env=beta --context domain=example.com --context adminEmail=you@example.com
```

**Full production:**
```bash
cdk deploy --all \
  --context env=prod \
  --context domain=example.com \
  --context adminEmail=you@example.com \
  --context passkeyRpId=vault.example.com \
  --context passkeyOrigin=https://vault.example.com
```

---

## 5. Deployment Commands

All `cdk` commands must be run from the `cdk/` directory. Running from the repo root fails with `--app is required`.

```bash
cd cdk
```

### Without Custom Domain (single stack)

```bash
cdk deploy PassVault-Dev --context env=dev --context adminEmail=you@example.com
cdk deploy PassVault-Beta --context env=beta --context adminEmail=you@example.com
cdk deploy PassVault-Prod --context env=prod --context adminEmail=you@example.com --require-approval broadening
```

### With Custom Domain (two stacks)

When `--context domain=...` is provided and `cloudFrontEnabled` is true (beta/prod), CDK synthesises two stacks:

1. `{StackName}-Cert` in us-east-1 (ACM certificate)
2. `{StackName}` in eu-central-1 (all other resources)

Use `--all` so CDK handles the dependency order automatically:

```bash
# Beta
cdk deploy --all --context env=beta --context domain=example.com --context adminEmail=you@example.com

# Prod
cdk deploy --all \
  --context env=prod \
  --context domain=example.com \
  --context adminEmail=you@example.com \
  --require-approval broadening
```

If you name only the main stack (e.g. `cdk deploy PassVault-Beta`), the cert stack is silently skipped and the deployment will fail or produce a distribution without a custom domain.

### Deployment Times

- First prod deployment: ~15-20 minutes (ACM DNS validation adds ~5 minutes with custom domain)
- Dev/beta: ~5-10 minutes
- Subsequent updates: ~3-5 minutes

---

## 6. Post-Deployment

### 6.1 Initialize Admin Account

```bash
# Run from the repo root
ENVIRONMENT=prod ADMIN_EMAIL=you@example.com npx tsx scripts/init-admin.ts

# With a specific AWS profile:
AWS_PROFILE=my-profile ENVIRONMENT=prod ADMIN_EMAIL=you@example.com npx tsx scripts/init-admin.ts
```

The script creates the admin user with `status=pending_first_login`, generates a one-time password, and prints it to the console. The OTP is not stored anywhere -- save it before closing the terminal. If lost, delete the admin item from DynamoDB and re-run the script.

Note: `scripts/setup.sh` runs `init-admin.ts` automatically if the admin account is absent, so manual initialization is not required when using that script.

### 6.2 Build and Deploy Frontend

**Option A: Using `setup.sh` (recommended)**

```bash
./scripts/setup.sh --env prod --profile my-profile
```

This handles admin initialization, env file generation, build, S3 sync, CloudFront invalidation, and smoke tests in one step. See `./scripts/setup.sh --help` for all options.

**Option B: Manual steps**

```bash
cd frontend

# Write env file (VITE_API_BASE_URL must be EMPTY for beta/prod)
cat > .env.production << EOF
VITE_ENVIRONMENT=prod
VITE_API_BASE_URL=
VITE_PASSKEY_REQUIRED=true
VITE_VIEW_TIMEOUT_SECONDS=60
VITE_EDIT_TIMEOUT_SECONDS=120
VITE_ADMIN_TIMEOUT_SECONDS=480
EOF

npm run build

# Sync to S3 (replace bucket name from stack outputs)
aws s3 sync dist/ s3://FRONTEND_BUCKET_NAME/ \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"

aws s3 cp dist/index.html s3://FRONTEND_BUCKET_NAME/index.html \
  --cache-control "no-cache,no-store,must-revalidate"

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id DISTRIBUTION_ID \
  --paths "/*"
```

### 6.3 Verify Deployment

```bash
# Health check
curl https://YOUR_CLOUDFRONT_URL/api/health
# Expected: {"success":true,"data":{"status":"ok","environment":"prod",...}}

# Challenge endpoint
curl https://YOUR_CLOUDFRONT_URL/api/challenge
# Expected: {"success":true,"data":{"nonce":"...","difficulty":16,...}}
```

### 6.4 Admin First Login

1. Navigate to the CloudFront URL (or API Gateway URL for dev)
2. Go to `/admin/login`
3. Enter the admin email and the one-time password from `init-admin.ts`
4. Change password on first login
5. **Prod only:** Register a passkey (biometric/PIN/security key) on the passkey setup page
6. Access the admin dashboard

In dev/beta, passkey setup is skipped -- admin goes directly to the dashboard after changing the password.

---

## 7. SES Email Setup (Beta/Prod)

PassVault uses Amazon SES for OTP delivery emails and encrypted vault backups. If `SENDER_EMAIL` is not set on the Lambda, email features are silently disabled.

**How it works:**

- CDK sets `SENDER_EMAIL=noreply@{domain}` on the auth, admin, and vault Lambdas when `--context domain=...` is provided (beta/prod).
- The `SesNotifierConstruct` creates an SES email identity for the domain and grants the Lambdas `ses:SendEmail` permission.
- In dev, `SENDER_EMAIL` is not set and email features return appropriate error codes.

### SES Sandbox

New AWS accounts start in the SES sandbox. In sandbox mode, SES only delivers to manually verified addresses -- all other sends are silently rejected.

To send to arbitrary recipients:

1. Open **AWS Console** -> **Amazon SES** -> **Account dashboard**
2. If the banner reads "Your account is in the sandbox", click **Request production access**
3. Select "Transactional", describe low-volume private password vault usage
4. AWS typically approves within 24 hours

For testing while in sandbox: **SES** -> **Verified identities** -> **Create identity** -> **Email address** -> verify the recipient.

### Domain Verification

Domain verification (DKIM) is handled automatically by the `SesNotifierConstruct` via CNAME records in Route 53 when `--context domain=...` is provided. DKIM propagation can take a few minutes -- SES will not send until the identity shows **Verified** in the console.

If not using a custom domain, verify the sender address manually in the SES console.

### Troubleshooting Email (5-step checklist)

1. **Check Lambda logs.** Look for `Sending OTP email to ...`, `OTP email sent to ...`, `Failed to send OTP email`, or `OTP email skipped` messages:
   ```bash
   aws logs tail /aws/lambda/passvault-admin-{env} --since 1h --region eu-central-1
   ```

2. **Check SES sending activity.** In the SES console, check **Email activity** or **Sending statistics**. Zero sends means the Lambda never called SES.

3. **Check sandbox status.** If still in sandbox, unverified recipient addresses are silently dropped.

4. **Check that the Lambda bundle is current.** If `cdk deploy` was run without rebuilding the backend, the running code may predate the email feature. Rebuild and redeploy:
   ```bash
   npm run build -w shared -w backend
   cd cdk && cdk deploy --all --context env={env} --context domain=example.com --context adminEmail=you@example.com
   ```

5. **Check that `SENDER_EMAIL` is set on the Lambda:**
   ```bash
   aws lambda get-function-configuration \
     --function-name passvault-admin-{env} \
     --region eu-central-1 \
     --query 'Environment.Variables.SENDER_EMAIL'
   ```
   If this returns `null`, the CDK deploy was run without `--context domain=...`.

---

## 8. CloudFront Flat-Rate Plan

PassVault uses the CloudFront Flat-Rate Pricing Plan (Free tier) for edge-level bot protection. This is configured outside CDK -- enroll the distribution after the first deployment.

**What's included (Free tier, $0/month):**

- AWS-managed WAF with bot control rules
- DDoS protection (Shield Standard)
- Bot management and analytics
- 1M requests/month + 100GB data transfer included
- Blocked attacks do not count against the monthly allowance

**One-time enrollment (after first `cdk deploy`):**

1. Open the [AWS CloudFront console](https://console.aws.amazon.com/cloudfront/)
2. Select the `passvault-cdn-prod` distribution
3. Navigate to **Security** -> **Pricing plan**
4. Choose **Flat-Rate Plan** -> select **Free**
5. Accept the plan terms

For full details on defense layers and worst-case cost analysis, see [../BOTPROTECTION.md](../BOTPROTECTION.md).

---

## 9. Monitoring and Kill Switch (Prod)

All monitoring resources are deployed automatically by CDK for the prod stack. No manual setup is needed.

### What is Deployed

- **SNS topic** `passvault-prod-alerts` -- receives all alarm notifications
- **Sustained traffic alarm** -- triggers when API Gateway request count >= 550/minute for 3 consecutive minutes; sends ALARM and OK notifications to the SNS topic
- **AWS Budget** -- $5/day daily cost budget; alerts at 100% threshold
- **Kill switch Lambda** `passvault-kill-switch-prod` -- on ALARM, sets all Lambda concurrency to 0 (API Gateway returns 429) and schedules auto-recovery via EventBridge Scheduler in 4 hours
- **Re-enable Lambda** `passvault-kill-switch-reenable-prod` -- invoked by EventBridge Scheduler; restores original Lambda reserved concurrency
- **Email subscription** -- `--context adminEmail=...` subscribes to the alert topic; AWS sends a confirmation email that must be clicked

### Kill Switch Manual Recovery

To restore service before the 4-hour auto-recovery window:

```bash
aws lambda put-function-concurrency --function-name passvault-challenge-prod --reserved-concurrent-executions 5
aws lambda put-function-concurrency --function-name passvault-auth-prod     --reserved-concurrent-executions 3
aws lambda put-function-concurrency --function-name passvault-admin-prod    --reserved-concurrent-executions 2
aws lambda put-function-concurrency --function-name passvault-vault-prod    --reserved-concurrent-executions 5
aws lambda put-function-concurrency --function-name passvault-health-prod   --reserved-concurrent-executions 2
```

To check if the kill switch is active:

```bash
aws lambda get-function-concurrency --function-name passvault-auth-prod
# If ReservedConcurrentExecutions is 0, the kill switch is active
```

For full kill switch details, see [../BOTPROTECTION.md](../BOTPROTECTION.md).

---

## 10. Environment Management

### Deploy Commands

```bash
cd cdk

# Dev (no CloudFront, no passkeys, ~$0/month)
cdk deploy PassVault-Dev --context env=dev --context adminEmail=you@example.com

# Beta (CloudFront enabled, no passkeys, ~$0/month)
cdk deploy --all --context env=beta --context domain=example.com --context adminEmail=you@example.com

# Prod (CloudFront, passkeys, monitoring, kill switch, ~$0-2/month)
cdk deploy --all \
  --context env=prod \
  --context domain=example.com \
  --context adminEmail=you@example.com \
  --context passkeyRpId=vault.example.com \
  --context passkeyOrigin=https://vault.example.com \
  --require-approval broadening
```

### Destroy Commands

```bash
# Without custom domain
cdk destroy PassVault-Dev --context env=dev

# With custom domain (destroys both stacks; Route 53 alias record is removed automatically)
cdk destroy --all --context env=beta --context domain=example.com
cdk destroy --all --context env=prod --context domain=example.com
```

### Key Config Differences

| Setting | Dev | Beta | Prod |
|---|---|---|---|
| Passkeys | Disabled | Disabled | Required |
| PoW | Disabled | Enabled | Enabled |
| CloudFront | Disabled | Enabled | Enabled |
| Lambda memory | 256 MB | 256 MB | 512 MB |
| Reserved concurrency | None | None | Yes (per-function) |
| DynamoDB PITR | Disabled | Disabled | Enabled |
| S3 versioning | Disabled | Disabled | Enabled |
| Monitoring/Kill switch | None | Kill switch only | Full (alarms + budget + kill switch) |
| Log retention | 1 week | 2 weeks | 30 days |
| Throttle (all envs) | 20 burst / 10 rate | 20 burst / 10 rate | 20 burst / 10 rate |

All environment configs are defined in `shared/src/config/environments.ts`.

---

## 11. Troubleshooting

### Backend Not Built

**Symptom:** `cdk synth` or `cdk deploy` fails because Lambda handler code is missing.

**Fix:** Build shared and backend before deploying:
```bash
npm run build -w shared -w backend
```

### Wrong Region for SSM Parameter

**Symptom:** Lambda fails at cold-start with an error fetching the JWT secret.

**Fix:** The SSM parameter must be in `eu-central-1` (the same region as the Lambda). Verify:
```bash
aws ssm get-parameter --name /passvault/{env}/jwt-secret --region eu-central-1
```

### SSM Parameter Missing

**Symptom:** `cdk deploy` succeeds but Lambda invocations fail with SSM errors.

**Fix:** Create the parameter as described in [Section 3](#3-jwt-secret-ssm-parameter-store).

### Stack Already Exists

**Symptom:** `cdk deploy` fails with "Stack already exists".

**Fix:**
```bash
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE
cdk destroy --context env={env}
cdk deploy --all --context env={env} --context adminEmail=you@example.com
```

### API Gateway 429 (Unexpected)

**Symptom:** All API calls return 429 Too Many Requests.

**Cause:** Kill switch is active (Lambda concurrency set to 0) or throttle limit hit.

**Fix:** Check and restore Lambda concurrency (see [Section 9](#kill-switch-manual-recovery)).

### CloudFront 403 on SPA Routes

**Symptom:** Direct navigation to routes like `/admin/dashboard` returns 403.

**Cause:** The CloudFront Function for SPA routing may not be attached or may have a syntax error.

**Fix:** Check the CloudFront distribution's default behavior for the `passvault-spa-{env}` function association in the AWS console.
