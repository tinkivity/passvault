# PassVault

**Secure, invitation-only personal text storage with end-to-end encryption and post-quantum cryptographic protection.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![AWS](https://img.shields.io/badge/AWS-Serverless-orange.svg)](https://aws.amazon.com/)
[![Security](https://img.shields.io/badge/Security-Post--Quantum-green.svg)](SPECIFICATION.md)

---

## 🔐 Overview

PassVault is a privacy-focused, serverless password vault where:
- **Structured vault with multiple item types** (logins, credit cards, notes, identities, WiFi, SSH keys, email accounts) stored encrypted in AWS S3
- **Multiple vaults per user** (1 for free plan, up to 10 for pro) with plan-based limits enforced server-side
- **Client-side encryption** ensures the server never sees your data — not even warning codes
- **Post-quantum cryptography** (Argon2id + AES-256-GCM) protects against future threats
- **Multi-layer bot protection** prevents AWS cost abuse
- **Passkey-based 2FA** (WebAuthn/FIDO2) for all accounts (prod; disabled in dev/beta)
- **Zero-knowledge architecture** - even admins can't access user data
- **Three environments** - dev, beta, and prod with feature flags

**Monthly Cost:** ~$0 for dev/beta, ~$1-2 for prod (3-100 users)

---

## ✨ Key Features

### Security
- ✅ **End-to-end encryption** - Files encrypted on client, server stores only encrypted blobs
- ✅ **Post-quantum safe** - Argon2id + AES-256-GCM with 256-bit keys
- ✅ **Passkey 2FA** - Mandatory WebAuthn/FIDO2 passkey authentication (prod; disabled in dev/beta)
- ✅ **Zero-knowledge** - Admin cannot decrypt user files
- ✅ **Bot protection** - Multi-layer defense against automated attacks
- ✅ **Offline recovery** - Decrypt your file without the application

### User Experience
- ⏱️ **View mode** - Read-only with auto-logout (60s prod, 5min dev/beta)
- ✏️ **Edit mode** - Explicit activation with auto-logout (120s prod, 10min dev/beta)
- 📋 **Copy to clipboard** - One-click copy with reveal/hide toggle on secret fields
- 💾 **Download encrypted backup** - Full recovery package with metadata
- 🔑 **Password generator** - Cryptographically random strong passwords inline in forms
- ⚠️ **Password warnings** - Duplicate and weak password detection stored inside the encrypted vault (zero-knowledge)
- 👤 **User lifecycle** - Admin can lock, unlock, expire, or retire accounts; email-as-username with optional verification (prod)

### Infrastructure
- 🚀 **Serverless** - AWS Lambda + API Gateway + S3 + DynamoDB
- 📊 **Cost-effective** - ~$9/month for up to 100 users
- 🛡️ **CloudFront flat-rate plan** - AWS-managed WAF + DDoS + bot management at $0/month (Free tier)
- 🌍 **CloudFront CDN** - Global content delivery
- 📈 **Scalable** - Handles 1,000+ users with minimal cost increase

---

## 📚 Documentation

- **[SPECIFICATION.md](SPECIFICATION.md)** - Complete technical specification
- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Build plan and architecture
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - AWS CDK deployment guide
- **[TESTING.md](TESTING.md)** - Unit tests, dev UI testing script, smoke tests, pre-deployment checklist
- **[RECOVERY.md](RECOVERY.md)** - Offline file recovery manual
- **[COSTS.md](COSTS.md)** - Detailed cost analysis and projections
- **[BOTPROTECTION.md](BOTPROTECTION.md)** - Bot protection layers, CloudFront flat-rate plan, kill switch, worst-case costs
- **[LICENSE](LICENSE)** - MIT License

---

## 🏗️ Architecture

```
Browser (React)
    ↓ HTTPS
CloudFront (flat-rate plan: WAF + DDoS + bot mgmt)
    ↓
API Gateway (throttle: 10 req/s, burst 20)
    ↓
Lambda Functions (PoW + honeypot validation)
    ↓
┌─────────────┬──────────────┐
│  DynamoDB   │  S3 Buckets  │
│ (users)     │ (files)      │
└─────────────┴──────────────┘
```

**Protection Layers:**
1. CloudFront flat-rate plan (AWS-managed WAF, DDoS, bot management)
2. API Gateway throttling (10 req/s steady-state)
3. Client-side PoW (deters mass automation)
4. Honeypot form fields (blocks naive bots)
5. Concurrency kill switch (auto-fires after 3 min sustained traffic)

See [BOTPROTECTION.md](BOTPROTECTION.md) for full defense details and worst-case cost analysis.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 22+
- AWS CLI configured
- AWS CDK v2
- AWS account with admin access

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/passvault.git
cd passvault

# Install all dependencies (monorepo — npm workspaces)
npm install
```

### Deployment

```bash
# Bootstrap CDK (one-time setup)
cdk bootstrap aws://ACCOUNT-ID/REGION

# Deploy dev stack (no passkey required, ~$0/month)
cd cdk
cdk deploy PassVault-Dev --context env=dev

# Deploy beta stack (no passkey required, with CloudFront, ~$0/month)
cdk deploy PassVault-Beta --context env=beta

# Deploy prod stack (full security, ~$1-2/month)
cdk deploy PassVault-Prod --context env=prod

# Or deploy all stacks at once
cdk deploy --all

# Follow post-deployment steps in DEPLOYMENT.md
```

For complete deployment instructions, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## 💰 Cost Breakdown

**Dev/Beta:** ~$0/month (runs within AWS free tier)

**Prod (Year 2+):**

| Users | Monthly Cost | Per User/Month | Annual Cost |
|-------|--------------|----------------|-------------|
| 3     | $0.01        | $0.003         | $0.12       |
| 10    | $0.38        | $0.038         | $4.56       |
| 50    | $1.10        | $0.022         | $13.20      |
| 100   | $1.83        | $0.018         | $21.96      |
| 500   | $9.22        | $0.018         | $110.64     |

**Primary cost drivers (prod):** Lambda + API Gateway requests (CloudFront flat-rate plan is $0)

**Compared to alternatives:**
- 1Password Business: $799/month for 100 users
- Bitwarden Teams: $400/month for 100 users
- **PassVault: $1.83/month for 100 users** (99.8% savings)

See **[COSTS.md](COSTS.md)** for detailed analysis.

---

## 🔒 Security Features

### Encryption
- **Algorithm:** Argon2id (KDF) + AES-256-GCM (encryption)
- **Key derivation:** 64MB memory, 3 iterations, 4 parallelism
- **Post-quantum resistant:** 256-bit keys provide 128-bit quantum security
- **Authenticated encryption:** GCM mode prevents tampering

### Bot Protection
- **CloudFront flat-rate plan:** AWS-managed WAF, DDoS protection, bot management ($0/month Free tier)
- **API Gateway throttling:** 10 req/s steady-state, burst 20 — hard ceiling on Lambda invocations
- **Proof of Work:** SHA-256 challenges (~100-500ms computation) deters mass automation
- **Honeypot traps:** Hidden form fields block naive form-filling bots
- **Concurrency kill switch:** Fires after 3 consecutive minutes at throttle limit; auto-recovers in 4 hours

See [BOTPROTECTION.md](BOTPROTECTION.md) for the full threat model and worst-case cost analysis.

### Recovery
- Download complete encrypted backup with metadata
- Decrypt offline using Python or Node.js scripts
- No backdoors or master keys
- Full user ownership and portability

---

## 📖 How It Works

### Admin Workflow
1. Deploy PassVault to AWS using CDK
2. Run `ENVIRONMENT=prod npx tsx scripts/init-admin.ts` — prints the one-time admin password to console
3. Log in and change password
4. Register passkey (biometric/PIN) — *prod only, skipped in dev/beta*
5. Create user accounts using email address as username (system generates OTPs and sends invitation emails in prod)
6. Manage users: lock/unlock/expire/retire accounts from the User Detail page

### User Workflow
1. Receive email invitation (prod) or OTP directly (dev/beta) from admin
2. Click email verification link if required (prod), then log in with OTP
3. Change password (must meet security policy)
4. Register passkey (biometric/PIN) — *prod only, skipped in dev/beta*
5. Browse vault items in the sidebar; view details in read-only mode
6. Add/edit items using structured forms with password generator
7. Warning badges appear automatically for duplicate or weak passwords

### Vault Encryption
1. User enters password at login
2. Client derives encryption key: `Argon2id(password, salt)`
3. Key held in memory (never persisted)
4. On save: `JSON.stringify(VaultFile)` → `AES-256-GCM(plaintext, key, IV)` → S3
5. On load: GET from S3 → `AES-256-GCM-decrypt` → `JSON.parse()` → structured item list
6. Warning codes recomputed on every save and stored inside the encrypted blob
7. On logout: Clear key from memory

---

## 🛡️ Threat Model

**Protects Against:**
- ✅ Server compromise (end-to-end encryption)
- ✅ Database breach (encrypted files + hashed passwords)
- ✅ Man-in-the-middle (HTTPS + authenticated encryption)
- ✅ Bot attacks (multi-layer defense)
- ✅ Brute force (passkey in prod + progressive challenges)
- ✅ Quantum computers (post-quantum cryptography)

**Does NOT Protect Against:**
- ❌ Compromised client device (keylogger, malware)
- ❌ Weak user passwords (enforced policy helps)
- ❌ Phishing attacks (passkeys are phishing-resistant by design)
- ❌ Lost passkey device (recovery requires admin to reset account)

---

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🔗 Links

- **Documentation:** [SPECIFICATION.md](SPECIFICATION.md)
- **Deployment:** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Testing:** [TESTING.md](TESTING.md)
- **Recovery:** [RECOVERY.md](RECOVERY.md)
- **Costs:** [COSTS.md](COSTS.md)
- **Bot Protection:** [BOTPROTECTION.md](BOTPROTECTION.md)
- **Issues:** GitHub Issues
- **AWS CDK:** https://aws.amazon.com/cdk/

---

## ⚠️ Security Disclosure

If you discover a security vulnerability, please email security@example.com (replace with your email). Do not open a public issue.

---

**Built with ❤️ for privacy and security**

*PassVault - Your data, your keys, your control.*
