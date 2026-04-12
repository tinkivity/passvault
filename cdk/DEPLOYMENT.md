# PassVault -- CDK Deployment Guide

For infrastructure architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).

For post-deploy scripts, see [../scripts/README.md](../scripts/README.md).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Initial Setup](#2-initial-setup)
3. [JWT Secret (SSM Parameter Store)](#3-jwt-secret-ssm-parameter-store)
4. [CDK Context Variables](#4-cdk-context-variables)
   - [4a. SES Domain Verification](#4a-ses-domain-verification-precondition-for---context-domain)
   - [4b. Routing qualification test mail to your inbox](#4b-routing-qualification-test-mail-to-your-inbox)
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

**Important:** Without `--overwrite`, the command fails if the parameter already exists. Accidental rotation is disruptive — all active user sessions are invalidated **and** every encrypted vault `displayName` in DynamoDB becomes undecryptable until re-encrypted. For a planned rotation, follow §3a below.

**Verify** (confirms existence without revealing the value):

```bash
aws ssm get-parameter \
  --name /passvault/{env}/jwt-secret \
  --region eu-central-1 \
  --query "Parameter.{Name:Name,Type:Type,Version:Version}"
```

---

## 3a. JWT Secret Rotation

The JWT secret serves two purposes in PassVault:

1. HMAC signing key for all session JWTs, passkey challenge tokens, and password-change tokens.
2. KDF input material for the AES-256-GCM key that encrypts vault `displayName` values in `passvault-vaults-{env}` at rest (HKDF-SHA256, info label `passvault-vault-displayname-v1`).

Rotating the secret therefore has two consequences, and both must be handled in the same operation: every live session becomes invalid, and every row in the vaults table must be re-encrypted under the new key before the old key is discarded.

### Cadence

- **Scheduled:** once per year, during a planned maintenance window.
- **Event-driven (immediate):** suspected secret exposure — operator laptop lost, secret logged accidentally, departing admin with prior access, or a Lambda env snapshot leak.

Quarterly rotation is **not** required for this system's risk profile. The operational cost (forced re-login, re-encryption) outweighs the security benefit at that cadence.

### Pre-rotation checklist

1. Confirm the current JWT secret is still reachable: `aws ssm get-parameter --name /passvault/{env}/jwt-secret --with-decryption` succeeds.
2. Take an on-demand backup of the vaults table so you can roll back:
   ```bash
   aws dynamodb create-backup \
     --table-name passvault-vaults-{env} \
     --backup-name pre-jwt-rotation-$(date +%Y%m%d)
   ```
3. Sanity-check that the vault contents backup pipeline (S3) is healthy. Vault contents are encrypted client-side and therefore unaffected by this rotation, but you want the fallback ready.
4. Announce the maintenance window to users — all sessions will be invalidated; users will be prompted to log in again.
5. **Temporarily throttle vault writes** to avoid a concurrent rename racing the re-encryption script. The safest option is to set the vault Lambda's reserved concurrency to 0 for the duration:
   ```bash
   aws lambda put-function-concurrency \
     --function-name passvault-vault-{env} \
     --reserved-concurrent-executions 0
   ```
   Restore the original limit (see `shared/src/config.ts` for the per-env value) at the end.

### Step-by-step procedure

Keep secret material out of shell history and out of `ps`:

```bash
set +o history  # stop logging commands to history for this session

# 1. Save the old secret to a shell variable (do NOT write to disk).
OLD_JWT=$(aws ssm get-parameter \
  --name /passvault/{env}/jwt-secret \
  --with-decryption \
  --query Parameter.Value --output text)

# 2. Generate the new secret.
NEW_JWT=$(openssl rand -hex 32)

# 3. Run the rotation script. OLD_JWT and NEW_JWT are read from env vars
#    (NOT argv) so they do not leak through `ps`.
ENVIRONMENT={env} OLD_JWT="$OLD_JWT" NEW_JWT="$NEW_JWT" \
  npx tsx scripts/rotate-jwt-secret.ts

# 4. Force Lambda cold starts so every function picks up NEW_JWT.
#    Redeploying the stack is the simplest way:
cd cdk && cdk deploy PassVault-{Env} --context env={env}

# 5. Smoke test: log in as admin, open the vault list, confirm names render.
#    Then log in as a regular user and verify their vault list.

# 6. Clear the secrets from the shell once you have verified success.
unset OLD_JWT NEW_JWT
set -o history

# 7. Restore the vault Lambda's reserved concurrency from step 5 of the
#    pre-rotation checklist.
```

The `scripts/rotate-jwt-secret.ts` script (see its file header for details):

1. **Phase 1 — decrypt under old.** Scans `passvault-vaults-{env}` and decrypts every row's `displayName` into memory using `OLD_JWT`. If any row fails to decrypt, the script aborts **before** touching SSM so the rotation can be retried cleanly.
2. **Phase 2 — overwrite SSM.** Writes `NEW_JWT` to `/passvault/{env}/jwt-secret` via `PutParameter --overwrite` and records `ssmUpdated: true` in its progress file.
3. **Phase 3 — re-encrypt.** Rewrites each row's `displayName` as ciphertext under `NEW_JWT`, appending the vaultId to a local `.rotation-progress-{env}.json` file after every successful write. A conditional `attribute_exists(vaultId)` on each update prevents writes to rows that were deleted mid-rotation.
4. **Phase 4 — canary.** Re-reads one row and verifies it decrypts under `NEW_JWT` to the expected plaintext. If the canary fails, the script exits non-zero so the operator sees the failure before clearing `OLD_JWT`.

A `--dry-run` flag runs Phase 1 only (no SSM write, no DynamoDB update) — use it on any suspicious rotation to confirm all rows decrypt before committing.

### Availability implications

- **Sessions:** all active user sessions are invalidated the moment SSM is updated, regardless of whether re-encryption has completed. Users see "session expired" and must re-login. This is expected and visible.
- **Vault names:** briefly inconsistent during Phase 3. Rows already rewritten decrypt under `NEW_JWT`; rows not yet rewritten still hold old ciphertext. If new Lambda cold starts pick up `NEW_JWT` before Phase 3 finishes, users may see decryption errors on un-rewritten rows — which is why step 5 of the pre-rotation checklist sets the vault Lambda's concurrency to 0 during the rotation.
- **Vault contents:** unaffected. The `.enc` blobs in S3 are encrypted client-side with the user's password and do not depend on the JWT secret.

Schedule the rotation during a low-traffic window to minimize the user-visible impact.

### Risks

- **Losing `OLD_JWT` before Phase 3 completes** → the un-rewritten rows become permanently undecryptable. Recover those rows from the on-demand backup taken in step 2 of the pre-rotation checklist. Vault *contents* remain recoverable via the user's password regardless.
- **Operator exposure via shell history** → mitigated by `set +o history` and `unset` at the end of the procedure.
- **Concurrent vault-rename** racing Phase 3 writes → mitigated by setting reserved concurrency to 0 in the pre-rotation checklist.
- **Partial re-encryption on script crash** → mitigated by the progress file. Re-run the script with the same `OLD_JWT` and `NEW_JWT`; already-rewritten vaultIds are skipped. Important: do not regenerate `NEW_JWT` on retry — use the same value so the already-rewritten rows remain valid.

### Detecting failures

- The script's Phase 4 canary is the primary check — if the script exits zero, at least one row is confirmed to round-trip under the new key.
- After the rotation, run for 24 hours:
  ```
  fields @timestamp, @message
  | filter @message like /decryptDisplayName/ and @message like /Error/
  | sort @timestamp desc
  ```
  in CloudWatch Logs Insights against the vault Lambda's log group. Any hits indicate rows the rotation missed or corrupted.
- Manual spot check: admin console → Users → pick three users at random → confirm their vault lists render.

### Repair procedures

- **Script crashed mid-Phase 3, `OLD_JWT` still in shell:** re-run the same command. The progress file makes Phase 3 idempotent.
- **Script exited after Phase 2 but some rows fail to decrypt under `NEW_JWT`, `OLD_JWT` still in shell:** re-run; rows not listed in the progress file will be re-processed.
- **`NEW_JWT` written, `OLD_JWT` already discarded, some rows still under old key:** restore the entire `passvault-vaults-{env}` table from the on-demand backup taken in step 2 of the pre-rotation checklist, then re-run the rotation from scratch with a freshly captured `OLD_JWT` (which is the just-restored state) and a newly generated `NEW_JWT`.
- **Canary fails:** do not `unset OLD_JWT`. Re-run the script; if the failure persists, restore the table from backup and investigate the single failing vaultId before retrying.

### Rollback window

Before Phase 2 writes SSM, the rotation is a no-op — abort at any time.

Once SSM has been overwritten, rollback requires `OLD_JWT`. The runbook therefore **prohibits `unset OLD_JWT` until all post-rotation verification has passed** (steps 4–5 above). Keep the shell open.

---

## 4. CDK Context Variables

All `cdk` commands accept context variables via `--context key=value`.

| Variable | Required | Applies to | Description |
|---|---|---|---|
| `env` | Yes | All | Deployment environment: `dev`, `beta`, or `prod`. Names the stack `PassVault-Dev`, `PassVault-Beta`, or `PassVault-Prod`. |
| `adminEmail` | Yes | All | Initial admin username. Also subscribes to the SNS alert topic (beta/prod). |
| `domain` | No | beta, prod | Root domain of an existing Route 53 hosted zone (e.g. `example.com`). Creates a `CertificateStack` in us-east-1 and configures CloudFront with a custom subdomain. **Precondition**: the domain must be a Verified SES identity in the target account/region before `cdk deploy` — see §4a. |
| `plusAddress` | No | beta, prod | Single mailbox that receives all qualification test mail (e.g. `ops@example.com`). Must be `local@<domain>` and its domain must equal `domain`. When set, qualification scripts build test-user addresses as `local+<tag>@<domain>` and emit a `PlusAddress` CfnOutput. See §4b. |
| `passkeyRpId` | No | beta, prod | WebAuthn relying party ID (e.g. `beta.pv.example.com`). Resolution order: context → `PASSKEY_RP_ID` env var → auto-derived as `{config.subdomain}.{domain}` when `domain` is set (subdomain values: `dev.pv`, `beta.pv`, `pv` — see `shared/src/config/environments.ts`). |
| `passkeyOrigin` | No | beta, prod | WebAuthn relying party origin (e.g. `https://beta.pv.example.com`). Resolution order: context → `PASSKEY_ORIGIN` env var → auto-derived as `https://{config.subdomain}.{domain}` when `domain` is set. |

### Examples

**Minimal dev:**
```bash
cdk deploy PassVault-Dev --context env=dev --context adminEmail=you@example.com
```

**Beta with custom domain (no test-mail routing):**
```bash
cdk deploy --all --context env=beta --context domain=example.com --context adminEmail=you@example.com
```

**Beta with test-mail routing (recommended for qualification):**
```bash
cdk deploy --all \
  --context env=beta \
  --context domain=example.com \
  --context plusAddress=you@example.com \
  --context adminEmail=you+beta-admin@example.com \
  --context passkeyRpId=beta.pv.example.com \
  --context passkeyOrigin=https://beta.pv.example.com
```

With `plusAddress` set, `scripts/qualify.sh --env beta` discovers the
`PlusAddress` CfnOutput and routes all ~15 test-user invitations to
`you+<tag>@example.com`. Without it, qualification falls back to
`@passvault-test.local` (hard-bounces — not recommended). See §4b.

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

## 4a. SES Domain Verification (precondition for `--context domain=`)

If you pass `--context domain=example.com` to `cdk deploy`, the stack assumes
`example.com` (or whichever root you pass) is already a **Verified** SES
identity in the target account and region. CDK does not check this
synchronously — the deploy will succeed, but transactional mail from the
backend Lambdas (`noreply@{subdomain}.{domain}`) will bounce silently until
verification is complete.

Verify the domain out-of-band before you deploy:

1. Open the SES console in the target region (`eu-central-1` for beta/prod).
2. **Configuration → Verified identities → Create identity → Domain**.
3. Enter the root domain (e.g. `example.com`) and accept the default DKIM
   settings. SES returns a set of CNAME records.
4. Add those CNAMEs to your Route 53 hosted zone (or equivalent DNS provider).
5. Wait for the identity to reach **Verification status: Verified**
   (usually 5–15 minutes). Do not proceed until this shows green.

### SES send-email smoke test (run this first)

Before you trust the deploy, confirm the verified identity + DKIM + sandbox
rules all actually work by sending yourself one message directly — this has
**zero** dependency on the Lambdas, IAM wiring, or stack outputs, and isolates
SES identity problems from application-level misconfiguration:

```bash
aws ses send-email --region eu-central-1 \
  --from noreply@sub.example.com \
  --destination ToAddresses=you+ses-smoke@example.com \
  --message 'Subject={Data=SES smoke},Body={Text={Data=hello}}'
```

Replace `sub.example.com` with `{subdomain}.{domain}` for the target env
(prod → `pv.example.com`, beta → `beta.pv.example.com`) and
`you+ses-smoke@example.com` with a mailbox on the verified domain. **Run this
before `cdk deploy PassVault-Beta` and again before `qualify.sh --env beta`** —
it's the cheapest way to confirm that the SES account is out of the sandbox
for your verified domain, that DKIM alignment is correct, and that
plus-addressing survives the round-trip to your inbox. If this command fails,
nothing downstream will work.

If `send-email` succeeds but you don't see the message, check SES sandbox
status — while in the sandbox, SES will only deliver to addresses *at* the
verified domain (plus-addressing counts). Mail to any other domain will be
silently dropped.

## 4b. Routing qualification test mail to your inbox

`scripts/qualify.sh --env beta` creates ~15 test users per run. Each one
triggers an invitation email from the backend. By default those addresses use
`@passvault-test.local` (a reserved pseudo-TLD that hard-bounces at DNS and
damages SES sender reputation). To route all qualification mail to a single
mailbox you own, pass `--context plusAddress=you@example.com` at `cdk deploy`
time:

```bash
cd cdk
npx cdk deploy PassVault-Beta \
  --context env=beta \
  --context domain=example.com \
  --context plusAddress=you@example.com \
  --context adminEmail=you+beta-admin@example.com \
  --context passkeyRpId=beta.pv.example.com \
  --context passkeyOrigin=https://beta.pv.example.com
```

CDK emits two stack outputs the qualification pipeline depends on:

- `Domain` — the root domain passed via `--context domain=<d>`
- `PlusAddress` — the mailbox passed via `--context plusAddress=<addr>`

On fresh-deploy runs (no `PassVault-Beta` yet), `qualify.sh --env beta`
requires the operator to pass `--domain` and `--plus-address` on the command
line — CDK has nowhere else to read them from. On subsequent runs
(`--resume`, `--cleanup`), qualify.sh reads both values directly from the
stack's CloudFormation outputs and the flags become optional. Test users
become `you+<tag>-<timestamp>@example.com`, and qualify prompts for
confirmation before sending real mail (bypass with `--yes` in CI).

Validation rules (enforced at synth time by
[cdk/lib/validate-context.ts](lib/validate-context.ts)):
- `plusAddress` requires `domain` to also be set.
- `plusAddress` must be a well-formed `local@domain` email.
- The domain portion of `plusAddress` must equal the `domain` context value.

Dev is never affected: `qualify.sh` (default env) keeps the legacy
`@passvault-test.local` fallback and does not send real mail (dev Lambdas have
no `SENDER_EMAIL` configured). Prod is not qualifiable at all — `qualify.sh
--env prod` is rejected outright.

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
# Beta (with test-mail routing — see §4b)
cdk deploy --all \
  --context env=beta \
  --context domain=example.com \
  --context plusAddress=you@example.com \
  --context adminEmail=you+beta-admin@example.com \
  --context passkeyRpId=beta.pv.example.com \
  --context passkeyOrigin=https://beta.pv.example.com

# Prod
cdk deploy --all \
  --context env=prod \
  --context domain=example.com \
  --context adminEmail=you@example.com \
  --context passkeyRpId=vault.example.com \
  --context passkeyOrigin=https://vault.example.com \
  --require-approval broadening
```

`plusAddress` is optional on beta but strongly recommended if you intend to
run `qualify.sh --env beta` against the deployed stack — without it, the
qualification pipeline cannot route test-user invitations to a real mailbox.
Prod deploys omit `plusAddress` because production traffic is real users, not
qualification runs.

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

Note: `scripts/post-deploy.sh` runs `init-admin.ts` automatically if the admin account is absent, so manual initialization is not required when using that script.

### 6.2 Build and Deploy Frontend

**Option A: Using `post-deploy.sh` (recommended)**

```bash
./scripts/post-deploy.sh --env prod --profile my-profile
```

This handles admin initialization, env file generation, build, S3 sync, CloudFront invalidation, and smoke tests in one step. See `./scripts/post-deploy.sh --help` for all options.

**Option B: Manual steps**

```bash
cd frontend

# Write env file (VITE_API_BASE_URL must be EMPTY for beta/prod)
cat > .env.production << EOF
VITE_ENVIRONMENT=prod
VITE_API_BASE_URL=
VITE_PASSKEY_REQUIRED=true
VITE_SESSION_TIMEOUT_SECONDS=600
VITE_VAULT_TIMEOUT_SECONDS=60
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
2. Go to `/login` (unified login for both admin and regular users)
3. Enter the admin email and the one-time password from `init-admin.ts`
4. Change password on first login
5. **Beta/Prod:** Register a passkey (biometric/PIN/security key) on the passkey setup page
6. Access the admin dashboard at `/ui/admin/dashboard`

In dev, passkey setup is skipped -- admin goes directly to the dashboard after changing the password.

In beta/prod, admin login is a two-step process: enter username + password first, then verify with a passkey in a second dialog.

---

## 7. SES Email Setup (Beta/Prod)

PassVault uses Amazon SES for invitation OTPs, vault-export download links,
email-change confirmations, and the daily digest cron. If `SENDER_EMAIL` is
not set on the Lambda, all of these silently become no-ops.

**How it works:**

- The sender address is always
  `SENDER_EMAIL=noreply@{subdomain}.{domain}` — e.g.
  `noreply@beta.pv.example.com` for beta or `noreply@pv.example.com` for prod.
  CDK sets this on the auth, admin, vault, and digest Lambdas only when
  `--context domain=...` is provided. See
  [lib/passvault-stack.ts:159-166](lib/passvault-stack.ts#L159-L166).
- The `SesNotifierConstruct` creates Route 53 DKIM/SPF/MX/DMARC records for
  `{subdomain}.{domain}` and subscribes `alerts@{subdomain}.{domain}` to the
  monitoring/kill-switch SNS topic.
- **Domain-level verification is a precondition** (see §4a). CDK does **not**
  auto-verify the root `{domain}` identity — that must be done in the SES
  console before the first `cdk deploy`. Without it, Lambdas will try to send
  and fail silently.
- In dev, `SENDER_EMAIL` is never set, so the email code paths short-circuit
  and no mail is sent regardless of SES state.

### SES Sandbox

New AWS accounts start in the SES sandbox. In sandbox mode, SES only delivers
to addresses *at* a verified identity — which is exactly what §4b's
`plusAddress` pattern relies on. Plus-addressing (`you+tag@example.com`) is
accepted by the sandbox as long as the root domain is verified.

For qualification runs, **sandbox + verified domain + plus-addressing is
sufficient**. You do not need to exit the sandbox to run `qualify.sh --env beta`.

Exit the sandbox only when you want real users (outside your verified domain)
to receive invitation mail:

1. **AWS Console → Amazon SES → Account dashboard**
2. If the banner reads "Your account is in the sandbox", click
   **Request production access**
3. Select "Transactional", describe low-volume private password vault usage
4. AWS typically approves within 24 hours

### Domain Verification

Domain verification is **your responsibility, not CDK's** — see §4a for the
step-by-step. The `SesNotifierConstruct` creates DKIM/SPF records for the
`{subdomain}.{domain}` email identity it manages for alerts, but the root
`{domain}` identity that `SENDER_EMAIL=noreply@{subdomain}.{domain}` sends
*from* must already be Verified in the SES console when you deploy.

Before the first beta/prod deploy — and before every `qualify.sh --env beta`
run — execute the **SES send-email smoke test** from §4a. It confirms in ~2
seconds that the verified identity + DKIM + sandbox rules all work end-to-end,
with zero dependency on the Lambdas or IAM wiring.

### Troubleshooting Email (5-step checklist)

1. **Run the send-email smoke test from §4a first.** If `aws ses send-email`
   from the command line cannot deliver to a mailbox on the verified domain,
   no amount of Lambda debugging will help — the problem is at the SES
   identity layer. Fix that before continuing.

2. **Check Lambda logs.** Look for `Sending OTP email to ...`, `OTP email sent
   to ...`, `Failed to send OTP email`, or `OTP email skipped` messages:
   ```bash
   aws logs tail /aws/lambda/passvault-admin-mgmt-{env} --since 1h --region eu-central-1
   ```

3. **Check SES sending activity.** In the SES console, check **Email
   activity** or **Sending statistics**. Zero sends means the Lambda never
   called SES — check that `SENDER_EMAIL` is set (step 5).

4. **Check that the Lambda bundle is current.** If `cdk deploy` was run
   without rebuilding the backend, the running code may predate an email
   feature. Rebuild and redeploy:
   ```bash
   npm run build -w shared -w backend
   cd cdk && cdk deploy --all \
     --context env={env} \
     --context domain=example.com \
     --context plusAddress=you@example.com \
     --context adminEmail=you+beta-admin@example.com
   ```

5. **Check that `SENDER_EMAIL` is set on the Lambda:**
   ```bash
   aws lambda get-function-configuration \
     --function-name passvault-admin-mgmt-{env} \
     --region eu-central-1 \
     --query 'Environment.Variables.SENDER_EMAIL'
   ```
   If this returns `null`, the CDK deploy was run without `--context
   domain=...`. If it returns `noreply@{subdomain}.{domain}` but mail still
   fails, the root `{domain}` is not a Verified SES identity — see §4a.

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

For full details on defense layers and worst-case cost analysis, see [docs/BOTPROTECTION.md](../docs/BOTPROTECTION.md).

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

For full kill switch details, see [docs/BOTPROTECTION.md](../docs/BOTPROTECTION.md).

---

## 10. Environment Management

### Deploy Commands

```bash
cd cdk

# Dev (no CloudFront, passkeys optional, ~$0/month)
cdk deploy PassVault-Dev --context env=dev --context adminEmail=you@example.com

# Beta (CloudFront enabled, passkeys required for admin, ~$0/month)
# Add --context plusAddress=you@example.com if you intend to qualify against this stack (see §4b).
cdk deploy --all \
  --context env=beta \
  --context domain=example.com \
  --context plusAddress=you@example.com \
  --context adminEmail=you+beta-admin@example.com \
  --context passkeyRpId=beta.pv.example.com \
  --context passkeyOrigin=https://beta.pv.example.com

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
| Passkeys | Optional | Required (admin) | Required |
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

**Fix:** destroy the existing stack with the *same* context values it was
deployed with (CDK needs them to resolve the construct tree), then redeploy:
```bash
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Destroy — pass the same --context flags as the original deploy
cdk destroy --all \
  --context env={env} \
  --context domain=example.com \
  --context plusAddress=you@example.com \
  --context adminEmail=you+beta-admin@example.com

# Redeploy
cdk deploy --all \
  --context env={env} \
  --context domain=example.com \
  --context plusAddress=you@example.com \
  --context adminEmail=you+beta-admin@example.com
```

### API Gateway 429 (Unexpected)

**Symptom:** All API calls return 429 Too Many Requests.

**Cause:** Kill switch is active (Lambda concurrency set to 0) or throttle limit hit.

**Fix:** Check and restore Lambda concurrency (see [Section 9](#kill-switch-manual-recovery)).

### CloudFront 403 on SPA Routes

**Symptom:** Direct navigation to routes like `/admin/dashboard` returns 403.

**Cause:** The CloudFront Function for SPA routing may not be attached or may have a syntax error.

**Fix:** Check the CloudFront distribution's default behavior for the `passvault-spa-{env}` function association in the AWS console.
