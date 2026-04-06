# PassVault - Operational Costs Analysis

## Overview

This document provides a comprehensive breakdown of PassVault's monthly operational costs on AWS. PassVault is designed to be extremely cost-effective for small to medium-scale deployments, with most AWS services staying within free tier limits.

**Key Cost Highlights:**
- **3-10 users**: ~$0.17/month (Year 2+)
- **50 users**: ~$0.88/month (Year 2+)
- **100 users**: ~$2.00/month (Year 2+)
- **Primary cost driver**: CloudFront data transfer at 100+ users
- **Bot protection**: CloudFront flat-rate plan (Free tier) provides AWS-managed WAF + DDoS + bot management at $0/month — see [BOTPROTECTION.md](BOTPROTECTION.md) for attack cost scenarios

---

## Cost by Environment

PassVault supports three deployment environments (see [SPECIFICATION.md Section 2.5](SPECIFICATION.md) for details). Dev and beta run entirely within AWS free tier:

| Environment | CloudFront Flat-Rate Plan | Passkeys | CloudFront CDN | Other Services | **Monthly Total** |
|-------------|--------------------------|----------|----------------|----------------|-------------------|
| **Dev** | N/A *(no CloudFront)* | N/A *(disabled)* | $0 *(optional)* | ~$0 *(free tier)* | **~$0.00** |
| **Beta** | Free *(external, $0)* | N/A *(disabled)* | ~$0 *(free tier)* | ~$0 *(free tier)* | **~$0.00** |
| **Prod** | Free *(external, $0)* | Required | $0-1.53 | $0-0.50 | **~$0-2** |

**Running all three stacks:** ~$0-2/month total (only prod incurs any meaningful costs)

> All cost breakdowns below apply to the **prod** environment. Dev and beta costs are negligible.

---

## Table of Contents

1. [Cost Breakdown by Service](#1-cost-breakdown-by-service)
2. [Usage Scenarios](#2-usage-scenarios)
3. [Scaling Projections](#3-scaling-projections)
4. [Attack Scenario Costs](#4-attack-scenario-costs)
5. [Cost Optimization Strategies](#5-cost-optimization-strategies)
6. [AWS Free Tier Benefits](#6-aws-free-tier-benefits)
7. [Cost Monitoring & Alerts](#7-cost-monitoring--alerts)
8. [Annual Cost Projections](#8-annual-cost-projections)

---

## 1. Cost Breakdown by Service

### 1.1 AWS Lambda (Backend Compute)

**Pricing Model:**
- $0.20 per 1 million requests
- $0.0000166667 per GB-second of compute time
- **Free Tier**: 1 million requests/month, 400,000 GB-seconds/month (permanent)

**PassVault Usage:**

| User Count | Monthly Requests | Compute (GB-sec) | Free Tier | Monthly Cost |
|------------|-----------------|------------------|-----------|--------------|
| 3 users    | 1,530           | 153              | ✅ Yes    | **$0.00**    |
| 10 users   | 5,100           | 510              | ✅ Yes    | **$0.00**    |
| 50 users   | 25,500          | 2,550            | ✅ Yes    | **$0.00**    |
| 100 users  | 51,000          | 5,100            | ✅ Yes    | **$0.00**    |
| 500 users  | 255,000         | 25,500           | ✅ Yes    | **$0.43**    |
| 1,000 users| 510,000         | 51,000           | ✅ Yes    | **$0.85**    |

**Configuration:**
- Memory: 512 MB prod / 256 MB dev+beta (0.5 / 0.25 GB)
- Architecture: ARM64 (Graviton) — ~20% cheaper than x86
- Average execution time: 200ms per request
- Requests per user per month: ~510 (4 logins/day × 30 days)

**Calculation Example (100 users):**
```
Requests: 51,000/month
Cost: 51,000 × $0.20 / 1,000,000 = $0.01

Compute: 51,000 × 0.2s × 0.5GB = 5,100 GB-seconds
Cost: 5,100 × $0.0000166667 = $0.085

Total Lambda: $0.01 + $0.085 = $0.095 ≈ $0.10/month
```

**But within free tier:** $0.00/month (up to 100 users)

---

### 1.2 Amazon API Gateway

**Pricing Model:**
- $3.50 per million API calls
- **Free Tier**: 1 million API calls/month (first 12 months only)

**PassVault Usage:**

| User Count | Monthly API Calls | Within Free Tier (Year 1) | Cost (Year 1) | Cost (Year 2+) |
|------------|-------------------|---------------------------|---------------|----------------|
| 3 users    | 1,530             | ✅ Yes                    | **$0.00**     | **$0.01**      |
| 10 users   | 5,100             | ✅ Yes                    | **$0.00**     | **$0.02**      |
| 50 users   | 25,500            | ✅ Yes                    | **$0.00**     | **$0.09**      |
| 100 users  | 51,000            | ✅ Yes                    | **$0.00**     | **$0.18**      |
| 500 users  | 255,000           | ✅ Yes                    | **$0.00**     | **$0.89**      |
| 1,000 users| 510,000           | ✅ Yes                    | **$0.00**     | **$1.79**      |

**Calculation Example (100 users, Year 2+):**
```
API Calls: 51,000/month
Cost: 51,000 × $3.50 / 1,000,000 = $0.1785 ≈ $0.18/month
```

---

### 1.3 Amazon S3 (Storage)

**Pricing Model:**
- Storage: $0.023 per GB per month
- GET requests: $0.0004 per 1,000 requests
- PUT requests: $0.005 per 1,000 requests
- **Free Tier**: 5 GB storage, 20,000 GET requests, 2,000 PUT requests (first 12 months)

**PassVault Usage:**

| User Count | Storage (GB) | GET Requests | PUT Requests | Cost (Year 1) | Cost (Year 2+) |
|------------|--------------|--------------|--------------|---------------|----------------|
| 3 users    | 0.003        | 360          | 90           | **$0.00**     | **$0.001**     |
| 10 users   | 0.010        | 1,200        | 300          | **$0.00**     | **$0.002**     |
| 50 users   | 0.050        | 6,000        | 1,500        | **$0.00**     | **$0.009**     |
| 100 users  | 0.100        | 12,000       | 3,000        | **$0.00**     | **$0.02**      |
| 500 users  | 0.500        | 60,000       | 15,000       | **$0.00**     | **$0.12**      |
| 1,000 users| 1.000        | 120,000      | 30,000       | **$0.00**     | **$0.24**      |

**Assumptions:**
- Average file size: 1 MB per user
- 3 reads per day per user
- 1 write per day per user

**Calculation Example (100 users, Year 2+):**
```
Storage: 0.1 GB × $0.023 = $0.0023/month
GET: 12,000 × $0.0004 / 1,000 = $0.0048/month
PUT: 3,000 × $0.005 / 1,000 = $0.015/month
Total: $0.0023 + $0.0048 + $0.015 = $0.0221 ≈ $0.02/month
```

---

### 1.4 Amazon DynamoDB (Database)

**Pricing Model (On-Demand):**
- Storage: $0.25 per GB per month
- Read requests: $0.25 per 1 million reads
- Write requests: $1.25 per 1 million writes
- **Free Tier**: 25 GB storage, 25 WCU, 25 RCU (permanent)

**PassVault Usage:**

| User Count | Storage (GB) | Read Requests | Write Requests | Free Tier | Monthly Cost |
|------------|--------------|---------------|----------------|-----------|--------------|
| 3 users    | 0.000003     | 1,530         | 90             | ✅ Yes    | **$0.00**    |
| 10 users   | 0.00001      | 5,100         | 300            | ✅ Yes    | **$0.00**    |
| 50 users   | 0.00005      | 25,500        | 1,500          | ✅ Yes    | **$0.00**    |
| 100 users  | 0.0001       | 51,000        | 3,000          | ✅ Yes    | **$0.00**    |
| 500 users  | 0.0005       | 255,000       | 15,000         | ✅ Yes    | **$0.08**    |
| 1,000 users| 0.001        | 510,000       | 30,000         | ✅ Yes    | **$0.17**    |

**User Record Size:**
- ~3 KB per user (userId, username, passwordHash, role, status, passkey fields, salt, timestamps)

**Calculation Example (100 users):**
```
Storage: 0.0001 GB × $0.25 = $0.000025/month
Reads: 51,000 × $0.25 / 1,000,000 = $0.01275/month
Writes: 3,000 × $1.25 / 1,000,000 = $0.00375/month
Total: $0.000025 + $0.01275 + $0.00375 = $0.0165 ≈ $0.02/month

But within free tier (25 RCU/WCU): $0.00/month
```

---

### 1.5 Amazon CloudFront (CDN)

PassVault uses the **CloudFront Flat-Rate Pricing Plan** (Free tier) which includes AWS-managed WAF, DDoS protection, bot management, and CDN. The flat-rate plan provides a fixed monthly cost regardless of attack traffic — malicious requests blocked by the plan's WAF do not count against the usage allowance.

See [BOTPROTECTION.md](BOTPROTECTION.md) for full details on what's included and how to enroll.

**CloudFront Flat-Rate Plan Tiers:**

| Tier | Monthly Cost | Requests | Data Transfer | Includes |
|------|-------------|----------|---------------|---------|
| **Free** | **$0** | 1M | 100 GB | WAF, DDoS, bot mgmt, TLS, CF Functions |
| Pro | TBD | 10M | 50 TB | All above + S3 credits |
| Business | TBD | 125M | 50 TB | All above |
| Premium | TBD | 500M | 50 TB | All above |

> For PassVault with ≤100 users, the **Free tier** covers all normal CloudFront usage. The Free tier is permanent and never expires.

**Standard CloudFront Pricing** (if usage exceeds Free tier — rare for ≤100 users):
- Data transfer out: $0.085 per GB (first 10 TB, US/EU)
- HTTP/HTTPS requests: $0.0075 per 10,000 requests

**PassVault Usage (standard pricing reference):**

| User Count | Data Transfer (GB) | Requests | Cost (Year 1) | Cost (Year 2+) |
|------------|-------------------|----------|---------------|----------------|
| 3 users    | 1.8               | 5,000    | **$0.00**     | **$0.16**      |
| 10 users   | 6.0               | 16,000   | **$0.00**     | **$0.52**      |
| 50 users   | 30.0              | 80,000   | **$0.00**     | **$2.61**      |
| 100 users  | 60.0              | 160,000  | **$0.00**     | **$5.22**      |
| 500 users  | 300.0             | 800,000  | **$0.00**     | **$26.10**     |
| 1,000 users| 600.0             | 1,600,000| **$0.00**     | **$52.20**     |

> Note: All user-facing traffic stays within the Free tier (1M req/100GB) for ≤100 users in normal operation. The table above shows what standard pay-per-use pricing would be at scale.

**With Compression (100 users, Year 2+ — outside Free tier):**
```
Data Transfer (with 70% compression): 60 GB × 0.3 = 18 GB
Cost: 18 GB × $0.085 = $1.53/month
```

---

### 1.6 Data Transfer & Other Services

**CloudWatch Logs:**
- $0.50 per GB ingested
- $0.03 per GB stored
- **Free Tier**: 5 GB ingestion, 5 GB storage (permanent)
- **PassVault**: Within free tier for <1,000 users

**Data Transfer (Inter-Service):**
- Between services in same region: **$0.00**
- Lambda ↔ DynamoDB: Free
- Lambda ↔ S3: Free
- API Gateway ↔ Lambda: Free

**Route 53 (DNS) - Optional:**
- $0.50 per hosted zone per month
- $0.40 per million queries
- **Only needed if using custom domain**

---

## 2. Usage Scenarios

### Scenario A: Light Usage (3 Users)

**Usage Pattern:**
- 3 file reads per day per user
- 1 file edit per day per user
- Average file size: 500 KB

**Monthly Costs (Year 1):**
```
Lambda:          $0.00  (free tier)
API Gateway:     $0.00  (free tier)
S3:              $0.00  (free tier)
DynamoDB:        $0.00  (free tier)
CloudFront:      $0.00  (flat-rate Free tier)
Data Transfer:   $0.00
-----------------------------------
TOTAL:           $0.00/month
```

**Monthly Costs (Year 2+):**
```
Lambda:          $0.00  (free tier)
API Gateway:     $0.01
S3:              $0.001
DynamoDB:        $0.00  (free tier)
CloudFront:      $0.00  (flat-rate Free tier)
Data Transfer:   $0.00
-----------------------------------
TOTAL:           $0.01/month
```

**Per User Cost:** $0.004/month

---

### Scenario B: Medium Usage (50 Users)

**Usage Pattern:**
- 3 file reads per day per user
- 1 file edit per day per user
- Average file size: 1 MB

**Monthly Costs (Year 1):**
```
Lambda:          $0.00  (free tier)
API Gateway:     $0.00  (free tier)
S3:              $0.00  (free tier)
DynamoDB:        $0.00  (free tier)
CloudFront:      $0.00  (flat-rate Free tier)
Data Transfer:   $0.00
-----------------------------------
TOTAL:           $0.00/month
```

**Monthly Costs (Year 2+, optimized):**
```
Lambda:          $0.00  (free tier)
API Gateway:     $0.09
S3:              $0.01
DynamoDB:        $0.00  (free tier)
CloudFront:      $0.00  (flat-rate Free tier — within 1M req/100GB)
Data Transfer:   $0.00
-----------------------------------
TOTAL:           $0.10/month
```

**Per User Cost:** $0.002/month

---

### Scenario C: Heavy Usage (100 Users)

**Usage Pattern:**
- 5 file reads per day per user
- 2 file edits per day per user
- Average file size: 1 MB

**Monthly Costs (Year 1):**
```
Lambda:          $0.00  (free tier)
API Gateway:     $0.00  (free tier)
S3:              $0.00  (free tier)
DynamoDB:        $0.00  (free tier)
CloudFront:      $0.00  (flat-rate Free tier)
Data Transfer:   $0.00
-----------------------------------
TOTAL:           $0.00/month
```

**Monthly Costs (Year 2+, optimized):**
```
Lambda:          $0.10
API Gateway:     $0.30
S3:              $0.03
DynamoDB:        $0.00  (free tier)
CloudFront:      $1.53  (with compression — exceeds Free tier at this usage)
Data Transfer:   $0.00
-----------------------------------
TOTAL:           $1.96/month
```

**Per User Cost:** $0.02/month

---

## 3. Scaling Projections

### Cost vs User Count (Year 2+, Optimized)

| Users | Lambda | API GW | S3   | DynamoDB | CloudFront | **Total** | Per User |
|-------|--------|--------|------|----------|------------|-----------|----------|
| 3     | $0.00  | $0.01  | $0.00| $0.00    | $0.00      | **$0.01** | $0.004   |
| 10    | $0.00  | $0.02  | $0.00| $0.00    | $0.00      | **$0.02** | $0.002   |
| 25    | $0.00  | $0.04  | $0.01| $0.00    | $0.00      | **$0.05** | $0.002   |
| 50    | $0.00  | $0.09  | $0.01| $0.00    | $0.00      | **$0.10** | $0.002   |
| 100   | $0.10  | $0.18  | $0.02| $0.00    | $1.53      | **$1.83** | $0.018   |
| 250   | $0.26  | $0.45  | $0.06| $0.00    | $3.83      | **$4.60** | $0.018   |
| 500   | $0.51  | $0.89  | $0.12| $0.08    | $7.65      | **$9.25** | $0.019   |
| 1,000 | $1.02  | $1.79  | $0.24| $0.17    | $15.30     | **$18.52**| $0.019   |

> CloudFront is $0 at ≤50 users (within the permanent Free tier of 1M req/100GB/month). Cost appears at 100+ users where traffic begins to exceed the free tier in a given month.

**Key Insights:**
- **Near-zero costs**: ≤50 users runs at essentially $0/month (all within free tier)
- **CloudFront grows** as the primary cost driver at 100+ users
- **Excellent value**: Even at 1,000 users, only ~$18/month

---

## 4. Attack Scenario Costs

For a complete analysis of bot attack scenarios, worst-case cost calculations, and the full defense layer stack, see **[BOTPROTECTION.md](BOTPROTECTION.md)**.

**Summary:** With the CloudFront flat-rate plan (Free tier) providing edge-level WAF + DDoS protection and API Gateway throttling capping backend request rates at 10 req/s, the worst-case monthly cost under a sustained bot attack is approximately **$91/month** (API Gateway charges for all throttled requests). The realistic case with CloudFront WAF blocking ≥99% of bots is **< $1/month**.

---

## 5. Cost Optimization Strategies

### 5.1 Dev and Beta Environment Optimizations

Dev and beta environments are pre-configured to minimize costs via the environment config system (see [SPECIFICATION.md Section 2.5](SPECIFICATION.md)):

| Setting | Dev/Beta | Prod |
|---------|----------|------|
| CloudFront flat-rate plan | N/A / Free (external) | Free (external) |
| Passkeys | Disabled | Mandatory |
| Lambda memory | 256 MB | 512 MB |
| Log retention | 1 week (dev) / 2 weeks (beta) | 30 days |
| DynamoDB PITR | Disabled | Enabled |
| S3 versioning | Disabled | Enabled |

**Result:** Dev and beta stacks run at ~$0/month within AWS free tier. No manual cost optimization needed.

---

### 5.2 Production Optimizations

**Enable S3 Intelligent Tiering:**
```bash
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket passvault-files-prod \
  --id intelligent-tiering
```
**Savings:** Up to 70% on storage costs for infrequently accessed files
**Impact:** Minimal for PassVault (small files, frequent access)

**CloudFront Compression:**
```typescript
// Enabled in CDK (compress: true in Distribution defaultBehavior)
// Automatic gzip/brotli — no additional configuration needed
```
**Savings:** 60-80% reduction in data transfer costs
**Impact:** Significant at 100+ users (~$3.50/month at 100 users)

**Optimize Lambda Memory:**
```bash
# Use AWS Lambda Power Tuning
# https://github.com/alexcasalboni/aws-lambda-power-tuning
```
**Savings:** 10-30% on Lambda compute costs
**Impact:** Minimal at low usage, significant at 500+ users

**Use CloudFront Price Class 100:**
```typescript
// Already configured in CDK: PriceClass.PRICE_CLASS_100 (US, Canada, Europe)
```
**Savings:** 20-30% on CloudFront costs vs global distribution
**Impact:** ~$1/month at 100 users

**Total Production Savings:** ~$1-2/month at 100 users

---

### 5.3 Architecture Optimizations

**Lambda Reserved Concurrency:**
```typescript
// Prod: caps blast radius per function (challenge=5, auth=3, admin=2, vault=5, health=2)
// Dev/beta: omitted to avoid failing on low-quota AWS accounts
reservedConcurrentExecutions: 5  // example — varies per function
```
**Purpose:** Limits Lambda concurrency in prod for blast radius control — not a cost optimization.
**Cost savings:** None directly; can combine with Compute Savings Plans for up to 40% discount on Lambda compute at high usage (500+ users).

---

## 6. AWS Free Tier Benefits

### 6.1 Always Free Services (Permanent)

| Service         | Free Tier Limit         | PassVault Usage (100 users) | Within Limit? |
|-----------------|-------------------------|------------------------------|---------------|
| Lambda Requests | 1M requests/month       | 51,000/month                 | ✅ Yes        |
| Lambda Compute  | 400,000 GB-seconds/month| 5,100 GB-seconds/month       | ✅ Yes        |
| DynamoDB Storage| 25 GB                   | 0.0001 GB                    | ✅ Yes        |
| DynamoDB RCU    | 25 units                | ~1 unit                      | ✅ Yes        |
| DynamoDB WCU    | 25 units                | <1 unit                      | ✅ Yes        |
| CloudWatch Logs | 5 GB ingestion          | ~0.5 GB/month                | ✅ Yes        |

**Total Permanent Free Tier Value:** ~$5-10/month for PassVault at 100 users

---

### 6.2 First 12 Months Free

| Service       | Free Tier Limit     | PassVault Usage (100 users) | Within Limit? |
|---------------|---------------------|------------------------------|---------------|
| API Gateway   | 1M requests/month   | 51,000/month                 | ✅ Yes        |
| S3 Storage    | 5 GB                | 0.1 GB                       | ✅ Yes        |
| S3 GET        | 20,000 requests     | 12,000/month                 | ✅ Yes        |
| S3 PUT        | 2,000 requests      | 3,000/month                  | ⚠️ Partial    |
| CloudFront    | 1 TB data transfer  | 60 GB/month                  | ✅ Yes        |
| CloudFront    | 10M requests        | 160,000/month                | ✅ Yes        |

**Total First Year Savings:** ~$2/month (API Gateway + S3 after free tier)

**After Year 1:** Costs increase primarily from API Gateway and CloudFront data transfer

---

## 7. Cost Monitoring & Alerts

### 7.1 CloudWatch Cost Alarms

**Recommended Alerts:**

**Monthly Cost Alert:**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name passvault-monthly-cost \
  --alarm-description "Alert when monthly costs exceed $20" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold 20 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions <SNS-TOPIC-ARN>
```

**Daily Cost Alert:**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name passvault-daily-cost \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

---

### 7.2 AWS Cost Explorer

**Enable Cost Allocation Tags:**
```typescript
// In CDK stack
Tags.of(this).add('Project', 'PassVault');
Tags.of(this).add('Environment', 'prod');
Tags.of(this).add('CostCenter', 'engineering');
```

**Monthly Cost Review:**
```bash
# View costs by service
aws ce get-cost-and-usage \
  --time-period Start=2026-02-01,End=2026-02-28 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE

# View costs by tag
aws ce get-cost-and-usage \
  --group-by Type=TAG,Key=Project
```

---

### 7.3 Budget Setup

**Create Monthly Budget:**
```bash
aws budgets create-budget \
  --account-id <ACCOUNT-ID> \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

**budget.json:**
```json
{
  "BudgetName": "PassVault-Monthly",
  "BudgetLimit": {
    "Amount": "20",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
```

**notifications.json:**
```json
{
  "Notification": {
    "NotificationType": "ACTUAL",
    "ComparisonOperator": "GREATER_THAN",
    "Threshold": 80
  },
  "Subscribers": [{
    "SubscriptionType": "EMAIL",
    "Address": "admin@example.com"
  }]
}
```

---

## 8. Annual Cost Projections

### 8.1 Annual Costs by User Count

**Year 1 (with 12-month free tier):**

| Users | Monthly (Avg) | Annual Total | Per User/Year |
|-------|---------------|--------------|---------------|
| 3     | $0.00         | **$0**       | $0.00         |
| 10    | $0.00         | **$0**       | $0.00         |
| 50    | $0.00         | **$0**       | $0.00         |
| 100   | $0.00         | **$0**       | $0.00         |
| 500   | $0.00         | **$0**       | $0.00         |

**Year 2+ (after free tier expires):**

| Users | Monthly (Avg) | Annual Total | Per User/Year |
|-------|---------------|--------------|---------------|
| 3     | $0.01         | **$0.12**    | $0.04         |
| 10    | $0.02         | **$0.24**    | $0.02         |
| 50    | $0.10         | **$1.20**    | $0.02         |
| 100   | $1.83         | **$22**      | $0.22         |
| 500   | $9.25         | **$111**     | $0.22         |
| 1,000 | $18.52        | **$222**     | $0.22         |

---

### 8.2 5-Year Total Cost of Ownership

**Assumptions:**
- 100 users
- Growth: 0% (stable user base)
- Optimizations applied from year 1

| Year | Monthly | Annual | Cumulative |
|------|---------|--------|------------|
| 1    | $0.00   | $0     | $0         |
| 2    | $1.83   | $22    | $22        |
| 3    | $1.83   | $22    | $44        |
| 4    | $1.83   | $22    | $66        |
| 5    | $1.83   | $22    | $88        |

**5-Year TCO:** $88 for 100 users ($0.18 per user per year)

---

## Summary & Recommendations

### Cost Summary (100 Users, Production)

**Year 1:**
- Monthly: $0.00
- Annual: $0
- Per user: $0.00/year

**Year 2+ (Optimized):**
- Monthly: ~$1.83
- Annual: ~$22
- Per user: $0.22/year

### Primary Cost Drivers

1. **CloudFront data transfer**: Primary cost at 100+ users (but $0 with flat-rate Free tier up to 100 users)
2. **API Gateway**: Minimal after free tier expires (~$0.18/month at 100 users)
3. **Lambda/DynamoDB/S3**: Negligible due to free tier
4. **CloudFront flat-rate plan**: $0 (Free tier for ≤1M req/100GB/month)

### Recommendations

✅ **Enroll in CloudFront flat-rate Free plan** — provides AWS-managed WAF + DDoS + bot management at $0/month (see [BOTPROTECTION.md](BOTPROTECTION.md))
✅ **Enable CloudFront compression** — 60-80% data transfer savings (already configured in CDK)
✅ **Use S3 + CloudFront hosting** — leverages AWS free tier maximally
✅ **Monitor costs monthly** — set up CloudWatch alarms at $20/month threshold
✅ **Use dev stack for development** — passkeys optional, ~$0/month
✅ **Start with default settings** — optimize only if costs exceed $20/month

### Cost-Effectiveness

PassVault is **extremely cost-effective**:
- **3-50 users**: ~$0/month (year 1), ~$0.10/month (year 2+)
- **100 users**: ~$0/month (year 1), ~$1.83/month (year 2+)
- **500 users**: ~$9.25/month
- **1,000 users**: ~$18.52/month

**Competitive Analysis:**
- 1Password Business: $7.99/user/month = $799/month for 100 users
- Bitwarden Teams: $4/user/month = $400/month for 100 users
- **PassVault**: $1.83/month for 100 users (Year 2+) = **99.8% cost savings**

---

For deployment instructions and infrastructure setup, see [DEPLOYMENT.md](DEPLOYMENT.md).

For bot protection details and attack cost analysis, see [BOTPROTECTION.md](BOTPROTECTION.md).

For technical specifications, see [SPECIFICATION.md](SPECIFICATION.md).
