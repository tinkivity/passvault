# CDK Package Architecture

The `cdk/` package defines the AWS infrastructure for PassVault using AWS CDK v2. It produces one CloudFormation stack per environment (dev, beta, prod).

## Entry Point

`bin/passvault.ts` reads the target environment from CDK context (`--context env=dev|beta|prod`) and loads the corresponding `EnvironmentConfig` from `@passvault/shared`. It optionally creates a cross-region `CertificateStack` in us-east-1 when a custom domain is provided (`--context domain=example.com`). The main `PassVaultStack` receives the resolved config and optional certificate.

Required context variables:
- `env` -- target environment (dev, beta, prod)
- `adminEmail` -- initial administrator email address

Optional context variables:
- `domain` -- root domain for CloudFront + Route 53 DNS
- `passkeyRpId`, `passkeyOrigin` -- WebAuthn relying party config (prod)

## Stack Composition

`lib/passvault-stack.ts` composes four constructs in order, then conditionally adds kill switch and SES notifier infrastructure:

1. **StorageConstruct** -- DynamoDB tables and S3 buckets
2. **BackendConstruct** -- Lambda functions and API Gateway
3. **FrontendConstruct** -- CloudFront distribution (beta + prod only, gated by `cloudFrontEnabled`)
4. **MonitoringConstruct** -- CloudWatch dashboard, alarms, SNS topic (prod only)
5. **KillSwitchConstruct** -- concurrency kill + auto-recovery (beta + prod, gated by `killSwitchEnabled`)
6. **SesNotifierConstruct** -- email alerts via SES (beta + prod when domain is provided)

After constructing the frontend, the stack sets `FRONTEND_ORIGIN` on all Lambdas (CloudFront domain in beta/prod, `*` in dev).

## StorageConstruct

`lib/constructs/storage.ts` creates:

### DynamoDB Tables

| Table | Partition Key | GSIs | Notes |
|---|---|---|---|
| `passvault-users-{env}` | `userId` | `username-index` (PK: username), `registrationToken-index` (PK: registrationToken, projected: userId, status, registrationTokenExpiresAt, username) | PITR in prod; RETAIN on delete |
| `passvault-vaults-{env}` | `vaultId` | `byUser` (PK: userId) | RETAIN on delete |
| `passvault-login-events-{env}` | `eventId` | none | TTL on `expiresAt` (90 days); DESTROY on delete |
| `passvault-passkey-credentials-{env}` | `credentialId` | `byUser` (PK: userId) | DESTROY on delete |

All tables use PAY_PER_REQUEST billing.

### S3 Buckets

| Bucket | Purpose | Versioned | Removal Policy |
|---|---|---|---|
| Files bucket | Encrypted user vault files | prod only | RETAIN |
| Frontend bucket | Static frontend assets | no | DESTROY (auto-delete objects) |

Both buckets enforce SSL and block all public access. The files bucket is tagged `passvault:env` for post-destroy cleanup.

## BackendConstruct

`lib/constructs/backend.ts` defines seven Lambda functions and the API Gateway.

### Lambda Functions

All functions use Node.js 22 on ARM64. Code is loaded from `backend/dist/{name}/`. Each function gets an explicit CloudWatch LogGroup with `DESTROY` removal policy.

| Function | Handler | Memory | Timeout | Reserved Concurrency (prod) |
|---|---|---|---|---|
| `passvault-challenge-{env}` | `challenge.handler` | 256 MB | 5s | 5 |
| `passvault-auth-{env}` | `auth.handler` | default | 10s | 3 |
| `passvault-admin-auth-{env}` | `admin-auth.handler` | default | 10s | 3 |
| `passvault-admin-mgmt-{env}` | `admin-management.handler` | default | 10s | 2 |
| `passvault-vault-{env}` | `vault.handler` | default | default | 5 |
| `passvault-health-{env}` | `health.handler` | 128 MB | 5s | 2 |
| `passvault-digest-{env}` | `digest.handler` | 256 MB | 5 min | none |

"default" memory and timeout come from `config.lambda.memorySize` and `config.lambda.timeout`. Reserved concurrency is only set in prod; dev/beta use the unreserved account pool.

The digest Lambda runs on an EventBridge schedule (daily at 01:00 UTC) and is not exposed via API Gateway.

### JWT Secret

The JWT signing secret is stored in SSM Parameter Store (`/passvault/{env}/jwt-secret`, SecureString). The parameter name is passed to auth, admin-auth, admin-mgmt, and vault Lambdas as `JWT_SECRET_PARAM`. Each Lambda fetches and decrypts the value at cold start.

### IAM Grants

- **Users table**: read/write for auth, admin-auth, admin-mgmt, vault, digest
- **Vaults table**: read/write for vault and admin-mgmt; read for digest
- **Login events table**: write for auth and admin-auth; read for admin-mgmt and digest
- **Passkey credentials table**: read/write for auth and admin-auth
- **Files bucket**: read/write for vault and admin-mgmt; read for digest

### API Gateway

REST API named `passvault-api-{env}` with stage-level throttling from `config.throttle`:
- Burst limit: `config.throttle.burstLimit` (20 req/s all envs)
- Rate limit: `config.throttle.rateLimit` (10 req/s all envs)

CORS is enabled for all origins with custom headers: `Content-Type`, `Authorization`, `X-Pow-Solution`, `X-Pow-Nonce`, `X-Pow-Timestamp`.

Gateway-level error responses (4xx, 5xx) include CORS headers. `INTEGRATION_FAILURE` is remapped to 429 to handle Lambda throttling during kill switch activation.

### API Resource Tree

All routes are nested under `/api`:

```
/api
  /challenge                GET  -> challengeFn
  /health                   GET  -> healthFn
  /auth
    /login                  POST -> authFn
    /logout                 POST -> authFn
    /verify-email           GET  -> authFn
    /profile                PATCH -> authFn
    /change-password        POST -> authFn
    /change-password/self   POST -> authFn
    /passkey
      /challenge            GET  -> authFn
      /verify               POST -> authFn
      /register             POST -> authFn
      /register/challenge   GET  -> authFn
    /passkeys               GET  -> authFn
      /{credentialId}       DELETE -> authFn
  /admin
    /login                  POST -> adminAuthFn
    /change-password        POST -> adminAuthFn
    /passkey
      /challenge            GET  -> adminAuthFn
      /verify               POST -> adminAuthFn
      /register             POST -> adminAuthFn
      /register/challenge   GET  -> adminAuthFn
    /passkeys               GET  -> adminAuthFn
      /{credentialId}       DELETE -> adminAuthFn
    /users                  GET, POST -> adminMgmtFn
    /users/{userId}         DELETE, PATCH -> adminMgmtFn
    /users/{userId}/vault   GET  -> adminMgmtFn
    /users/{userId}/lock    POST -> adminMgmtFn
    /users/{userId}/unlock  POST -> adminMgmtFn
    /users/{userId}/retire  POST -> adminMgmtFn
    /users/{userId}/expire  POST -> adminMgmtFn
    /users/{userId}/reactivate  POST -> adminMgmtFn
    /users/{userId}/refresh-otp POST -> adminMgmtFn
    /users/{userId}/email-vault POST -> adminMgmtFn
    /stats                  GET  -> adminMgmtFn
    /login-events           GET  -> adminMgmtFn
  /vaults                   GET, POST -> vaultFn
    /notifications          GET, POST -> vaultFn
    /{vaultId}              GET, PUT, PATCH, DELETE -> vaultFn
    /{vaultId}/download     GET  -> vaultFn
    /{vaultId}/email        POST -> vaultFn
  /config
    /warning-codes          GET  -> vaultFn
```

## FrontendConstruct

`lib/constructs/frontend.ts` creates a CloudFront distribution (beta + prod only). Only instantiated when `config.features.cloudFrontEnabled` is true.

### Behaviors

| Path Pattern | Origin | Cache | Notes |
|---|---|---|---|
| Default (`*`) | S3 bucket (OAC) | `CACHING_OPTIMIZED` | SPA function rewrites extensionless paths to `/index.html` |
| `/api/*` | API Gateway (HttpOrigin, originPath strips stage name) | `CACHING_DISABLED` | All HTTP methods allowed; `ALL_VIEWER_EXCEPT_HOST_HEADER` origin request policy |

### SPA CloudFront Function

`passvault-spa-{env}` (JS 2.0 runtime) runs on viewer-request for the default behavior. It checks if the URI contains a file extension; if not, it rewrites to `/index.html` for React Router.

### DNS

When a domain is provided, a Route 53 A record (alias) is created pointing `{config.subdomain}.{domain}` to the CloudFront distribution.

## MonitoringConstruct

`lib/constructs/monitoring.ts` is instantiated only in prod. It creates:

- **SNS alert topic** (`passvault-{env}-alerts`) -- receives CloudWatch alarm notifications and budget alerts
- **CloudWatch dashboard** (`passvault-{env}-dashboard`) -- API Gateway and Lambda metrics
- **SustainedTrafficAlarm** -- triggers when API Gateway request count exceeds threshold for 3 consecutive minutes

The alert topic is shared with the kill switch (prod) and the SES notifier.

## Kill Switch

The kill switch protects against sustained bot attacks by zeroing Lambda concurrency, causing API Gateway to return 429 for all requests.

### Activation Flow

1. **Trigger**: SNS message with `NewStateValue: "ALARM"`
   - Prod: CloudWatch `SustainedTrafficAlarm` fires automatically
   - Beta: manual `aws sns publish` to standalone kill switch topic
2. **Kill switch handler** (`lib/kill-switch-handler.ts`): sets `ReservedConcurrentExecutions` to 0 on all Lambda functions
3. **Schedule recovery**: creates an EventBridge Scheduler one-time schedule to invoke the re-enable handler

### Recovery Flow

1. **Re-enable handler** (`lib/kill-switch-reenable-handler.ts`): restores each function's concurrency to its original value
   - `limit > 0`: calls `PutFunctionConcurrency`
   - `limit = 0`: calls `DeleteFunctionConcurrency` (returns to unreserved pool)
2. The schedule self-deletes after execution (`ActionAfterCompletion: DELETE`)

### Environment Differences

| Setting | Beta | Prod |
|---|---|---|
| Trigger | Manual SNS publish | CloudWatch alarm |
| Re-enable delay | 3 minutes | 240 minutes (4 hours) |
| Original concurrency | `[0,0,0,0,0,0]` (unreserved) | `[5,3,3,2,5,2]` |
| SNS topic | Standalone `passvault-beta-kill-switch` | Shared `passvault-prod-alerts` |

The handler is idempotent -- if concurrency is already 0, it skips the zeroing step.

## Environment Feature Flags

Feature flags from `EnvironmentConfig.features` control which constructs are instantiated:

| Flag | dev | beta | prod | Effect |
|---|---|---|---|---|
| `cloudFrontEnabled` | false | true | true | Creates FrontendConstruct (CloudFront + S3 origin) |
| `killSwitchEnabled` | false | true | true | Creates KillSwitchConstruct (SNS + Lambda + EventBridge) |
| `passkeyRequired` | false | false | true | Passes `PASSKEY_RP_ID` and `PASSKEY_ORIGIN` env vars to auth Lambdas |

Other environment-driven differences:
- **Reserved concurrency**: prod only
- **MonitoringConstruct**: prod only
- **PITR on users table**: prod only
- **S3 files bucket versioning**: prod only
- **CORS origin**: `*` in dev, CloudFront domain in beta/prod
- **SES notifier**: beta + prod (when domain is provided)

## Stack Outputs

| Output | Description |
|---|---|
| `AdminEmail` | Initial administrator username |
| `ApiUrl` | API Gateway endpoint URL |
| `UsersTableName` | DynamoDB users table name |
| `FilesBucketName` | S3 files bucket name |
| `FrontendBucketName` | S3 frontend bucket name |
| `CloudFrontUrl` | CloudFront distribution URL (beta/prod only) |
| `AlertTopicArn` | SNS alert topic ARN (prod only) |
| `KillSwitchTopicArn` | Kill switch SNS topic ARN (beta only) |
