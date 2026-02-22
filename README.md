# PassVault

**Secure, invitation-only personal text storage with end-to-end encryption and post-quantum cryptographic protection.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![AWS](https://img.shields.io/badge/AWS-Serverless-orange.svg)](https://aws.amazon.com/)
[![Security](https://img.shields.io/badge/Security-Post--Quantum-green.svg)](SPECIFICATION.md)

---

## 🔐 Overview

PassVault is a privacy-focused, serverless password vault where:
- **Each user gets exactly ONE encrypted text file** stored in AWS S3
- **Client-side encryption** ensures the server never sees your data
- **Post-quantum cryptography** (Argon2id + AES-256-GCM) protects against future threats
- **Multi-layer bot protection** prevents AWS cost abuse
- **TOTP-based 2FA** for all accounts (prod; disabled in dev/beta)
- **Zero-knowledge architecture** - even admins can't access user data
- **Three environments** - dev, beta, and prod with feature flags

**Monthly Cost:** ~$0 for dev/beta, ~$9-11 for prod (3-100 users)

---

## ✨ Key Features

### Security
- ✅ **End-to-end encryption** - Files encrypted on client, server stores only encrypted blobs
- ✅ **Post-quantum safe** - Argon2id + AES-256-GCM with 256-bit keys
- ✅ **TOTP 2FA** - Mandatory two-factor authentication (prod; disabled in dev/beta)
- ✅ **Zero-knowledge** - Admin cannot decrypt user files
- ✅ **Bot protection** - Multi-layer defense against automated attacks
- ✅ **Offline recovery** - Decrypt your file without the application

### User Experience
- ⏱️ **View mode** - Read-only with auto-logout (60s prod, 5min dev/beta)
- ✏️ **Edit mode** - Explicit activation with auto-logout (120s prod, 10min dev/beta)
- 📋 **Copy to clipboard** - One-click copy functionality
- 💾 **Download encrypted backup** - Full recovery package with metadata

### Infrastructure
- 🚀 **Serverless** - AWS Lambda + API Gateway + S3 + DynamoDB
- 📊 **Cost-effective** - ~$9/month for up to 100 users
- 🔒 **AWS WAF** - Bot Control with CAPTCHA challenges (prod only)
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
- **[LICENSE](LICENSE)** - MIT License

---

## 🏗️ Architecture

```
Browser (React)
    ↓ HTTPS
CloudFront + WAF
    ↓
API Gateway (Rate Limiting)
    ↓
Lambda Functions (PoW Validation)
    ↓
┌─────────────┬──────────────┐
│  DynamoDB   │  S3 Buckets  │
│ (users)     │ (files)      │
└─────────────┴──────────────┘
```

**Protection Layers:**
1. Client-side PoW (deters mass requests)
2. AWS WAF (blocks 90%+ of bots)
3. API Gateway throttling
4. Lambda validation

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

# Deploy dev stack (no WAF, no TOTP, ~$0/month)
cd cdk
cdk deploy PassVault-Dev --context env=dev

# Deploy beta stack (no WAF, no TOTP, with CloudFront, ~$0/month)
cdk deploy PassVault-Beta --context env=beta

# Deploy prod stack (full security, ~$8-10/month)
cdk deploy PassVault-Prod --context env=prod

# Or deploy all stacks at once
cdk deploy --all

# Follow post-deployment steps in DEPLOYMENT.md
```

For complete deployment instructions, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## 💰 Cost Breakdown

**Dev/Beta:** ~$0/month (WAF disabled, runs within AWS free tier)

**Prod (Year 2+):**

| Users | Monthly Cost | Per User/Month | Annual Cost |
|-------|--------------|----------------|-------------|
| 3     | $9.17        | $3.06          | $110        |
| 10    | $9.54        | $0.95          | $114        |
| 50    | $9.90        | $0.20          | $119        |
| 100   | $11.01       | $0.11          | $132        |
| 500   | $18.40       | $0.037         | $221        |

**Primary cost driver (prod):** AWS WAF (~80-90% of total costs)

**Compared to alternatives:**
- 1Password Business: $799/month for 100 users
- Bitwarden Teams: $400/month for 100 users
- **PassVault: $11/month for 100 users** (99% savings)

See **[COSTS.md](COSTS.md)** for detailed analysis.

---

## 🔒 Security Features

### Encryption
- **Algorithm:** Argon2id (KDF) + AES-256-GCM (encryption)
- **Key derivation:** 64MB memory, 3 iterations, 4 parallelism
- **Post-quantum resistant:** 256-bit keys provide 128-bit quantum security
- **Authenticated encryption:** GCM mode prevents tampering

### Bot Protection
- **Proof of Work:** SHA-256 challenges (~100-500ms computation)
- **AWS WAF:** Bot Control with managed rules
- **Rate limiting:** 20 req/sec burst, 10 req/sec steady
- **Honeypot traps:** Hidden form fields and timing validation
- **Progressive challenges:** Escalating difficulty on failed attempts

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
4. Set up TOTP (scan QR code) — *prod only, skipped in dev/beta*
5. Create user accounts (system generates OTPs)
6. Share credentials with users securely

### User Workflow
1. Receive username + OTP from admin
2. Log in with OTP
3. Change password (must meet security policy)
4. Set up TOTP (scan QR code) — *prod only, skipped in dev/beta*
5. Access vault in view mode (auto-logout)
6. Click "Edit" to modify (extended auto-logout)
7. Save changes (immediate logout)

### File Encryption
1. User enters password at login
2. Client derives encryption key: `Argon2id(password, salt)`
3. Key held in memory (never persisted)
4. On save: `AES-256-GCM(plaintext, key, IV)` → S3
5. On load: `AES-256-GCM-decrypt(ciphertext, key, IV)` → display
6. On logout: Clear key from memory

---

## 🛡️ Threat Model

**Protects Against:**
- ✅ Server compromise (end-to-end encryption)
- ✅ Database breach (encrypted files + hashed passwords)
- ✅ Man-in-the-middle (HTTPS + authenticated encryption)
- ✅ Bot attacks (multi-layer defense)
- ✅ Brute force (TOTP in prod + progressive challenges)
- ✅ Quantum computers (post-quantum cryptography)

**Does NOT Protect Against:**
- ❌ Compromised client device (keylogger, malware)
- ❌ Weak user passwords (enforced policy helps)
- ❌ Phishing attacks (user education required)
- ❌ Lost TOTP device (recovery requires admin)

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
- **Issues:** GitHub Issues
- **AWS CDK:** https://aws.amazon.com/cdk/

---

## ⚠️ Security Disclosure

If you discover a security vulnerability, please email security@example.com (replace with your email). Do not open a public issue.

---

**Built with ❤️ for privacy and security**

*PassVault - Your data, your keys, your control.*
