# PassVault - Application Specification

## 1. Overview

PassVault is an invitation-only, personal secure text storage application where each user has exactly one private text file stored encrypted in AWS S3. Each file is encrypted client-side using a key derived from the user's password, providing end-to-end encryption with post-quantum cryptographic protection. Administrators create user invitations with one-time passwords. Users login with their assigned username and one-time password, then must set a secure password on first login. The application features a React frontend with serverless backend using AWS Lambda and API Gateway. Each user's file is automatically created when the admin creates the invitation and is only accessible by that user.

**Critical Privacy Feature**: The admin has **zero access** to user file content. Files are encrypted with keys derived from each user's personal password (not the admin password), ensuring complete user privacy. Even with full system access, the admin cannot decrypt user files without knowing the individual user's password.

## 2. Functional Requirements

### 2.1 User Management

#### Admin Functions
- **Single Admin**: The system has exactly one admin account
- **Admin First-Time Login**: On first login, admin must change initial password
  - Initial admin password is generated and printed to console by `scripts/init-admin.ts` after deployment
  - The script must be run by someone with AWS credentials and DynamoDB write access
  - This establishes trust — AWS account access is the root of trust
  - After first login, admin must set a new secure password
  - Admin account status changes from "pending_first_login" to "pending_passkey_setup"
- **Admin Passkey Setup (Required after password change)**: Admin must register a WebAuthn passkey
  - Browser shows device biometric / PIN prompt to create a passkey credential
  - Credential is stored server-side (public key only)
  - Admin account status changes from "pending_passkey_setup" to "active"
- **Admin Authentication**: After initial setup, admin authenticates with:
  - Passkey (step 1 — identifies the admin and pre-fills username)
  - Password (step 2 — derives the encryption key)
  - > **Environment Note**: In dev and beta environments where passkeys are disabled, the status transitions directly from "pending_first_login" to "active" after password change. The passkey setup step is skipped entirely. Login requires only username + password.
- **Create User Invitation**: Admin creates new users by:
  - Specifying a username
  - Optionally providing an email address (beta/prod only)
  - System generates a secure one-time password (OTP) with an expiry time
  - If an email is provided, SES sends the OTP and expiry notice to the user's inbox
  - Empty S3 file is automatically created for the user
  - User account is marked as "pending_first_login"
  - Admin dashboard accessible only after admin has completed passkey setup
  - Admin always sees the OTP in the UI regardless of email delivery
  - **Important**: Admin does NOT set user passwords - users set their own passwords
- **View User Invitations**: Admin can view list of created users and their status (pending_first_login / pending_passkey_setup / active), including email address where provided
- **Refresh OTP**: Admin can generate a new OTP for a user that is still in `pending_first_login` state (e.g. OTP expired or was lost); sends email if the user has one on record
- **Delete Pending User**: Admin can delete a user that has not yet completed first login; removes the DynamoDB record and the S3 vault file
- **Admin Limitations - Zero Access to User Data**:
  - **Admin CANNOT access user file content** unless they know the user's password
  - User files are encrypted with keys derived from user passwords (not admin password)
  - Admin only knows the temporary OTP, never the user's final password
  - Even with full AWS/database access, admin cannot decrypt user files
  - This ensures complete user privacy and zero-knowledge architecture

#### User Functions
- **First-Time Login**: Users receive username and one-time password from admin (via secure channel or email)
  - Authenticate with username and OTP
  - OTPs have a per-environment expiry: dev=60 min, beta=10 min, prod=120 min
  - Expired OTPs return 401 `OTP_EXPIRED`; admin must use Refresh OTP to issue a new one
  - System forces immediate password change
  - New password must meet secure password policy
  - Account status changes from "pending_first_login" to "pending_passkey_setup"
- **Passkey Setup (Required after password change)**: Users must register a WebAuthn passkey
  - Browser shows device biometric / PIN prompt to create a passkey credential
  - Credential is stored server-side (public key only)
  - Account status changes from "pending_passkey_setup" to "active"
- **Normal Login**: After initial setup, users authenticate with:
  - Passkey (step 1 — identifies the user and pre-fills username)
  - Password (step 2 — derives the encryption key)
  - > **Environment Note**: In dev and beta environments where passkeys are disabled, the status transitions directly from "pending_first_login" to "active" after password change. The passkey setup step is skipped entirely. Login requires only username + password.
- **Session Management**: Maintain authenticated state during user session
- **Logout**: Users can end their session

### 2.2 File Management

#### View Mode (Default)
- **Read-Only Access**: Upon login, users can only view their file content (not edit)
- **Copy to Clipboard**: Users can copy text from their file to clipboard
- **Download Encrypted File**: Users can download their encrypted file with all recovery metadata
  - Downloads as JSON file: `{encryptedContent, salt, parameters, metadata}`
  - Allows offline decryption using password and recovery tools
  - File contains everything needed for independent recovery
- **Auto-Logout**: Automatic logout after 60 seconds of inactivity
- **Visible Countdown**: Display countdown timer showing remaining seconds until auto-logout

#### Edit Mode (Explicit Activation)
- **Enter Edit Mode**: User must explicitly click "Edit" button to enable editing
- **Timer Extension**: Upon entering edit mode, countdown timer resets and extends to 120 seconds
- **Edit Content**: User can now modify file content in text editor
- **No Auto-Save**: Changes are NOT automatically saved
- **Explicit Save**: User must click "Save" button to persist changes
- **Post-Save Logout**: After successful save, user is immediately logged out
- **Cancel Edit**: User can cancel edit mode, which immediately logs them out without saving changes

#### Encryption
- **Client-Side Encryption**: All file content is encrypted on the client (browser) before being sent to the server
- **Password-Based Key Derivation**: Encryption key is derived from user's password using Argon2id (quantum-resistant KDF)
- **Post-Quantum Safe**: Uses AES-256-GCM for symmetric encryption (quantum-resistant with 256-bit keys)
- **End-to-End Encryption**: Server never sees plaintext content, only encrypted blobs
- **Automatic Encryption/Decryption**: Transparent to user - encryption on save, decryption on load
- **Password Change Re-encryption**: When password changes, file is automatically re-encrypted with new key

#### General
- Users have no access to file deletion or creation (one file per user, created automatically)
- Users cannot see or access other users' files
- Server stores only encrypted file content, cannot decrypt without user's password

### 2.3 Bot Protection & Cost Mitigation

**Critical Requirement**: Protect against automated crawlers, bots, and denial-of-service attacks that could generate excessive AWS costs while maintaining a smooth experience for legitimate users.

#### Multi-Layer Bot Defense Strategy

**Layer 1: Client-Side Proof of Work (PoW)**
- **Required for all API calls**: Before any request to backend, client must solve a computational challenge
- **Implementation**: SHA-256 based proof-of-work requiring ~100-500ms on typical devices
- **Dynamic Difficulty**: Difficulty adjusts based on request type:
  - Login attempts: Medium difficulty (200ms work)
  - File operations (GET/PUT /vault): High difficulty (500ms work)
  - Admin operations: High difficulty (500ms work)
  - Public endpoints: Low difficulty (100ms work)
- **Challenge Format**:
  - Server returns challenge: `{nonce, difficulty, timestamp}`
  - Client finds solution: `SHA256(nonce + solution) < difficulty_target`
  - Client includes solution in request header: `X-PoW-Solution: <solution>`
  - Backend validates solution before processing request
- **Effect on Bots**:
  - Legitimate users: Barely noticeable (100-500ms delay)
  - Bots/Crawlers: Expensive to compute, makes mass requests cost-prohibitive
  - DDoS attacks: Significantly more expensive to execute

**Layer 2: CloudFront Flat-Rate Plan (Edge WAF + DDoS + Bot Management)**
- **Deployed at**: CloudFront edge (all requests pass through before reaching API Gateway)
- **Included in**: CloudFront flat-rate Free plan ($0/month, enrolled in AWS console — not CDK)
- **Protection provided**:
  - AWS-managed WAF with bot control rules
  - DDoS protection (Shield Standard)
  - Bot management and analytics
- **Key property**: Blocked requests do not count against the monthly allowance
- For full details and enrollment instructions, see [BOTPROTECTION.md](BOTPROTECTION.md)

**Layer 3: API Gateway Rate Limiting**
- **Stage-Level Throttling** (configurable per environment in `shared/src/config/environments.ts`):
  - Burst limit: 20 requests per second (default all envs)
  - Steady-state limit: 10 requests per second (default all envs)
  - Exceeding limits returns HTTP 429 (Too Many Requests)
- Throttle values are set via `config.throttle.burstLimit` / `config.throttle.rateLimit`

**Layer 5: Honeypot & Bot Traps**
- **Hidden Form Fields**: CSS-hidden fields that bots fill but humans don't
  - If honeypot field is filled → reject request
  - Example: Hidden "email" field on login form
- **Time-Based Validation**: Track form load → submit time
  - Too fast (< 1 second) → likely bot → require additional verification
  - Too slow (> 10 minutes) → session expired
- **Mouse/Touch Interaction Tracking**: Verify user interacted with page before submission
  - Track click/touch events before form submit
  - If zero interactions → suspicious

**Layer 6: Account Lockout**
- **First–fourth failed login attempt**: Standard 401 error message; `failedLoginAttempts` counter incremented in DynamoDB
- **Fifth failed attempt**: Account locked for 15 minutes; `lockedUntil` set in DynamoDB; subsequent attempts return 429 immediately without password verification
- **Successful login**: Counter reset to 0 and `lockedUntil` cleared

#### Implementation Details

**Frontend (React) Changes:**
```javascript
// PoW solver function
async function solveProofOfWork(challenge) {
  const { nonce, difficulty, timestamp } = challenge;
  let solution = 0;
  const target = BigInt('0x' + '0'.repeat(difficulty) + 'F'.repeat(64 - difficulty));

  while (true) {
    const hash = await sha256(nonce + solution + timestamp);
    if (BigInt('0x' + hash) < target) {
      return solution;
    }
    solution++;
  }
}

// API call wrapper with PoW
async function apiCall(endpoint, options) {
  // Get challenge from server
  const challenge = await fetch('/api/challenge').then(r => r.json());

  // Solve PoW
  const solution = await solveProofOfWork(challenge);

  // Add solution to headers
  options.headers = {
    ...options.headers,
    'X-PoW-Solution': solution,
    'X-PoW-Timestamp': challenge.timestamp,
    'X-PoW-Nonce': challenge.nonce
  };

  // Make actual request
  return fetch(endpoint, options);
}
```

**Backend (Lambda) Changes:**
- New endpoint: `GET /api/challenge` - returns PoW challenge
- All protected endpoints validate PoW solution before processing
- Track failed PoW attempts per IP → escalate to IP block
- Cache challenges in memory (short TTL: 60 seconds)

**Infrastructure Changes:**
- Enroll CloudFront distribution in the flat-rate Free plan (AWS console, one-time)
- Enable API Gateway stage throttling (configured in `shared/src/config/environments.ts`)

#### Cost Analysis

For a detailed bot attack cost analysis including worst-case calculations and defense layer breakdown, see **[BOTPROTECTION.md](BOTPROTECTION.md)**.

**Summary:** CloudFront flat-rate plan (Free) blocks most bot traffic at $0 cost. API Gateway throttling caps the maximum rate of requests reaching the backend to 10 req/s. The concurrency kill switch fires after 3 minutes of sustained traffic and eliminates Lambda invocation costs. Worst-case monthly cost under a sustained bot attack: **~$91** (API Gateway charges for all throttled requests).

### 2.4 User Interface

#### Admin Interface
- **Admin Login Page**: Admin authentication form
- **Admin First-Time Password Change**: Displayed immediately after first admin login
  - Similar to user password change page
  - Password policy requirements display
  - New password field
  - Confirm password field
  - Real-time password policy validation feedback
  - Submit button
- **Admin Passkey Setup Page**: Displayed immediately after password change
  - "Register passkey" button triggers browser WebAuthn dialog (biometric / PIN prompt)
  - Instructions explaining what a passkey is and how it will be used to sign in
  - Cannot proceed until passkey is registered
- **Admin Login Page (after setup)**:
  - Step 1: "Sign in with passkey" button — triggers browser WebAuthn dialog, pre-fills username
  - Step 2: Password field (username pre-filled and read-only)
  - Login button
- **Admin Dashboard** (accessible after passkey is set up):
  - Create new user form (enter username, click to generate OTP)
  - Display generated username and OTP to copy/share with user
  - List of all users showing:
    - Username
    - Status (pending first login / active)
    - Created date
    - Last login date
  - Logout button

#### User Interface
- **Login Page (first time)**: Form to authenticate with OTP (username, password/OTP)
- **Login Page (after setup)**: Two-step authentication form
  - Step 1: "Sign in with passkey" button — triggers browser WebAuthn dialog, pre-fills username
  - Step 2: Password field (username pre-filled and read-only)
  - Login button
  - > **Dev/beta**: Single-step form — username + password fields, no passkey prompt
- **First-Time Password Change**: Displayed immediately after first login with OTP
  - Welcome message
  - Password policy requirements display
  - New password field
  - Confirm password field
  - Real-time password policy validation feedback
  - Submit button
- **Passkey Setup Page**: Displayed immediately after password change (prod only)
  - "Register passkey" button triggers browser WebAuthn dialog (biometric / PIN prompt)
  - Explains that the passkey will be required to sign in going forward
  - Cannot proceed to vault until passkey is registered
- **Vault Page**: Interface with two distinct modes:

  **View Mode (Default):**
  - Read-only text display/viewer showing file content
  - Countdown timer prominently displayed (e.g., "Auto-logout in: 45 seconds")
  - "Edit" button to enter edit mode
  - "Copy to Clipboard" button (copies entire file content or selected text)
  - "Download Encrypted Backup" button (downloads encrypted file + recovery metadata as JSON)
  - "Email Encrypted Backup" button — sends encrypted vault JSON to the user's registered email (beta/prod only; hidden if no email is set)
  - Manual "Logout" button
  - Loading indicator while fetching content

  **Edit Mode (After clicking Edit):**
  - Editable text area displaying file content
  - Countdown timer showing extended time (e.g., "Auto-logout in: 115 seconds")
  - "Save" button to persist changes and logout
  - "Cancel" button to discard changes and logout immediately
  - Visual indicator that edit mode is active (e.g., different background color, "EDIT MODE" label)
  - Warning message: "Changes are not saved automatically. Click Save to persist changes."
  - Confirmation dialog when clicking Cancel: "Are you sure? Unsaved changes will be lost and you will be logged out."
  - Success/error message feedback after save operation

- No file naming, listing, or deletion UI required

### 2.5 Environment Modes

PassVault supports three deployment environments with different security profiles. All environments are isolated CloudFormation stacks sharing no resources.

#### Environment Comparison

| Feature | Dev | Beta | Prod |
|---------|-----|------|------|
| **Purpose** | Developer testing | QA / integration / demos | Live |
| **Passkeys** | Disabled | Disabled | Mandatory |
| **CloudFront flat-rate plan** | N/A | Free (optional) | Free (enroll after deploy) |
| **Proof of Work** | Disabled | Enabled | Enabled |
| **Honeypot** | Enabled | Enabled | Enabled |
| **CloudFront CDN** | Optional (direct S3/APIGW) | Enabled | Enabled |
| **View timeout** | 5 min | 5 min | 60 sec |
| **Edit timeout** | 10 min | 10 min | 120 sec |
| **Admin token expiry** | 24 hours | 24 hours | 8 hours |
| **User token expiry** | 30 min | 30 min | 5 min |
| **OTP expiry** | 60 min | 10 min | 120 min |
| **Email features (SES)** | Disabled | Enabled | Enabled |
| **Lambda memory** | 256 MB | 256 MB | 512 MB |
| **Log retention** | 1 week | 2 weeks | 30 days |
| **DynamoDB PITR** | Disabled | Disabled | Enabled |
| **S3 versioning** | Disabled | Disabled | Enabled |
| **Monitoring** | Disabled (logs only) | Disabled (logs only) | Dashboard + alarms |
| **UI indicator** | "DEV ENVIRONMENT" banner | "BETA ENVIRONMENT" banner | None |
| **Monthly cost** | ~$0 | ~$0 | ~$0-2 |

#### Dev Environment
- **Purpose**: Individual developer testing and local development
- **Passkeys**: Disabled — status goes directly from "pending_first_login" → "active" after password change
- **Proof of Work**: Disabled — faster iteration
- **CloudFront**: Optional — can access API Gateway directly
- **Session timeouts**: Relaxed (5 min view, 10 min edit)
- **Token expiry**: Relaxed (24h admin, 30m user)
- **Visual indicator**: "DEV ENVIRONMENT" banner in the UI
- **DynamoDB**: No point-in-time recovery
- **S3**: No versioning

#### Beta Environment
- **Purpose**: QA, integration testing, stakeholder demos
- **Passkeys**: Disabled — same simplified flow as dev
- **Proof of Work**: Enabled — validates PoW flow works correctly
- **CloudFront**: Enabled — matches prod architecture
- **Session timeouts**: Relaxed (5 min view, 10 min edit)
- **Token expiry**: Relaxed (24h admin, 30m user)
- **Visual indicator**: "BETA ENVIRONMENT" banner in the UI

#### Production Environment
- **Purpose**: Live deployment with full security
- **Passkeys**: Mandatory — all users and admin must register a passkey after password change
- **CloudFront flat-rate plan**: Enrolled (AWS console) — provides edge WAF + DDoS + bot management at $0
- **Proof of Work**: Enabled with production difficulty levels
- **CloudFront**: Enabled
- **Session timeouts**: Strict (60s view, 120s edit)
- **Token expiry**: Strict (8h admin, 5m user)
- **Visual indicator**: None

#### Environment Configuration

All environment differences are driven by a single `EnvironmentConfig` type. The environment is determined by:
- **CDK**: `--context env=dev|beta|prod`
- **Backend**: `ENVIRONMENT` Lambda environment variable
- **Frontend**: `VITE_ENVIRONMENT` build-time environment variable

## 3. Technical Architecture

### 3.1 Frontend
- **Framework**: React (latest stable version)
- **State Management**:
  - React hooks (useState, useEffect, useContext for auth state)
  - View mode vs Edit mode state
  - Auto-logout timer management (setInterval for countdown)
  - Unsaved changes tracking
  - Encryption key management (derived from password, held in memory during session)
- **HTTP Client**: Fetch API or Axios
- **Styling**: Tailwind CSS v4
- **Routing**: React Router (or simple conditional rendering for login/register/editor views)
- **Client-Side Encryption**:
  - **Cryptography Library**: Web Crypto API (native browser support)
  - **Key Derivation**: Argon2id for deriving encryption keys from passwords
  - **Symmetric Encryption**: AES-256-GCM for file content encryption/decryption
  - **Key Management**: Encryption key derived at login, held in memory (never persisted)
  - **Automatic Operations**: Encrypt before PUT /vault, decrypt after GET /vault
- **Client-Side Session Management**:
  - Countdown timer implementation (60s view mode, 120s edit mode)
  - Automatic logout when timer reaches zero
  - Timer reset logic when entering edit mode
  - Clear encryption key from memory on logout
  - Warning before logout (optional)

### 3.2 Backend
- **API Gateway**: AWS API Gateway (REST API)
- **Compute**: AWS Lambda functions (Node.js runtime)
- **Storage**: AWS S3 bucket for text file storage
- **Authentication**: JWT-based auth with Lambda middleware
- **CORS**: `Access-Control-Allow-Origin` set to CloudFront domain in beta/prod; `*` in dev — driven by `FRONTEND_ORIGIN` Lambda environment variable set at deploy time
- **Bot Protection**: CloudFront flat-rate plan (edge WAF + DDoS + bot management) — see [BOTPROTECTION.md](BOTPROTECTION.md)
- **CDN** (Optional): CloudFront for static content delivery
- **Rate Limiting**: API Gateway throttling + usage plans

### 3.3 Architecture Diagram
```
                    ┌──────────────┐
                    │   Browser    │
                    │   (React)    │
                    └──────┬───────┘
                           │ HTTPS
                           ▼
                    ┌──────────────┐
                    │  CloudFront  │◄──── CDN + Static hosting
                    │  Flat-Rate   │      Edge WAF + DDoS + Bot mgmt
                    │    Plan      │      (enrolled in AWS console)
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ API Gateway  │◄──── Throttling, PoW Validation
                    │  + Auth      │      Usage Plans
                    └──────┬───────┘
                           │
                           ▼
┌─────────────┐    ┌──────────────┐      ┌─────────────┐
│  DynamoDB   │◄───┤   Lambda     │◄────►│  S3 Bucket  │
│(users table)│    │  Functions   │      │(user files) │
└─────────────┘    │  + PoW Check │      └─────────────┘
                   └──────────────┘

Protection Layers:
1. Client-side: PoW computation (deters mass requests)
2. CloudFront edge: Bot detection, DDoS, WAF (flat-rate plan)
3. API Gateway: Stage throttling (10 req/s sustained, 20 burst)
4. Lambda: PoW validation, authentication, authorization
5. Kill switch: auto-fires after 3 min sustained throttle (prod only)
```

## 4. API Design

### 4.1 Public Endpoints (Bot Protection)

- **GET /api/challenge**
  - Request: None
  - Response: `{ "nonce": "string", "difficulty": "number", "timestamp": "number", "ttl": 60 }`
  - Returns a proof-of-work challenge that client must solve
  - Nonce: Random 32-byte hex string
  - Difficulty: Number of leading zeros required in hash (0-16, higher = harder)
  - Timestamp: Server timestamp for replay prevention
  - TTL: Challenge valid for 60 seconds
  - **No authentication required** - public endpoint
  - **Rate limited**: 100 requests per minute per IP
  - Challenge response cached and reused for same IP (avoid regeneration spam)

- **GET /api/health**
  - Request: None
  - Response: `{ "status": "ok" }`
  - Health check endpoint for monitoring
  - **No PoW required** for this endpoint
  - Rate limited: 10 requests per minute per IP

**PoW Validation (All Protected Endpoints):**
- All endpoints below require proof-of-work validation
- Client must include headers:
  - `X-PoW-Solution`: Solution integer that satisfies challenge
  - `X-PoW-Nonce`: Original nonce from challenge
  - `X-PoW-Timestamp`: Original timestamp from challenge
- Backend validates: `SHA256(nonce + solution + timestamp)` has required difficulty
- If PoW invalid or missing: Return 403 Forbidden with `{ "error": "Invalid proof of work" }`
- If challenge expired (> 60 seconds old): Return 403 with `{ "error": "Challenge expired" }`

### 4.2 Admin Endpoints

- **GET /api/admin/passkey/challenge**
  - Response: `{ "challengeJwt": "string" }` — signed JWT containing the WebAuthn challenge bytes
  - No auth required; no PoW required

- **POST /api/admin/passkey/verify** (PoW HIGH + honeypot)
  - Request: `{ "challengeJwt": "string", "assertion": PasskeyAssertionJSON }`
  - Response: `{ "passkeyToken": "string", "username": "string", "encryptionSalt": "string" }`
  - Verifies the passkey assertion against the stored credential
  - Returns a short-lived passkey token (5 min) encoding the userId; used with POST /admin/login

- **POST /api/admin/login** (PoW HIGH + honeypot)
  - Request (prod): `{ "passkeyToken": "string", "password": "string" }` — passkeyToken identifies the admin
  - Request (dev/beta): `{ "username": "string", "password": "string" }` — direct username+password
  - Response:
    - First-time login: `{ "token": "string", "role": "admin", "requirePasswordChange": true, "encryptionSalt": "string (base64)" }`
    - After password change (prod): `{ "token": "string", "role": "admin", "requirePasskeySetup": true, "encryptionSalt": "string (base64)" }`
    - Active login: `{ "token": "string", "role": "admin", "encryptionSalt": "string (base64)" }`
  - Returns JWT token with admin role and encryption salt for key derivation
  - Flags if password change or passkey setup is required

- **POST /api/admin/change-password** (Requires admin auth)
  - Request: `{ "newPassword": "string" }`
  - Response: `{ "success": true }` or error with policy violations
  - Validates new password against security policy
  - Updates admin password; sets status to "pending_passkey_setup" (prod) or "active" (dev/beta)

- **GET /api/admin/passkey/register/challenge** (Requires admin auth, status must be "pending_passkey_setup")
  - Response: `{ "challengeJwt": "string" }`

- **POST /api/admin/passkey/register** (Requires admin auth, status must be "pending_passkey_setup", PoW HIGH)
  - Request: `{ "challengeJwt": "string", "attestation": PasskeyAttestationJSON }`
  - Response: `{ "success": true }`
  - Verifies and stores the passkey credential; changes admin status to "active"

> **Passkey endpoints (dev/beta)**: When `passkeyRequired=false`, the passkey challenge/verify/register endpoints are still deployed but will not be exercised by the UI. POST /admin/login accepts `username` + `password` directly.

- **POST /api/admin/users** (Requires admin auth, blocked if admin status is not "active")
  - Request: `{ "username": "string", "email"?: "string" }` — `email` is optional; beta/prod only (ignored in dev)
  - Response: `{ "success": true, "username": "string", "oneTimePassword": "string", "userId": "string" }`
  - Creates new user invitation
  - Generates secure random one-time password (min 16 characters) with per-environment expiry (dev=60min, beta=10min, prod=120min)
  - Generates unique encryption salt for user (256-bit random, base64)
  - Creates empty encrypted S3 file for user (encrypted with temporary key or empty blob)
  - User status set to "pending_first_login"
  - If `email` is provided and SES is configured, sends OTP + expiry notice to the user's inbox
  - Returns OTP to display to admin in the UI (always, regardless of email delivery)

- **GET /api/admin/users** (Requires admin auth, blocked if admin status is not "active")
  - Response: `{ "users": [{ "userId": "string", "username": "string", "email": "string | null", "status": "string", "createdAt": "timestamp", "lastLoginAt": "timestamp", "vaultSizeBytes": number | null }] }`
  - Returns list of all users with their status (pending_first_login / pending_passkey_setup / active), email, and current vault file size

- **POST /api/admin/users/refresh-otp** (Requires admin auth, blocked if admin status is not "active")
  - Request: `{ "userId": "string" }`
  - Response: `{ "success": true, "oneTimePassword": "string" }`
  - Generates a new OTP for a user whose status is `pending_first_login` (e.g. OTP expired or was lost)
  - Returns 400 if user is not in `pending_first_login` state
  - If the user has an email address and SES is configured, sends new OTP + expiry notice by email
  - Returns new OTP to admin in the UI (always)

- **DELETE /api/admin/users?userId=** (Requires admin auth, blocked if admin status is not "active")
  - Deletes a user whose status is `pending_first_login`
  - Returns 400 if user is not in `pending_first_login` state
  - Removes the DynamoDB user record and the S3 vault file (`user-{userId}.enc`)
  - Response: `{ "success": true }`

### 4.3 User Authentication Endpoints

- **GET /api/auth/passkey/challenge**
  - Response: `{ "challengeJwt": "string" }`
  - No auth required; no PoW required

- **POST /api/auth/passkey/verify** (PoW MEDIUM + honeypot)
  - Request: `{ "challengeJwt": "string", "assertion": PasskeyAssertionJSON }`
  - Response: `{ "passkeyToken": "string", "username": "string", "encryptionSalt": "string" }`

- **POST /api/auth/login** (PoW MEDIUM + honeypot)
  - Request (prod): `{ "passkeyToken": "string", "password": "string" }` — passkeyToken from verify step
  - Request (dev/beta): `{ "username": "string", "password": "string" }` — direct
  - Response:
    - First-time login (with OTP): `{ "token": "string", "requirePasswordChange": true, "username": "string", "encryptionSalt": "string (base64)" }`
    - After password change (prod): `{ "token": "string", "requirePasskeySetup": true, "username": "string", "encryptionSalt": "string (base64)" }`
    - Active login: `{ "token": "string", "username": "string", "encryptionSalt": "string (base64)" }`
  - Returns JWT token with user ID and role, plus encryption salt for key derivation

- **POST /api/auth/change-password** (Requires user auth)
  - Request: `{ "newPassword": "string" }`
  - Response: `{ "success": true }` or error with policy violations
  - Validates new password against security policy
  - Updates user password; sets status to "pending_passkey_setup" (prod) or "active" (dev/beta)

- **GET /api/auth/passkey/register/challenge** (Requires user auth, status must be "pending_passkey_setup")
  - Response: `{ "challengeJwt": "string" }`

- **POST /api/auth/passkey/register** (Requires user auth, status must be "pending_passkey_setup", PoW MEDIUM)
  - Request: `{ "challengeJwt": "string", "attestation": PasskeyAttestationJSON }`
  - Response: `{ "success": true }`
  - Verifies and stores the passkey credential; changes user status to "active"

> **Passkey endpoints (dev/beta)**: When `passkeyRequired=false`, the passkey challenge/verify/register endpoints are still deployed but will not be exercised by the UI. POST /auth/login accepts `username` + `password` directly.

- **POST /api/auth/email/change** (Requires user auth; beta/prod only)
  - Request: `{ "newEmail": "string", "password": "string" }` — password confirmation is required to initiate the change
  - Response: `{ "success": true }` — SES sends a 6-digit verification code to `newEmail`
  - Returns 400 `EMAIL_CHANGE_NOT_AVAILABLE` in dev (feature disabled)
  - Returns 503 if `SENDER_EMAIL` env var is not set

- **POST /api/auth/email/verify** (Requires user auth; beta/prod only)
  - Request: `{ "code": "string" }` — the 6-digit code sent to the new address
  - Response: `{ "success": true }` — updates the `email` field on the user record
  - Returns 400 `EMAIL_VERIFICATION_INVALID` if the code is wrong or expired
  - Returns 400 `EMAIL_CHANGE_NOT_AVAILABLE` in dev

### 4.4 File Operations (Protected Endpoints)
All endpoints require user authentication via Authorization header (Bearer token).

- **GET /vault**
  - Response: `{ "encryptedContent": "string (base64)", "lastModified": "timestamp" }`
  - Returns the authenticated user's **encrypted** file content
  - Content is encrypted by client before storage, server returns encrypted blob
  - Client decrypts content using key derived from user's password
  - User ID extracted from auth token
  - Blocked if user status is not "active" (must complete password change and passkey setup)

- **PUT /vault**
  - Request: `{ "encryptedContent": "string (base64)" }`
  - Response: `{ "success": true, "lastModified": "timestamp" }`
  - Stores the authenticated user's **encrypted** file content
  - Client encrypts content using key derived from user's password before sending
  - Server stores encrypted blob without decryption
  - User ID extracted from auth token ensures users can only update their own file
  - Blocked if user status is not "active" (must complete password change and passkey setup)

- **GET /api/vault/download**
  - Response: `{ "encryptedContent": "string (base64)", "encryptionSalt": "string (base64)", "algorithm": "argon2id+aes-256-gcm", "parameters": { "argon2": { "memory": 65536, "iterations": 3, "parallelism": 4, "hashLength": 32 }, "aes": { "keySize": 256, "ivSize": 96, "tagSize": 128 } }, "lastModified": "timestamp", "username": "string" }`
  - Returns complete recovery package with encrypted file and all metadata needed for offline decryption
  - Includes: encrypted content, salt, algorithm details, Argon2id + AES parameters (nested)
  - User ID extracted from auth token
  - Blocked if user status is not "active"

- **POST /api/vault/email** (Requires user auth; beta/prod only)
  - Request: none (no body required)
  - Response: `{ "success": true }` — sends the encrypted vault JSON (same payload as `/vault/download`) to the user's registered email address
  - Returns 400 `NO_EMAIL_ADDRESS` if the user has no email on record
  - Returns 503 if `SENDER_EMAIL` env var is not set
  - Returns 400 `EMAIL_CHANGE_NOT_AVAILABLE` in dev (feature disabled)
  - Blocked if user status is not "active"

## 5. Data Model

### 5.1 DynamoDB Users Table
```
Table: passvault-users
Primary Key: userId (String)

Attributes:
- userId: unique identifier (UUID)
- username: unique username (String, GSI)
- passwordHash: bcrypt hashed password (String) - initially stores OTP hash, replaced after first login
- role: user role (String) - "admin" or "user"
- status: account status (String) - "pending_first_login", "pending_passkey_setup", or "active"
- oneTimePasswordHash: bcrypt hash of OTP (String, nullable) - cleared after first successful password change
- passkeyCredentialId: WebAuthn credential ID (String, base64url, nullable) - set during passkey registration
- passkeyPublicKey: COSE-encoded public key (String, base64url, nullable) - set during passkey registration
- passkeyCounter: signature counter for replay protection (Number) - updated on every login
- passkeyTransports: list of transport hints (List of Strings, nullable) - e.g. ["internal"]
- passkeyAaguid: authenticator attestation GUID (String, nullable) - for auditing only
- encryptionSalt: salt for password-based key derivation (String, base64) - unique per user, generated at user creation
- createdAt: timestamp (String/Number)
- lastLoginAt: timestamp (String/Number)
- createdBy: userId of admin who created this user (String, nullable)
- email: optional email address for the user (String, nullable) - provided by admin at user creation; used for OTP delivery and vault email
- otpExpiresAt: ISO timestamp when the one-time password expires (String, nullable) - set at user creation; cleared after first password change
- failedLoginAttempts: count of consecutive failed logins (Number) - reset to 0 on successful login
- lockedUntil: ISO timestamp until which the account is locked (String, nullable) - set after 5 consecutive failures
```

Global Secondary Index (GSI):
- Index Name: username-index
- Partition Key: username
- Used for login lookups

**Admin User Initialization:**
- Exactly one admin user is created during deployment/initialization
- Admin user attributes:
  - username: "admin" (or configurable)
  - passwordHash: bcrypt hash of initial password
  - role: "admin"
  - status: "pending_first_login"
  - oneTimePasswordHash: null (or same as passwordHash)
  - passkeyCredentialId: null (set during passkey registration)
  - passkeyPublicKey: null (set during passkey registration)
  - passkeyCounter: 0
  - passkeyTransports: null
  - passkeyAaguid: null
  - encryptionSalt: randomly generated 256-bit salt (base64)
- Initial admin password is generated by `scripts/init-admin.ts` and printed to console only
  - The OTP is never stored at rest — save it from the console output during initialization
  - This establishes the root of trust: AWS account access (to run the init script) → admin access

### 5.2 S3 Storage Structure
```
s3://passvault-files/
  ├── user-{userId-1}.enc
  ├── user-{userId-2}.enc
  └── user-{userId-3}.enc
```

- Files stored with naming pattern: `user-{userId}.enc`
- Each file corresponds to exactly one user
- **Files contain encrypted content only** - server cannot decrypt without user's password
- File created automatically when admin creates user invitation (empty encrypted blob)
- File metadata (lastModified) retrieved from S3 object metadata
- Filename is never exposed to users
- Extension `.enc` indicates encrypted content

### 5.3 Password Policy

**Secure Password Requirements:**
- Minimum length: 12 characters
- Must contain at least:
  - 1 uppercase letter (A-Z)
  - 1 lowercase letter (a-z)
  - 1 number (0-9)
  - 1 special character (!@#$%^&*()_+-=[]{}|;:,.<>?)
- Cannot contain the username
- Cannot contain common patterns (e.g., "password", "12345")
- Validated on both frontend (real-time feedback) and backend (enforcement)

**One-Time Password (OTP) Generation:**
- System-generated random password
- Minimum 16 characters
- Mix of uppercase, lowercase, numbers, and special characters
- Cryptographically secure random generation
- Single use only - invalidated after successful password change

## 6. Security Considerations

### 6.1 Encryption (Post-Quantum Safe)

**Encryption Architecture:**
- **End-to-End Encryption**: All file content is encrypted on the client before transmission to server
- **Zero-Knowledge**: Server never has access to plaintext content or encryption keys
- **Password-Based Encryption**: Encryption key derived from user's password (not stored anywhere)
- **Admin Isolation**: Admin cannot decrypt user files - encryption uses user's password, not admin's password
- **Per-User Keys**: Each user has unique encryption salt and password-derived key
- **Complete Privacy**: Even system administrators with full AWS access cannot read user data

**Cryptographic Algorithms (Post-Quantum Resistant):**
- **Key Derivation Function (KDF)**: Argon2id
  - Memory-hard algorithm (resistant to GPU/ASIC attacks and quantum computers)
  - Parameters: memory=64MB, iterations=3, parallelism=4 (adjustable based on performance)
  - Derives 256-bit encryption key from password + salt
  - Salt: unique per user, stored unencrypted in DynamoDB or as S3 metadata
- **Symmetric Encryption**: AES-256-GCM
  - 256-bit keys provide quantum resistance (Grover's algorithm only provides quadratic speedup)
  - GCM mode provides authenticated encryption (prevents tampering)
  - Random IV (Initialization Vector) generated for each encryption operation
  - IV stored alongside ciphertext

**Encryption Process:**
1. User enters password at login
2. Client derives encryption key: `key = Argon2id(password, salt, params)`
3. Key held in memory for session duration (never persisted to localStorage/sessionStorage)
4. On file save:
   - Generate random 96-bit IV
   - Encrypt: `ciphertext = AES-256-GCM(plaintext, key, IV)`
   - Store: `{IV + ciphertext}` as base64-encoded blob
5. On file load:
   - Retrieve encrypted blob
   - Extract IV and ciphertext
   - Decrypt: `plaintext = AES-256-GCM-decrypt(ciphertext, key, IV)`
6. On logout: clear encryption key from memory

**Password Change Handling:**
1. User authenticated with old password (derives old key)
2. User sets new password
3. Before logout:
   - Fetch encrypted file (using old key to decrypt)
   - Derive new key from new password
   - Re-encrypt file with new key
   - Upload re-encrypted file
   - Update password hash in DynamoDB
4. Logout and clear old key from memory

**Storage of Encryption Metadata:**
- **Salt**: Stored per-user in DynamoDB `encryptionSalt` field (base64, not secret)
- **IV**: Prepended to ciphertext in encrypted blob (not secret, but must be unique per encryption)
- **Key**: NEVER stored, always derived from password on-demand

**Post-Quantum Considerations:**
- AES-256 with 256-bit keys: Quantum computers using Grover's algorithm reduce effective security to 128-bit, which is still considered secure
- Argon2id: Memory-hard function resistant to both classical and quantum attacks
- For additional post-quantum protection, could implement ML-KEM (CRYSTALS-Kyber) for key encapsulation in future

### 6.2 Authentication
- All passwords (user and OTP) must be hashed using bcrypt (minimum 12 rounds)
- OTPs have a per-environment expiry stored in `otpExpiresAt`; login returns 401 `OTP_EXPIRED` if the OTP is presented after expiry
- Use HTTPS for all communication (enforced at API Gateway)
- Implement token expiration:
  - Admin tokens: 8 hours
  - User tokens: 5 minutes (short-lived due to sensitive data)
  - First-login tokens: 1 hour (until password changed)
- **Client-Side Session Timeouts** (additional security layer):
  - View mode: 60 seconds auto-logout with visible countdown
  - Edit mode: 120 seconds auto-logout with visible countdown
  - Timer enforced on frontend, user logged out when timer expires
  - Clear all session data and redirect to login on timeout
- Rate limiting on all login endpoints (prevent brute force)
  - Max 5 failed attempts per username per 15 minutes (DynamoDB-persisted counter)
  - After 5 failures: account locked for 15 minutes (flat lockout, stored in `lockedUntil`)
  - Lockout returns HTTP 429; counter and lock reset on successful login
- Validate password strength against policy on backend
- OTP must be securely generated and only displayed once to admin
- OTP is invalidated after first successful password change
- **Passkeys (WebAuthn/FIDO2 — Two-Factor Authentication)**:
  - Uses `@simplewebauthn/server` for credential verification and registration
  - WebAuthn challenges are encoded in short-lived signed JWTs (5-minute expiry, same JWT secret as session tokens)
  - Passkey tokens (issued after successful assertion) are short-lived JWTs (5-minute expiry) containing userId
  - Signature counter checked on every login to detect cloned credentials (replay protection)
  - One passkey per user; re-registration overwrites the existing credential
  - Mandatory for all users and admin after initial password setup (prod only)
  - `PASSKEY_RP_ID` and `PASSKEY_ORIGIN` environment variables configure the relying party for each deployment

### 6.3 Admin Isolation - Zero Access to User Data

**Critical Security Property: Admin Cannot Access User Files**

PassVault implements **complete separation** between admin privileges and user data access:

✅ **What Admin CAN Do:**
- Create user accounts (username + OTP generation)
- View user metadata (username, status, timestamps)
- Manage user lifecycle (create invitations, view status)
- Access their own admin vault (encrypted with admin's password)

❌ **What Admin CANNOT Do:**
- Read user file content (even encrypted content is useless without password)
- Decrypt user files (encryption keys derived from user passwords, not admin password)
- Recover forgotten user passwords (no password reset, only OTP regeneration for new accounts)
- Access user data through AWS/backend (S3 files are encrypted client-side)

**Why This Matters:**
- **User Privacy**: Users have complete privacy, even from administrators
- **Zero-Knowledge**: Admin never knows user passwords or encryption keys
- **Principle of Least Privilege**: Admin role limited to user management, not data access
- **Compliance**: Meets privacy requirements where even admins cannot access user data

**Password Flow Ensures Isolation:**
1. Admin generates OTP (temporary, single-use)
2. User logs in with OTP
3. User immediately sets personal password (admin never sees this)
4. Encryption key derived from user's personal password
5. Admin does NOT know user's password → Admin CANNOT decrypt files

**Exception:**
- Admin CAN access user data ONLY IF they somehow obtain the user's password
- This would require social engineering or password disclosure (not a system vulnerability)

### 6.4 Authorization
- **Trust Model**:
  - Root of trust: AWS account access with DynamoDB write permissions (to run `scripts/init-admin.ts`)
  - Initial admin password printed to console by the init script — never stored at rest
  - After first admin login and password change, admin access is controlled by the chosen password

- **Role-Based Access Control (RBAC)**:
  - Admin role: access to /api/admin/* endpoints
  - User role: access to /api/vault endpoints
  - JWT token includes role claim
  - Single admin account only (enforced at application level)

- **User Authorization**:
  - All /api/vault endpoints require valid user authentication (passkey + password in prod)
  - User ID extracted from JWT token, never from request body
  - Vault operations blocked if user status is not "active"
  - User must complete both password change and passkey setup before accessing vault
  - **Critical**: Users can ONLY access files matching their user ID
    - GET /vault → reads `user-{tokenUserId}.enc`
    - PUT /vault → writes `user-{tokenUserId}.enc`

- **Admin Authorization**:
  - All /api/admin/* endpoints (except login, passkey/challenge, passkey/verify, change-password, passkey/register/*) require valid admin authentication
  - JWT token must have role="admin"
  - Admin operations (create users, list users) blocked if admin status is not "active"
  - Admin must complete both password change and passkey setup before accessing admin functions
  - Verify admin role and status before any user management operations

### 6.5 DynamoDB Security
- Username must be unique (enforced via GSI)
- Passwords stored as bcrypt hashes, never plain text
- Passkey public keys stored per user (public key material only, never private keys)
- **Encryption salts** stored per user (not secret, used for key derivation)
- Enable DynamoDB encryption at rest
- Lambda IAM role has permissions: GetItem, PutItem, Query, UpdateItem on users table

### 6.6 S3 Security

**User Files Bucket (passvault-files):**
- S3 bucket not publicly accessible
- Block all public access settings enabled
- Lambda IAM role has minimal permissions: GetObject, PutObject on specific bucket
- No ListBucket permission needed (prevents users from discovering other files)
- CORS configuration to allow only frontend domain
- **Client-side encryption**: Files already encrypted before upload (end-to-end encryption)
- **Optional S3 encryption at rest** (SSE-S3 or SSE-KMS) provides additional layer (defense in depth)
- Server/AWS never has access to plaintext content

### 6.7 Input Validation
- **Username Validation**:
  - Alphanumeric characters only (a-z, A-Z, 0-9) plus underscore and hyphen
  - Length: 3-30 characters (enforced in service layer before DynamoDB lookup)
  - Must be unique (checked against DynamoDB GSI)
  - Prevent injection attacks in S3 key construction
- **Password Validation**:
  - Maximum length: 1,024 characters (enforced in service layer before DynamoDB lookup)
  - Enforce password policy (see section 5.3) on backend
  - Return specific validation errors (e.g., "missing uppercase letter")
  - Frontend provides real-time validation feedback
- **File Content Validation**:
  - Limit file content size (max 1MB per text file)
  - Sanitize text content on frontend and backend (prevent XSS if content is ever rendered as HTML)
- **General**:
  - Validate all JWT tokens for expiration and signature
  - Sanitize all user inputs before database operations

### 6.8 Bot Protection & DDoS Mitigation

**Critical Security Requirement**: Protect against automated attacks that could:
- Generate excessive AWS costs (thousands of dollars per day)
- Overwhelm backend services (denial of service)
- Attempt credential stuffing or brute force attacks
- Scrape or enumerate user accounts

**Defense-in-Depth Strategy** (See Section 2.3 for full details):

**Layer 1: Client-Side Proof of Work**
- ✅ **Makes bot attacks computationally expensive**
- ✅ **No impact on legitimate users** (~100-500ms delay barely noticeable)
- ✅ **Zero AWS cost** (computation done on attacker's hardware)
- ❌ Can be bypassed by determined attackers with compute resources
- **Implementation**: SHA-256 based challenge with dynamic difficulty

**Layer 2: CloudFront Flat-Rate Plan (Primary Defense)**
- ✅ **Blocks bot traffic at the edge** before reaching API Gateway
- ✅ **Prevents Lambda invocation costs** from bot requests
- ✅ **CAPTCHA challenges** for suspected bots (user-solvable, bot-hard)
- ✅ **Geographic blocking** (optional: restrict to specific countries)
- ✅ **Automatic IP reputation** checks (AWS threat intelligence)
- ⚠️ **Cost**: ~$5-10/month baseline + $1 per million requests
- **ROI**: Saves $100-1000s/month in bot-driven Lambda costs

**Layer 3: API Gateway Rate Limiting**
- ✅ **Hard limits** prevent burst attacks (20 req/sec per IP)
- ✅ **Usage plans** separate admin/user quotas
- ✅ **Built-in throttling** (no additional Lambda code needed)
- ❌ Only helps after WAF layer (doesn't prevent WAF costs)

**Layer 4: Honeypot & Behavioral Analysis**
- ✅ **Zero-cost bot detection** (hidden form fields, timing)
- ✅ **High accuracy** for simple bots (form auto-fillers, scrapers)
- ❌ Ineffective against sophisticated bots

**Layer 5: Progressive Challenge Escalation**
- ✅ **Adaptive security** increases friction only for suspicious activity
- ✅ **Good UX** for legitimate users (no friction on first attempt)
- ✅ **Effective against brute force** (exponential backoff)

**Attack Scenarios & Protections:**

| Attack Type | Protection | Result |
|-------------|-----------|--------|
| **Mass login attempts** (10k/min) | CloudFront WAF + API GW throttle + PoW | Blocked at CloudFront, ~$0 Lambda cost |
| **DDoS to API Gateway** (100k/min) | CloudFront flat-rate plan (WAF + DDoS) | Blocked before API Gateway, $0 Lambda cost |
| **Slow credential stuffing** (10/min) | PoW + honeypot + progressive challenges | Expensive for attacker |
| **Legitimate traffic spike** (100/min) | API GW throttle returns 429, PoW still works | Users may see slowdowns but can proceed |
| **Sustained bot attack** (>550/min × 3 min) | Concurrency kill switch → all Lambdas → 0 | API GW returns 429; auto-recovers in 4 hours |

**Cost Comparison:**

For detailed bot attack cost calculations, see **[BOTPROTECTION.md](BOTPROTECTION.md)**.

**Summary:**
- Without protection: ~$2,300+/month (full Lambda invocations at 10k req/min)
- With CloudFront flat-rate plan + API GW throttle: **~$91/month worst case** (API GW charges for all throttled requests; Lambda cost eliminated by kill switch within 3 minutes)
- With CloudFront WAF blocking ≥99% of bots: **< $1/month realistic**

**Security Recommendations:**
1. **Enroll CloudFront flat-rate plan** — $0/month, provides WAF + DDoS at edge (see [BOTPROTECTION.md](BOTPROTECTION.md))
2. **Enable PoW on all protected endpoints** — free protection layer
3. **Set up cost alerts** — notify if Lambda costs exceed $10/day
4. **Test rate limits** — verify legitimate users aren't blocked during normal usage
5. **Document escalation** — plan for sustained attacks

### 6.9 Error Codes

All error responses follow the shape `{ "success": false, "error": "<CODE>", "message": "..." }`. The following application-level error codes are defined:

| Code | HTTP | Meaning |
|---|---|---|
| `OTP_EXPIRED` | 401 | The one-time password was presented after its expiry time (`otpExpiresAt`). Admin must use Refresh OTP. |
| `NO_EMAIL_ADDRESS` | 400 | The requested email operation (vault email) requires an email address, but none is stored for this user. |
| `EMAIL_VERIFICATION_INVALID` | 400 | The 6-digit code submitted to `POST /auth/email/verify` is incorrect or has expired. |
| `EMAIL_CHANGE_NOT_AVAILABLE` | 400 | Email change/verification endpoints are only available in beta and prod; called from dev. |

---

## 7. Deployment

### 7.1 Frontend
- Build React app for production
- Host on **AWS S3 + CloudFront** (deployed via CDK)
  - Static hosting on S3
  - CloudFront CDN for global distribution (with flat-rate plan for edge protection)
  - HTTPS with TLS 1.2+
  - Automatic cache invalidation on deployment

### 7.2 Backend
- Deploy Lambda functions via **AWS CDK (Cloud Development Kit)**
  - Infrastructure as Code using TypeScript
  - Type-safe infrastructure definitions
  - Automated CloudFormation stack generation
  - Built-in best practices and constructs
  - See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment guide

### 7.3 Infrastructure as Code (AWS CDK)
- All infrastructure defined in TypeScript using AWS CDK
- CDK Stack components:
  - **StorageConstruct**: DynamoDB tables, S3 buckets (PITR and versioning conditional on environment)
  - **BackendConstruct**: Lambda functions, API Gateway with configurable throttle (memory/timeout from config)
  - **FrontendConstruct**: CloudFront distribution, S3 static hosting (CloudFront optional for dev)
  - **MonitoringConstruct**: CloudWatch alarms, dashboards, SNS alert topic (**prod only**)
  - **KillSwitchConstruct**: Kill switch Lambda (sets concurrency to 0 on sustained-traffic alarm) + re-enable Lambda (restores concurrency via EventBridge Scheduler after 4 hours) (**prod only**)
- Three environments via CDK contexts: `--context env=dev|beta|prod`
- Each environment deploys as a fully isolated CloudFormation stack (see Section 7.5)
- Environment configs defined in single file: `shared/src/config/environments.ts`

**CDK Entry Point:**
```typescript
// bin/passvault.ts
const app = new cdk.App();
const env = app.node.tryGetContext('env');
if (!env) throw new Error('Missing required context: --context env=dev|beta|prod');
const config = getEnvironmentConfig(env);
new PassVaultStack(app, config.stackName, config, { env: { region: config.region } });
```

- Automated deployment via `cdk deploy` command
- See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment guide

### 7.4 Stack Naming and Isolation

Each environment deploys as a fully independent CloudFormation stack:

| Resource              | Dev                            | Beta                           | Prod                          |
|-----------------------|--------------------------------|--------------------------------|-------------------------------|
| Stack name            | PassVault-Dev                  | PassVault-Beta                 | PassVault-Prod                |
| DynamoDB table        | passvault-users-dev            | passvault-users-beta           | passvault-users-prod          |
| S3 files bucket       | passvault-files-dev-{hash}     | passvault-files-beta-{hash}    | passvault-files-prod-{hash}   |
| S3 frontend bucket    | passvault-frontend-dev-{hash}  | passvault-frontend-beta-{hash} | passvault-frontend-prod-{hash}|
| API Gateway           | passvault-api-dev              | passvault-api-beta             | passvault-api-prod            |
| CloudFront            | *(optional)*                   | passvault-cdn-beta             | passvault-cdn-prod            |
| Lambda functions      | passvault-{fn}-dev             | passvault-{fn}-beta            | passvault-{fn}-prod           |

Stacks share nothing — they can be deployed and destroyed independently.

### 7.5 Initial Deployment Setup
- **Admin Account Creation**:
  - Run `ENVIRONMENT=<env> npx tsx scripts/init-admin.ts` after CDK deployment
  - Creates admin user in DynamoDB with username="admin", role="admin", status="pending_first_login"
  - Generates a secure random one-time password (16+ characters) and prints it to the console
  - The OTP is **not** stored in S3 — save it securely from the console output
- **Post-Deployment Steps**:
  - Run the init-admin script and note the one-time password printed to console
  - Admin logs in with the one-time password
  - Admin immediately changes password to a secure personal password

## 8. Development Phases

### Phase 1: MVP
- [ ] **Define environment configuration system**:
  - Define `EnvironmentConfig` type in `shared/config/environments.ts`
  - Create dev, beta, and prod config objects with feature flags (see Section 2.5)
  - Pass environment to Lambda via `ENVIRONMENT` env var
  - Pass environment to frontend via `VITE_ENVIRONMENT` build-time var
- [ ] **Setup AWS CDK project structure**:
  - Initialize CDK app with TypeScript
  - Define main PassVaultStack
  - Create construct library (Storage, Backend, Security, Frontend, Monitoring)
  - Configure environment-specific settings (dev, beta, prod) — see Section 2.5
  - See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed structure
- [ ] **Implement CDK Constructs (environment-aware)**:
  - StorageConstruct: DynamoDB users table, S3 buckets (PITR and versioning conditional on environment)
  - BackendConstruct: Lambda functions, API Gateway, IAM roles (memory/timeout from config)
  - FrontendConstruct: CloudFront distribution, S3 static hosting, OAI (CloudFront optional for dev)
  - MonitoringConstruct: CloudWatch alarms, dashboards, SNS alert topic (prod only)
  - KillSwitchConstruct: Lambda concurrency kill switch + EventBridge Scheduler auto-recovery (prod only)
- [x] **Setup bot protection**:
  - Enroll CloudFront distribution in flat-rate Free plan (AWS console, post-deploy)
  - Includes: AWS-managed WAF, DDoS protection, bot management — $0/month Free tier
  - See [BOTPROTECTION.md](BOTPROTECTION.md) for full details
  - Set up CloudWatch logging for WAF events
- [ ] **Implement Proof of Work (PoW) system**:
  - Backend: GET /challenge endpoint (returns nonce, difficulty, timestamp)
  - Backend: PoW validation middleware for all protected endpoints
  - Frontend: SHA-256 based PoW solver function
  - Frontend: API wrapper that automatically solves PoW before requests
  - Dynamic difficulty based on endpoint (login=medium, vault=high)
  - Challenge caching and expiration (60 second TTL)
- [ ] **Configure API Gateway rate limiting**:
  - Per-IP throttling (20 burst, 10 steady-state)
  - Per-user throttling (10 burst, 5 steady-state)
  - Usage plans for admin vs user roles
  - Return 429 (Too Many Requests) on rate limit exceeded
- [ ] **Implement honeypot and bot traps**:
  - Hidden form fields on login page
  - Time-based form submission validation
  - Track user interaction before form submit
  - Reject suspicious submissions
- [ ] Create deployment script to:
  - Generate initial admin password and print to console
  - Create admin user in DynamoDB with status="pending_first_login"
- [ ] Implement password policy validation module
- [ ] Implement client-side encryption module (post-quantum safe):
  - Argon2id key derivation function
  - AES-256-GCM encryption/decryption
  - Random salt generation per user
  - Random IV generation per encryption
  - Key management (derive at login, hold in memory, clear on logout)
  - Encryption/decryption wrapper functions
  - Password change re-encryption flow
- [ ] Implement passkey module (WebAuthn/FIDO2):
  - Stateless challenge JWT generation and verification
  - Passkey token generation (proves passkey was verified before password step)
  - Credential registration via `@simplewebauthn/server` `verifyRegistrationResponse()`
  - Credential authentication via `@simplewebauthn/server` `verifyAuthenticationResponse()`
  - Counter-based replay protection (updated on every login)
- [ ] Implement admin endpoints (with environment-conditional passkeys):
  - POST /admin/login (handle initial password; in prod, accept passkeyToken + password; in dev/beta, accept username + password; return requirePasswordChange flag)
  - POST /api/admin/change-password (with policy validation; set status to "active" directly when passkeys disabled, otherwise "pending_passkey_setup")
  - GET /api/admin/passkey/challenge (stateless signed challenge JWT; return 404 when passkeys disabled)
  - POST /api/admin/passkey/verify (verify passkey credential, return passkeyToken + username; return 404 when passkeys disabled)
  - GET /api/admin/passkey/register/challenge (Bearer JWT required, status=pending_passkey_setup; return 404 when passkeys disabled)
  - POST /api/admin/passkey/register (store credential, activate account; return 404 when passkeys disabled)
  - POST /api/admin/users (create user invitation with OTP generation, blocked if admin not active)
  - GET /api/admin/users (list all users, blocked if admin not active)
- [ ] Implement user authentication endpoints (with environment-conditional passkeys):
  - POST /auth/login (handle OTP first login; in prod, accept passkeyToken + password; in dev/beta, accept username + password; return requirePasswordChange flag)
  - POST /api/auth/change-password (with policy validation; set status to "active" directly when passkeys disabled, otherwise "pending_passkey_setup")
  - GET /api/auth/passkey/challenge (stateless signed challenge JWT; return 404 when passkeys disabled)
  - POST /api/auth/passkey/verify (verify passkey credential, return passkeyToken + username + encryptionSalt; return 404 when passkeys disabled)
  - GET /api/auth/passkey/register/challenge (Bearer JWT required, status=pending_passkey_setup; return 404 when passkeys disabled)
  - POST /api/auth/passkey/register (store credential, activate account; return 404 when passkeys disabled)
- [ ] Implement vault endpoints:
  - GET /vault (read user's file)
  - PUT /vault (update user's file)
  - GET /api/vault/download (download complete recovery package with metadata)
- [ ] Create React frontend:
  - **Encryption module**:
    - Derive encryption key from password using Argon2id on login
    - Store key in memory (React context or state, never localStorage)
    - Encrypt file content before PUT /vault
    - Decrypt file content after GET /vault
    - Re-encrypt on password change
    - Clear key from memory on logout
  - Admin login page (prod: two-step passkey → password form; dev/beta: username + password form; derives encryption key)
  - Admin first-time password change page (redirect from login if requirePasswordChange=true, handles re-encryption)
  - Admin passkey setup page (redirect from password change in prod; shows register button, calls WebAuthn API)
  - Admin dashboard (create users, view user list, accessible only after passkey setup)
  - User login page (prod: two-step passkey → password form; dev/beta: username + password form; derives encryption key)
  - User first-time password change page (with policy display, handles re-encryption)
  - User passkey setup page (redirect from password change in prod; shows register button, calls WebAuthn API)
  - Vault page with two modes:
    - View mode (read-only, copy to clipboard, download encrypted backup)
    - Edit mode (editable textarea, save/cancel buttons with logout on both)
  - Auto-logout countdown timer (60s view mode, 120s edit mode)
  - Mode switching logic (view → edit with timer reset)
  - Auto-logout implementation when timer expires
  - Immediate logout after save operation
  - Immediate logout after cancel operation (with confirmation dialog)
  - Unsaved changes warning in cancel confirmation
  - Auth state management (admin vs user contexts, track passkey setup status)
  - Environment-conditional passkeys:
    - Skip passkey setup screen when passkeys are disabled (dev/beta)
    - Show passkey button on login form only when passkeys are enabled (prod)
  - Environment banner:
    - Show "DEV ENVIRONMENT" or "BETA ENVIRONMENT" banner when not in prod
    - No banner in prod
  - Route guards:
    - Redirect pending_first_login users/admin to password change page
    - Redirect pending_passkey_setup users/admin to passkey setup page (prod only)
    - Block vault/dashboard access until status is "active"
- [ ] Connect frontend to backend APIs
- [ ] Basic error handling and validation feedback

### Phase 2: Polish
- [ ] Improve UI/UX design (styling, responsive layout)
- [ ] Add loading states and user feedback (spinners, toast messages)
- [ ] Implement comprehensive error handling (network errors, validation errors)
- [ ] Add input validation on frontend and backend
- [ ] Security hardening (rate limiting, CORS, encryption)
- [ ] Testing (unit tests for Lambda, integration tests for API)

### Phase 3: Deployment
- [ ] **CDK Deployment Preparation**:
  - Configure AWS credentials and CDK bootstrap
  - Environment configs defined in `shared/src/config/environments.ts`
  - Test CDK synthesis (`cdk synth`)
  - Review generated CloudFormation templates
- [ ] **Infrastructure Deployment**:
  - Deploy dev stack: `cdk deploy PassVault-Dev --context env=dev`
  - Deploy beta stack: `cdk deploy PassVault-Beta --context env=beta`
  - Deploy prod stack: `cdk deploy PassVault-Prod --context env=prod --require-approval broadening`
  - Deploy all stacks: `cdk deploy --all`
  - Verify all resources created successfully
- [ ] **Application Deployment**:
  - Run admin initialization script (create admin user, generate password)
  - Build frontend (`npm run build`)
  - Deploy frontend to S3 bucket
  - Invalidate CloudFront cache
- [ ] **Setup CI/CD pipeline** (optional):
  - GitHub Actions for automated deployments
  - Separate workflows for dev/beta/prod
  - Automated testing before deployment
  - Slack/email notifications on deployment status
- [ ] **Setup monitoring**:
  - CloudWatch dashboards (via MonitoringConstruct)
  - Cost alerts (threshold: $20/month)
  - Error rate alerts (threshold: 5%)
  - Sustained traffic alarm (triggers kill switch after 3 min at throttle limit)
  - Lambda error and throttle alarms
- [ ] **Documentation**:
  - Complete [DEPLOYMENT.md](DEPLOYMENT.md) with actual values (API endpoints, CloudFront URLs)
  - Document admin procedures
  - Create runbooks for common operations
  - API documentation for developers
- [ ] **Performance testing and optimization**:
  - Load testing with realistic traffic patterns
  - Lambda memory optimization (AWS Lambda Power Tuning)
  - CloudFront cache hit rate optimization
  - PoW difficulty tuning based on user feedback
  - Cost analysis and optimization

## 9. Technical Decisions Needed

### Bot Protection & Cost Mitigation
- [x] **PoW (Proof of Work) difficulty levels** (leading zero bits in SHA-256 hash):
  - Login/auth endpoints: MEDIUM (18 bits, ~200ms on average device)
  - Vault operations: HIGH (20 bits, ~500ms)
  - Admin operations: HIGH (20 bits, ~500ms)
  - Public endpoints: LOW (16 bits, ~100ms)
  - Balance: security vs user experience (aim for < 500ms delay)
- [x] **CloudFront flat-rate plan for bot protection**:
  - Enroll distribution in Free plan after first deploy (AWS console, one-time)
  - Provides: AWS-managed WAF + DDoS + bot management at $0/month
  - See [BOTPROTECTION.md](BOTPROTECTION.md) for full details
- [x] **CloudFront for static hosting**:
  - S3 + CloudFront (deployed via CDK); CloudFront flat-rate plan provides edge protection
- [ ] **PoW challenge caching strategy**:
  - In-memory cache (fast but lost on Lambda cold start)
  - DynamoDB cache (persistent but adds latency and cost)
  - Redis/ElastiCache (best performance but adds infrastructure cost)
  - **Recommended**: In-memory cache with DynamoDB fallback
- [ ] **Honeypot implementation details**:
  - Hidden field names (e.g., "email", "phone", "website")
  - CSS vs visibility hidden (CSS more reliable)
  - Server-side rejection strategy (silent fail vs explicit error)
- [x] **Account lockout thresholds** (implemented):
  - Failed attempts before lockout: 5 (`RATE_LIMIT_FAILED_ATTEMPTS`)
  - Lockout duration: 15 minutes (`RATE_LIMIT_WINDOW_MINUTES`) — flat, not exponential
  - Counter stored in DynamoDB (`failedLoginAttempts`, `lockedUntil` per user)
  - Lockout is per-account (username), not per-IP

### General Infrastructure
- [x] **CSS solution: Tailwind CSS v4** with `@tailwindcss/vite` plugin
- [x] **Deployment/IaC tool: AWS CDK (TypeScript)**
  - Type-safe infrastructure definitions
  - Reusable constructs for common patterns
  - Automated CloudFormation generation
  - Built-in best practices
  - See [DEPLOYMENT.md](DEPLOYMENT.md) for implementation details
- [x] **Frontend hosting: S3 + CloudFront (deployed via CDK)**
  - Low cost (~$0/month for static hosting with flat-rate Free plan)
  - Global CDN for fast content delivery
  - Automatic SSL/TLS certificate management
- [ ] Define file content size limit (recommended: 1MB)
- [ ] Decide on text viewer/editor libraries:
  - View mode: plain div, pre-formatted text, or read-only textarea
  - Edit mode: plain textarea, CodeMirror, Monaco, etc.
- [ ] Determine method for initial admin user creation and password generation:
  - Deployment script (recommended - automated, secure random password)
  - Manual DynamoDB entry + manual S3 upload
  - CloudFormation custom resource or CDK construct
- [ ] Decide admin username (default: "admin" or configurable)
- [ ] Choose password policy enforcement library (zxcvbn, validator.js, custom)
- [ ] Decide on OTP delivery method to users (admin copies and shares via secure channel - email, Slack, etc.)
- [ ] Choose encryption libraries:
  - **Argon2**: argon2-browser (WebAssembly implementation for browser)
  - **AES-256-GCM**: Web Crypto API (native browser support, preferred) or crypto-js fallback
  - Consider: noble-ciphers (pure JS, well-audited alternative)
- [ ] Define Argon2id parameters:
  - Memory cost: 64MB (65536 KB) - balance security vs performance
  - Iterations: 3 - recommended for interactive use
  - Parallelism: 4 - utilize multiple cores
  - Salt size: 256 bits (32 bytes)
  - Output key size: 256 bits (32 bytes) for AES-256
- [ ] Define AES-GCM parameters:
  - Key size: 256 bits
  - IV size: 96 bits (12 bytes) - recommended for GCM
  - Tag size: 128 bits (16 bytes) - authentication tag
- [ ] Decide on encrypted file format:
  - Storage format: `{IV (12 bytes) || ciphertext || tag (16 bytes)}` as base64
  - Download format: JSON with complete recovery metadata including salt and parameters
- [x] **Passkey (WebAuthn) library**:
  - Backend: `@simplewebauthn/server` — verifies registration and authentication responses
  - Frontend: `@simplewebauthn/browser` — calls `startAuthentication()` and `startRegistration()`
  - Challenge transport: stateless signed JWT (no DynamoDB table needed)
  - Credential storage: DynamoDB attributes on user record (`passkeyCredentialId`, `passkeyPublicKey`, `passkeyCounter`, `passkeyTransports`, `passkeyAaguid`)
- [x] **WebAuthn parameters**:
  - Relying Party ID: `PASSKEY_RP_ID` env var (e.g. `vault.example.com`)
  - Relying Party Origin: `PASSKEY_ORIGIN` env var (e.g. `https://vault.example.com`)
  - Challenge lifetime: 5 minutes (signed JWT expiry)
  - Authenticator type: platform (biometric/PIN, `authenticatorAttachment: 'platform'`)
  - User verification: preferred
  - Replay protection: credential counter incremented and validated on each login
- [ ] Implement clipboard API strategy (navigator.clipboard API with fallback for older browsers)
- [ ] Decide on countdown timer UI design (header bar, modal, floating widget)
- [ ] Optional: Add audio/visual warning before auto-logout (5 seconds before)
- [ ] Optional: Decide if admin can delete/deactivate users (out of scope for MVP)

## 10. Non-Functional Requirements

### 10.1 Performance
- **PoW Computation Time** (added latency for all requests):
  - Low difficulty (public endpoints): 50-150ms
  - Medium difficulty (login/auth): 150-300ms
  - High difficulty (vault operations): 300-600ms
  - Target: < 500ms on average modern device (2020+ laptop/phone)
  - Acceptable range: 100ms (fast device) to 1000ms (slow device)
- User registration completes within 2.5 seconds (includes PoW)
- Login authentication within 1.5 seconds (includes PoW)
- File content retrieval (GET /vault) within 1.5 seconds (includes PoW)
- File save operation (PUT /vault) within 2.5 seconds (includes PoW)
- Frontend should load within 2 seconds (initial page load)
- Mode switching (view to edit) should be instant (< 100ms, no PoW required)
- Clipboard copy operation should complete within 500ms (no PoW required)
- Countdown timer updates every 1 second with minimal UI jank
- **PoW challenge fetch**: < 200ms (cached on server, minimal computation)

### 10.4 Session Timeouts

Session timeouts vary by environment (see Section 2.5):

| Timeout | Dev/Beta | Prod |
|---------|----------|------|
| View Mode Auto-Logout | 5 minutes | 60 seconds |
| Edit Mode Auto-Logout | 10 minutes | 120 seconds |
| Admin Token Expiry | 24 hours | 8 hours |
| User Token Expiry | 30 minutes | 5 minutes |

- **Post-Save Logout**: Immediate logout after successful save (< 1 second)
- **Post-Cancel Logout**: Immediate logout after canceling edit mode (< 1 second)
- **Timer Accuracy**: Countdown timer must be accurate within ±1 second
- **Logout Execution**: Clear all tokens and redirect to login within 500ms of logout trigger

### 10.2 Scalability
- Support up to 10,000 registered users
- Handle 100 concurrent authenticated users
- DynamoDB provisioned capacity or on-demand based on expected load
- Lambda concurrency limits configured appropriately

### 10.3 Reliability
- 99.9% uptime target
- Automatic retry for failed S3/DynamoDB operations (with exponential backoff)
- Graceful error handling with user-friendly messages
- Data durability: 99.999999999% (S3 standard storage class)

## 11. Future Enhancements (Out of Scope for v1)
- **Admin Features**:
  - Delete/deactivate user accounts
  - Reset user passwords (generate new OTP)
  - Admin activity audit log
  - Multiple admin accounts with admin management
  - Email integration for sending OTP directly to users
- **User Features**:
  - Self-service password change (after initial setup)
  - Password expiration policy (force password change every N days)
  - Account recovery flow (admin-assisted password reset + passkey reset)
  - Passkey recovery codes (recovery codes in case of lost authenticator)
  - Passkey reset capability (admin can clear passkey for locked-out users)
  - Multiple passkey support (register backup authenticator / device)
  - Configurable session timeout preferences (per user or global)
  - "Extend session" button to add time before auto-logout
  - Audio/visual warning alerts before auto-logout (e.g., 10 seconds warning)
  - Copy individual lines or selected text (not just entire file)
- **File Features**:
  - Version history / file versioning (S3 versioning, view/restore previous versions)
  - Rich text editing (WYSIWYG editor, markdown support)
  - File export/download functionality
  - Auto-save functionality (save as user types)
- **UI/UX**:
  - Dark mode / theme customization
  - Responsive mobile design improvements
  - Offline support (local caching, sync on reconnect)
  - Mobile app (React Native or PWA)
- **Security**:
  - Session management dashboard (view/revoke active sessions)
  - Login history and suspicious activity alerts
  - IP whitelisting for admin access
- **Encryption Enhancements**:
  - ML-KEM (CRYSTALS-Kyber) key encapsulation for additional post-quantum protection
  - Hardware security key support (YubiKey) for key derivation
  - Key rotation policy (periodic re-encryption with new salt/key)
  - Encrypted file versioning with per-version keys
  - Password strength meter based on derived key entropy
