# Bot Protection

PassVault uses a multi-layer defense strategy to protect against bots, scrapers, and denial-of-service attacks. This page describes each layer, the kill switch behavior, and a worst-case cost analysis for a sustained bot attack.

---

## Defense Layers

### Layer 1 — CloudFront Flat-Rate Plan (Edge, Managed WAF + DDoS + Bot Management)

PassVault uses the **AWS CloudFront Flat-Rate Pricing Plan** (Free tier or higher), which includes:

- **AWS WAF** with managed bot control rules
- **AWS DDoS protection** (Shield Standard) at the edge
- **Bot management and analytics**
- **Geo-restriction capability** (optional)

**Key cost protection property:** Requests blocked by WAF or DDoS protection *never count against your monthly allowance*. Only traffic that passes through WAF rules counts toward usage.

| Tier | Monthly Cost | Requests | Data Transfer |
|------|-------------|----------|---------------|
| Free | $0 | 1M | 100 GB |
| Pro | TBD | 10M | 50 TB |
| Business | TBD | 125M | 50 TB |
| Premium | TBD | 500M | 50 TB |

This plan is configured in the **AWS CloudFront console**, not via CDK. See [DEPLOYMENT.md](./DEPLOYMENT.md#cloudfront-flat-rate-plan) for setup instructions.

### Layer 2 — API Gateway Stage Throttling

All environments have API Gateway stage-level throttle limits configured in `shared/src/config/environments.ts`:

| Limit | Value | Description |
|-------|-------|-------------|
| Steady-state rate | 10 req/s | Sustained request rate — excess returns 429 |
| Burst | 20 req/s | Short burst capacity above steady-state |

These limits cap the maximum Lambda invocation rate and bound worst-case API costs. All requests above the burst limit (including bot requests that pass CloudFront WAF) receive a 429 response from API Gateway without invoking any Lambda.

> Note: API Gateway charges for all requests including throttled 429 responses. The throttle limits bound the *number of chargeable requests*, not just invocations.

### Layer 3 — Proof-of-Work (PoW) Challenge

Before every API call, the frontend solves a SHA-256 proof-of-work challenge:

| Difficulty | Bits | Endpoints | Approx. solve time |
|-----------|------|-----------|-------------------|
| LOW | 16 | Public (`/api/challenge`) | ~10 ms |
| MEDIUM | 18 | Auth (`/api/auth/*`) | ~40 ms |
| HIGH | 20 | Admin + Vault | ~160 ms |

PoW is enabled in **beta and prod** environments (`powEnabled: true`). It imposes computational cost on automated clients without affecting legitimate users (browsers solve asynchronously via a Web Worker). A bot must spend CPU time solving each challenge, making mass parallel requests economically impractical.

### Layer 4 — Honeypot Form Fields

Hidden form fields (`email`, `phone`, `website`) are injected into login forms. Legitimate browsers leave these blank; automated form-fillers populate them. The backend middleware (`backend/src/middleware/pow.ts`) rejects any request where a honeypot field is non-empty with a silent 400.

Honeypot is enabled in **all environments** (`honeypotEnabled: true`).

### Layer 5 — Concurrency Kill Switch (Auto-Trigger in prod, Manual in beta)

**What it does:** Sets `reservedConcurrentExecutions: 0` on all 5 Lambda functions. API Gateway immediately returns 429 for all requests — no Lambda invocations, no backend processing. An EventBridge Scheduler rule automatically restores normal operation after a configurable delay.

The kill switch is deployed in **beta and prod**. Trigger and recovery times differ by environment:

| Environment | Trigger | Re-enable delay | Original concurrency |
|-------------|---------|-----------------|----------------------|
| beta | Manual SNS publish | **3 minutes** | None (unreserved pool) |
| prod | CloudWatch alarm (auto) | **4 hours** | challenge=5, auth=3, admin=2, vault=5, health=2 |

#### Prod — Automatic trigger

**Alarm condition:** API Gateway `Count` ≥ 550 requests/min for **3 consecutive 1-minute windows** (≈ 92% of the 10 req/s steady-state limit sustained for 3 minutes).

The alarm publishes to the SNS `alertTopic`. The kill switch Lambda fires, sets all concurrency to 0, and schedules re-enablement in 4 hours.

**Manual recovery** (restore before the 4-hour auto-recovery window):
```bash
aws lambda put-function-concurrency \
  --function-name passvault-challenge-prod \
  --reserved-concurrent-executions 5

aws lambda put-function-concurrency \
  --function-name passvault-auth-prod \
  --reserved-concurrent-executions 3

aws lambda put-function-concurrency \
  --function-name passvault-admin-prod \
  --reserved-concurrent-executions 2

aws lambda put-function-concurrency \
  --function-name passvault-vault-prod \
  --reserved-concurrent-executions 5

aws lambda put-function-concurrency \
  --function-name passvault-health-prod \
  --reserved-concurrent-executions 2
```

#### Beta — Manual trigger

Beta has no CloudWatch alarm. To activate the kill switch manually (e.g. for testing), publish an SNS ALARM message to the `KillSwitchTopicArn` output from the CDK stack:

```bash
# Get the topic ARN from the CDK output (shown after deploy):
#   PassVault-Beta.KillSwitchTopicArn = arn:aws:sns:eu-central-1:ACCOUNT:passvault-beta-kill-switch

aws sns publish \
  --region eu-central-1 \
  --topic-arn arn:aws:sns:eu-central-1:ACCOUNT:passvault-beta-kill-switch \
  --message '{"NewStateValue":"ALARM","AlarmName":"manual-test"}'
```

The kill switch Lambda fires within seconds. All API requests will return 429. The EventBridge re-enable schedule fires **3 minutes** later and restores the Lambda functions to their normal unreserved state (`DeleteFunctionConcurrency`).

**Manual recovery in beta** (restore immediately without waiting):
```bash
# Beta functions have no reserved concurrency — delete the reservation to restore
aws lambda delete-function-concurrency --function-name passvault-challenge-beta
aws lambda delete-function-concurrency --function-name passvault-auth-beta
aws lambda delete-function-concurrency --function-name passvault-admin-beta
aws lambda delete-function-concurrency --function-name passvault-vault-beta
aws lambda delete-function-concurrency --function-name passvault-health-beta
```

---

## CloudFront Flat-Rate Plan Setup

The CloudFront flat-rate plan is configured outside CDK in the AWS console. CDK provisions the CloudFront distribution normally; you then enroll it in the flat-rate plan.

**Steps (one-time, after first `cdk deploy`):**

1. Open the [AWS CloudFront console](https://console.aws.amazon.com/cloudfront/)
2. Select the `passvault-cdn-prod` distribution
3. Navigate to **Security** → **Pricing plan**
4. Choose **Flat-Rate Plan** → select **Free** (or higher tier if your usage requires it)
5. Accept the plan terms

Once enrolled:
- The distribution is protected by AWS-managed WAF rules and DDoS mitigation
- Blocked requests (DDoS, WAF rule matches, bot blocks) do not count toward your monthly allowance
- Your monthly CloudFront cost is fixed at the tier price regardless of attack volume

> The plan is not available in all regions but is supported in the distributions served from US/EU edge locations (Price Class 100, which PassVault uses).

---

## Worst-Case Cost Calculation (Sustained 30-Day Bot Attack)

This calculation assumes a maximally hostile scenario: a bot sends requests continuously at the maximum rate that passes through all defenses, for an entire calendar month.

### Assumptions

- CloudFront flat-rate plan is **Free** tier
- Attacker bypasses CloudFront WAF (worst case — 0% blocked at edge)
- Bot solves PoW challenges (worst case — automated PoW solver)
- Requests arrive at a sustained 10 req/s (at or just under the API GW steady-state limit)
- Kill switch does NOT fire (worst case — alarm threshold not reached for 3 consecutive minutes)
- 30-day month (720 hours)

### Calculation

| Component | Formula | Monthly Cost |
|-----------|---------|-------------|
| CloudFront | Free tier — blocked or passed requests at $0 | **$0.00** |
| API Gateway | 10 req/s × 60s × 60m × 24h × 30d = 25.92M req; 25.92M × $3.50/M | **$90.72** |
| Lambda | Kill switch fires within 3 min at sustained 10 req/s; ~1,800 invocations max | **~$0.00** |
| DynamoDB | No Lambda invocations after kill switch | **$0.00** |
| EventBridge Scheduler | One schedule per kill-switch activation; negligible | **~$0.00** |
| **Total worst case** | | **≈ $91/month** |

### Realistic Case (CloudFront WAF blocks ≥99% of bots)

| Component | Formula | Monthly Cost |
|-----------|---------|-------------|
| CloudFront | Free tier (blocked traffic excluded from allowance) | **$0.00** |
| API Gateway | 0.1 req/s × 25.92M × 1% = 259,200 req; 0.26M × $3.50/M | **< $1.00** |
| Lambda | < 1% of max requests reach Lambda | **< $0.10** |
| **Total realistic** | | **< $1/month** |

### Comparison: Unprotected vs. Protected

| Scenario | Monthly Cost | Notes |
|----------|-------------|-------|
| No protection, 10,000 req/s bot | ~$90,000+ | API GW charges all requests |
| API GW throttling only (10 req/s) | ~$91 | Max attack rate bounded |
| + CloudFront WAF (99% block rate) | < $1 | Most bots blocked at edge |
| + Kill switch (3-min trigger) | ~$0 after trigger | Lambda cost eliminated |

### Cost Cap Summary

The CloudFront flat-rate plan provides a hard cost ceiling for CloudFront itself ($0 on Free tier). API Gateway is the remaining variable cost, but it is bounded by the stage throttle to at most **~$91/month** in an absolute worst case (sustained full-month attack where every bot bypasses all CloudFront defenses). In practice, the CloudFront WAF blocks the overwhelming majority of bot traffic at $0 marginal cost.

---

## Summary Table

| Layer | Env | Protection | Cost |
|-------|-----|-----------|------|
| CloudFront flat-rate plan (WAF + DDoS + bot mgmt) | beta, prod | Blocks bots at edge; blocked traffic free | $0 (Free tier) |
| API GW throttle (10 req/s / burst 20) | all | Bounds max request rate | Included |
| Proof-of-Work (16–20 bit SHA-256) | beta, prod | CPU cost on automations | $0 |
| Honeypot form fields | all | Catches naive form-fillers | $0 |
| Concurrency kill switch | beta, prod | Shuts down backend under sustained attack; auto-recovers (3 min in beta, 4 h in prod) | ~$0 |
