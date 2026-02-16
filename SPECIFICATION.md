# PassVault - Application Specification

## 1. Overview

PassVault is an invitation-only, personal secure text storage application where each user has exactly one private text file stored encrypted in AWS S3. Each file is encrypted client-side using a key derived from the user's password, providing end-to-end encryption with post-quantum cryptographic protection. Administrators create user invitations with one-time passwords. Users login with their assigned username and one-time password, then must set a secure password on first login. The application features a React frontend with serverless backend using AWS Lambda and API Gateway. Each user's file is automatically created when the admin creates the invitation and is only accessible by that user.

**Critical Privacy Feature**: The admin has **zero access** to user file content. Files are encrypted with keys derived from each user's personal password (not the admin password), ensuring complete user privacy. Even with full system access, the admin cannot decrypt user files without knowing the individual user's password.

## 2. Functional Requirements

### 2.1 User Management

#### Admin Functions
- **Single Admin**: The system has exactly one admin account
- **Admin First-Time Login**: On first login, admin must change initial password
  - Initial admin password is stored in S3 bucket after deployment
  - AWS account users with S3 read permissions can retrieve initial password
  - This establishes trust - AWS account access is the root of trust
  - After first login, admin must set a new secure password
  - Admin account status changes from "pending_first_login" to "pending_totp_setup"
- **Admin TOTP Setup (Required after password change)**: Admin must set up two-factor authentication
  - System generates TOTP secret
  - QR code displayed for scanning with authenticator app
  - Admin scans QR code and enters verification code to confirm setup
  - Admin account status changes from "pending_totp_setup" to "active"
- **Admin Authentication**: After initial setup, admin authenticates with:
  - Username + Password
  - TOTP code from authenticator app (6-digit code)
  - > **Environment Note**: In dev and beta environments where TOTP is disabled, the status transitions directly from "pending_first_login" to "active" after password change. The TOTP setup step is skipped entirely. Login requires only username + password (no TOTP code).
- **Create User Invitation**: Admin creates new users by:
  - Specifying a username
  - System generates a secure one-time password (OTP)
  - Empty S3 file is automatically created for the user
  - User account is marked as "pending_first_login"
  - Admin dashboard accessible only after admin has completed TOTP setup
  - **Important**: Admin does NOT set user passwords - users set their own passwords
- **View User Invitations**: Admin can view list of created users and their status (pending_first_login / pending_totp_setup / active)
- **Admin Limitations - Zero Access to User Data**:
  - **Admin CANNOT access user file content** unless they know the user's password
  - User files are encrypted with keys derived from user passwords (not admin password)
  - Admin only knows the temporary OTP, never the user's final password
  - Even with full AWS/database access, admin cannot decrypt user files
  - This ensures complete user privacy and zero-knowledge architecture

#### User Functions
- **First-Time Login**: Users receive username and one-time password from admin
  - Authenticate with username and OTP
  - System forces immediate password change
  - New password must meet secure password policy
  - Account status changes from "pending_first_login" to "pending_totp_setup"
- **TOTP Setup (Required after password change)**: Users must set up two-factor authentication
  - System generates TOTP secret
  - QR code displayed for scanning with authenticator app (Google Authenticator, Authy, etc.)
  - User scans QR code and enters verification code to confirm setup
  - Account status changes from "pending_totp_setup" to "active"
- **Normal Login**: After initial setup, users authenticate with:
  - Username + Password
  - TOTP code from authenticator app (6-digit code)
  - > **Environment Note**: In dev and beta environments where TOTP is disabled, the status transitions directly from "pending_first_login" to "active" after password change. The TOTP setup step is skipped entirely. Login requires only username + password (no TOTP code).
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

**Layer 2: AWS WAF (Web Application Firewall)**
- **Deployed at**: CloudFront (if used) or API Gateway level
- **Rules Enabled**:
  - AWS Managed Rules - Bot Control (detects common bots, scrapers, crawlers)
  - AWS Managed Rules - Known Bad Inputs (SQL injection, XSS attempts)
  - Rate-based rule: Block IPs exceeding 100 requests per 5 minutes
  - Geographic restrictions (optional): Block countries if needed
  - Custom rules for suspicious patterns
- **Challenge Actions**:
  - Suspected bots → CAPTCHA challenge (AWS WAF CAPTCHA)
  - Known bad bots → Block immediately
  - Rate limit violators → Temporary block (1 hour)
- **Cost Optimization**: WAF costs ~$8/month baseline, saves potentially $100s in Lambda/API costs

**Layer 3: API Gateway Rate Limiting**
- **Per-IP Throttling**:
  - Burst limit: 20 requests per second
  - Steady-state limit: 10 requests per second per IP
  - Exceeding limits returns HTTP 429 (Too Many Requests)
- **Per-User Throttling** (authenticated):
  - Burst limit: 10 requests per second
  - Steady-state limit: 5 requests per second per user
- **Usage Plans**: Different tiers for admin vs regular users
- **API Key Requirement** (optional): Require API key in addition to auth token

**Layer 4: Cloudflare Turnstile (Optional, if using Cloudflare)**
- **Privacy-Friendly CAPTCHA Alternative**: Invisible challenge for most users
- **Placement**: Login page only (one-time verification)
- **Fallback**: If not using Cloudflare, use AWS WAF CAPTCHA instead
- **Cost**: Free tier available (1M requests/month)

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

**Layer 6: Progressive Challenges**
- **First failed login attempt**: Standard error message
- **Second failed attempt**: Add 2-second delay before response
- **Third failed attempt**: Require PoW with higher difficulty
- **Fourth+ attempts**: Show CAPTCHA + higher PoW difficulty
- **Five+ failed attempts**: Temporary IP block (15 minutes)

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
  const challenge = await fetch('/challenge').then(r => r.json());

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
- New endpoint: `GET /challenge` - returns PoW challenge
- All protected endpoints validate PoW solution before processing
- Track failed PoW attempts per IP → escalate to IP block
- Cache challenges in memory (short TTL: 60 seconds)

**Infrastructure Changes:**
- Deploy AWS WAF with Bot Control managed rules
- Configure CloudFront (if used) with WAF
- Enable API Gateway throttling and usage plans
- Optional: Add Cloudflare in front of CloudFront for additional protection

#### Cost Analysis

**Without Protection (Vulnerability):**
- Bot makes 10,000 requests/minute to API Gateway
- Each request invokes Lambda (even if authentication fails)
- Cost: ~$50-100/day in Lambda invocations alone
- Potential: $1,500-3,000/month from bot attack

**With Protection:**
- PoW challenges make bot attacks expensive (bots must compute PoW)
- AWS WAF blocks 90%+ of bot traffic before reaching API Gateway
- Rate limiting prevents burst attacks
- Cost: WAF ~$10/month + normal Lambda usage
- Savings: $1,400+ per month during attack scenarios

**ROI**: $10/month investment saves $1,400+/month in potential bot costs

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
- **Admin TOTP Setup Page**: Displayed immediately after password change
  - QR code for scanning with authenticator app
  - Manual entry option (display TOTP secret as text)
  - Instructions: "Scan this QR code with your authenticator app"
  - Verification field for 6-digit TOTP code
  - Verify button to confirm setup
  - Cannot proceed until TOTP is verified
- **Admin Login Page (after setup)**:
  - Username field
  - Password field
  - TOTP code field (6-digit code from authenticator app)
  - Login button
- **Admin Dashboard** (accessible after TOTP is set up):
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
- **Login Page (after setup)**: Form to authenticate (username, password, TOTP code)
  - Username field
  - Password field
  - TOTP code field (6-digit code from authenticator app)
  - Login button
- **First-Time Password Change**: Displayed immediately after first login with OTP
  - Welcome message
  - Password policy requirements display
  - New password field
  - Confirm password field
  - Real-time password policy validation feedback
  - Submit button
- **TOTP Setup Page**: Displayed immediately after password change
  - QR code for scanning with authenticator app (Google Authenticator, Authy, etc.)
  - Manual entry option (display TOTP secret as text for manual input)
  - Instructions: "Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)"
  - App recommendations and download links
  - Verification field for 6-digit TOTP code
  - Verify button to confirm setup
  - Cannot proceed to vault until TOTP is verified
- **Vault Page**: Interface with two distinct modes:

  **View Mode (Default):**
  - Read-only text display/viewer showing file content
  - Countdown timer prominently displayed (e.g., "Auto-logout in: 45 seconds")
  - "Edit" button to enter edit mode
  - "Copy to Clipboard" button (copies entire file content or selected text)
  - "Download Encrypted Backup" button (downloads encrypted file + recovery metadata as JSON)
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
| **TOTP** | Disabled | Disabled | Mandatory |
| **WAF** | Disabled | Disabled | Enabled |
| **Proof of Work** | Disabled | Enabled | Enabled |
| **Honeypot** | Enabled | Enabled | Enabled |
| **CloudFront** | Optional (direct S3/APIGW) | Enabled | Enabled |
| **View timeout** | 5 min | 5 min | 60 sec |
| **Edit timeout** | 10 min | 10 min | 120 sec |
| **Admin token expiry** | 24 hours | 24 hours | 8 hours |
| **User token expiry** | 30 min | 30 min | 5 min |
| **Lambda memory** | 256 MB | 256 MB | 512 MB |
| **Log retention** | 1 week | 2 weeks | 30 days |
| **DynamoDB PITR** | Disabled | Disabled | Enabled |
| **S3 versioning** | Disabled | Disabled | Enabled |
| **Monitoring** | Disabled (logs only) | Disabled (logs only) | Dashboard + alarms |
| **UI indicator** | "DEV ENVIRONMENT" banner | "BETA ENVIRONMENT" banner | None |
| **Monthly cost** | ~$0 | ~$0 | ~$8-10 |

#### Dev Environment
- **Purpose**: Individual developer testing and local development
- **TOTP**: Disabled — status goes directly from "pending_first_login" → "active" after password change
- **WAF**: Disabled
- **Proof of Work**: Disabled — faster iteration
- **CloudFront**: Optional — can access API Gateway directly
- **Session timeouts**: Relaxed (5 min view, 10 min edit)
- **Token expiry**: Relaxed (24h admin, 30m user)
- **Visual indicator**: "DEV ENVIRONMENT" banner in the UI
- **DynamoDB**: No point-in-time recovery
- **S3**: No versioning

#### Beta Environment
- **Purpose**: QA, integration testing, stakeholder demos
- **TOTP**: Disabled — same simplified flow as dev
- **WAF**: Disabled — saves cost, bot protection not needed for internal testing
- **Proof of Work**: Enabled — validates PoW flow works correctly
- **CloudFront**: Enabled — matches prod architecture
- **Session timeouts**: Relaxed (5 min view, 10 min edit)
- **Token expiry**: Relaxed (24h admin, 30m user)
- **Visual indicator**: "BETA ENVIRONMENT" banner in the UI

#### Production Environment
- **Purpose**: Live deployment with full security
- **TOTP**: Mandatory — all users and admin must complete TOTP setup
- **WAF**: Enabled — full bot control, rate limiting, CAPTCHA
- **Proof of Work**: Enabled with production difficulty levels
- **CloudFront**: Enabled with WAF attached
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
- **Authentication**: Basic auth with API Gateway authorizer or Lambda function
- **Bot Protection**: AWS WAF with Bot Control managed rules
- **CDN** (Optional): CloudFront for static content delivery and WAF attachment
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
                    │  CloudFront  │◄──── Optional: CDN + Static hosting
                    │   + WAF      │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   AWS WAF    │◄──── Bot Control, Rate Limiting
                    │ (Bot Control)│      CAPTCHA challenges
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
2. WAF Layer: Bot detection, CAPTCHA, geographic blocking
3. API Gateway: Rate limiting, throttling, usage plans
4. Lambda: PoW validation, authentication, authorization
```

## 4. API Design

### 4.1 Public Endpoints (Bot Protection)

- **GET /challenge**
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

- **GET /health**
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

- **POST /admin/login**
  - Request: `{ "username": "string", "password": "string", "totpCode": "string (optional)" }`
  - Response:
    - First-time login (with initial password): `{ "token": "string", "role": "admin", "requirePasswordChange": true, "encryptionSalt": "string (base64)" }`
    - After password change, before TOTP setup: `{ "token": "string", "role": "admin", "requireTotpSetup": true, "encryptionSalt": "string (base64)" }`
    - Normal login (with TOTP): `{ "token": "string", "role": "admin", "encryptionSalt": "string (base64)" }`
  - Authenticates admin user
  - First login: accepts initial password only (no TOTP required)
  - After TOTP setup: requires both password and valid TOTP code
  - Returns JWT token with admin role and encryption salt for key derivation
  - Flags if password change or TOTP setup is required
  - **When TOTP is disabled (dev/beta)**: login never returns `requireTotpSetup: true`; `totpCode` parameter is ignored; normal login requires only username + password

- **POST /admin/change-password** (Requires admin auth)
  - Request: `{ "newPassword": "string" }`
  - Response: `{ "success": true }` or error with policy violations
  - Validates new password against security policy
  - Updates admin password and changes status from "pending_first_login" to "pending_totp_setup"
  - **When TOTP is disabled (dev/beta)**: status changes directly to "active" instead of "pending_totp_setup"
  - Required on first admin login

- **POST /admin/totp/setup** (Requires admin auth, only accessible if status is "pending_totp_setup")
  - Request: None (or empty)
  - Response: `{ "secret": "string", "qrCodeUrl": "string" }`
  - Generates new TOTP secret for admin
  - Returns secret and QR code data URL for display
  - Secret is stored in DynamoDB but not yet activated

- **POST /admin/totp/verify** (Requires admin auth, only accessible if status is "pending_totp_setup")
  - Request: `{ "totpCode": "string" }`
  - Response: `{ "success": true }` or error
  - Verifies TOTP code against stored secret
  - If valid, activates TOTP and changes admin status from "pending_totp_setup" to "active"
  - If invalid, returns error (user must retry)

> **TOTP Endpoints (dev/beta)**: When TOTP is disabled, POST /admin/totp/setup and POST /admin/totp/verify return HTTP 404 with `{ "error": "TOTP is not enabled in this environment" }`.

- **POST /admin/users** (Requires admin auth, blocked if admin status is not "active")
  - Request: `{ "username": "string" }`
  - Response: `{ "success": true, "username": "string", "oneTimePassword": "string", "userId": "string" }`
  - Creates new user invitation
  - Generates secure random one-time password (min 16 characters)
  - Generates unique encryption salt for user (256-bit random, base64)
  - Creates empty encrypted S3 file for user (encrypted with temporary key or empty blob)
  - User status set to "pending_first_login"
  - Returns OTP to display to admin (only shown once)

- **GET /admin/users** (Requires admin auth, blocked if admin status is not "active")
  - Response: `{ "users": [{ "userId": "string", "username": "string", "status": "string", "createdAt": "timestamp", "lastLoginAt": "timestamp" }] }`
  - Returns list of all users with their status (pending_first_login / pending_totp_setup / active)

### 4.3 User Authentication Endpoints

- **POST /auth/login**
  - Request: `{ "username": "string", "password": "string", "totpCode": "string (optional)" }`
  - Response:
    - First-time login (with OTP): `{ "token": "string", "requirePasswordChange": true, "username": "string", "encryptionSalt": "string (base64)" }`
    - After password change, before TOTP setup: `{ "token": "string", "requireTotpSetup": true, "username": "string", "encryptionSalt": "string (base64)" }`
    - Normal login (with TOTP): `{ "token": "string", "username": "string", "encryptionSalt": "string (base64)" }`
  - Accepts OTP (first time), or password + TOTP code (subsequent logins)
  - Returns JWT token with user ID and role, plus encryption salt for key derivation
  - Flags if password change or TOTP setup is required
  - **When TOTP is disabled (dev/beta)**: login never returns `requireTotpSetup: true`; `totpCode` parameter is ignored; normal login requires only username + password

- **POST /auth/change-password** (Requires user auth)
  - Request: `{ "newPassword": "string" }`
  - Response: `{ "success": true }` or error with policy violations
  - Validates new password against security policy
  - Updates user password and changes status from "pending_first_login" to "pending_totp_setup"
  - **When TOTP is disabled (dev/beta)**: status changes directly to "active" instead of "pending_totp_setup"
  - Invalidates OTP after successful password change

- **POST /auth/totp/setup** (Requires user auth, only accessible if status is "pending_totp_setup")
  - Request: None (or empty)
  - Response: `{ "secret": "string", "qrCodeUrl": "string" }`
  - Generates new TOTP secret for user
  - Returns secret and QR code data URL for display
  - Secret is stored in DynamoDB but not yet activated

- **POST /auth/totp/verify** (Requires user auth, only accessible if status is "pending_totp_setup")
  - Request: `{ "totpCode": "string" }`
  - Response: `{ "success": true }` or error
  - Verifies TOTP code against stored secret
  - If valid, activates TOTP and changes user status from "pending_totp_setup" to "active"
  - If invalid, returns error (user must retry)

> **TOTP Endpoints (dev/beta)**: When TOTP is disabled, POST /auth/totp/setup and POST /auth/totp/verify return HTTP 404 with `{ "error": "TOTP is not enabled in this environment" }`.

### 4.4 File Operations (Protected Endpoints)
All endpoints require user authentication via Authorization header (Bearer token).

- **GET /vault**
  - Response: `{ "encryptedContent": "string (base64)", "lastModified": "timestamp" }`
  - Returns the authenticated user's **encrypted** file content
  - Content is encrypted by client before storage, server returns encrypted blob
  - Client decrypts content using key derived from user's password
  - User ID extracted from auth token
  - Blocked if user status is not "active" (must complete password change and TOTP setup)

- **PUT /vault**
  - Request: `{ "encryptedContent": "string (base64)" }`
  - Response: `{ "success": true, "lastModified": "timestamp" }`
  - Stores the authenticated user's **encrypted** file content
  - Client encrypts content using key derived from user's password before sending
  - Server stores encrypted blob without decryption
  - User ID extracted from auth token ensures users can only update their own file
  - Blocked if user status is not "active" (must complete password change and TOTP setup)

- **GET /vault/download**
  - Response: `{ "encryptedContent": "string (base64)", "encryptionSalt": "string (base64)", "algorithm": "argon2id+aes-256-gcm", "parameters": { "argon2": { "memory": 65536, "iterations": 3, "parallelism": 4, "hashLength": 32 }, "aes": { "keySize": 256, "ivSize": 96, "tagSize": 128 } }, "lastModified": "timestamp", "username": "string" }`
  - Returns complete recovery package with encrypted file and all metadata needed for offline decryption
  - Includes: encrypted content, salt, algorithm details, Argon2id + AES parameters (nested)
  - User ID extracted from auth token
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
- status: account status (String) - "pending_first_login", "pending_totp_setup", or "active"
- oneTimePasswordHash: bcrypt hash of OTP (String, nullable) - cleared after first successful password change
- totpSecret: TOTP secret key (String, encrypted, nullable) - set during TOTP setup, used for verification
- totpEnabled: boolean flag indicating if TOTP is active (Boolean) - true after successful TOTP verification
- encryptionSalt: salt for password-based key derivation (String, base64) - unique per user, generated at user creation
- createdAt: timestamp (String/Number)
- lastLoginAt: timestamp (String/Number)
- createdBy: userId of admin who created this user (String, nullable)
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
  - totpSecret: null (set during TOTP setup)
  - totpEnabled: false (set to true after TOTP verification)
  - encryptionSalt: randomly generated 256-bit salt (base64)
- Initial admin password is stored in S3 bucket at deployment time
  - Location: `s3://passvault-config/admin-initial-password.txt` (or similar)
  - Content: Plain text initial password
  - Access: AWS account users with S3 read permissions can retrieve this password
  - This establishes the root of trust: AWS account access → admin access
  - After admin changes password, this file can be manually deleted (optional)

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
  - Max 5 failed attempts per username per 15 minutes
  - Exponential backoff after failed attempts
- Validate password strength against policy on backend
- OTP must be securely generated and only displayed once to admin
- OTP is invalidated after first successful password change
- **TOTP (Two-Factor Authentication)**:
  - TOTP secret must be cryptographically secure (32+ character base32 string)
  - TOTP secrets stored encrypted in DynamoDB
  - Use standard TOTP algorithm (RFC 6238) with 30-second time step
  - 6-digit TOTP codes
  - Allow time window tolerance (±1 time step, 30 seconds) for clock skew
  - TOTP codes are single-use within the time window (prevent replay attacks)
  - Mandatory for all users and admin after initial password setup
  - QR code generated using standard otpauth:// URI format

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
  - Root of trust: AWS account access with S3 read permissions
  - Initial admin password stored in S3 bucket
  - Anyone with AWS account access to read from S3 bucket can become admin
  - After first admin login and password change, admin access is controlled by the chosen password

- **Role-Based Access Control (RBAC)**:
  - Admin role: access to /admin/* endpoints
  - User role: access to /vault endpoints
  - JWT token includes role claim
  - Single admin account only (enforced at application level)

- **User Authorization**:
  - All /vault endpoints require valid user authentication with TOTP
  - User ID extracted from JWT token, never from request body
  - Vault operations blocked if user status is not "active"
  - User must complete both password change and TOTP setup before accessing vault
  - **Critical**: Users can ONLY access files matching their user ID
    - GET /vault → reads `user-{tokenUserId}.enc`
    - PUT /vault → writes `user-{tokenUserId}.enc`

- **Admin Authorization**:
  - All /admin/* endpoints (except login, change-password, totp/setup, totp/verify) require valid admin authentication
  - JWT token must have role="admin"
  - Admin operations (create users, list users) blocked if admin status is not "active"
  - Admin must complete both password change and TOTP setup before accessing admin functions
  - Verify admin role and status before any user management operations

### 6.5 DynamoDB Security
- Username must be unique (enforced via GSI)
- Passwords stored as bcrypt hashes, never plain text
- TOTP secrets stored encrypted (application-level encryption or DynamoDB encryption at rest)
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

**Configuration Bucket (passvault-config or same bucket with different prefix):**
- Stores initial admin password file
- Access restricted to:
  - AWS account administrators/users with S3 read permissions (for initial admin access)
  - Deployment scripts (for writing initial password)
- Consider separate bucket or folder structure to isolate config from user data
- Initial password file can be manually deleted after admin password change (optional security measure)

### 6.7 Input Validation
- **Username Validation**:
  - Alphanumeric characters only (a-z, A-Z, 0-9) plus underscore and hyphen
  - Length: 3-30 characters
  - Must be unique (checked against DynamoDB GSI)
  - Prevent injection attacks in S3 key construction
- **Password Validation**:
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

**Layer 2: AWS WAF (Primary Defense)**
- ✅ **Blocks 90%+ of bot traffic** before reaching API Gateway
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
| **Mass login attempts** (10k/min) | WAF rate limit + PoW | Blocked at WAF, 99% cost savings |
| **DDoS to API Gateway** (100k/min) | WAF Bot Control | Blocked before API Gateway, $0 Lambda cost |
| **Slow credential stuffing** (10/min) | PoW + honeypot + progressive challenges | Expensive for attacker, eventual IP block |
| **Legitimate traffic spike** (100/min) | Rate limit returns 429, PoW still works | Users may see slowdowns but can proceed |
| **AI crawler** (1k/min) | WAF Bot Control detects user-agent | Blocked or challenged with CAPTCHA |

**Cost Comparison:**

**Without Protection:**
```
Bot attack: 10,000 requests/min × 60 min = 600,000 requests
Lambda invocations: 600,000 × $0.20 per 1M = $0.12
Lambda compute: 600,000 × 100ms × $0.0000166667 per GB-sec = $1.00
API Gateway: 600,000 × $3.50 per 1M = $2.10
Total per hour: $3.22
Total per day: $77.28
Total per month (sustained attack): $2,318.40
```

**With WAF Protection:**
```
Bot attack: 10,000 requests/min × 60 min = 600,000 requests
WAF blocks: 540,000 requests (90%)
WAF cost: 600,000 × $1.00 per 1M = $0.60
Passed to API Gateway: 60,000 requests (10% leak + legitimate traffic)
Lambda invocations: 60,000 × $0.20 per 1M = $0.012
Lambda compute: 60,000 × 100ms × $0.0000166667 per GB-sec = $0.10
API Gateway: 60,000 × $3.50 per 1M = $0.21
Total per hour: $0.92
Total per day: $22.08
Total per month: $662.40
WAF baseline: $5/month
Total with WAF: $667.40/month

Savings: $2,318.40 - $667.40 = $1,651/month (71% cost reduction)
```

**Best Case (With PoW + WAF):**
- PoW deters 50% of attacks before they start (compute too expensive)
- WAF blocks 95% of remaining traffic
- **Total monthly cost during attack: ~$340** (85% savings vs no protection)

**Security Recommendations:**
1. **Always deploy WAF** - ROI is positive after first day of attack
2. **Enable PoW on all protected endpoints** - free protection layer
3. **Monitor CloudWatch WAF metrics** - alert on >1000 blocked requests/hour
4. **Set up cost alerts** - notify if Lambda costs exceed $10/day
5. **Review WAF logs weekly** - identify attack patterns and tune rules
6. **Keep WAF rules updated** - AWS updates Bot Control signatures regularly
7. **Test rate limits** - verify legitimate users aren't blocked during normal usage
8. **Document escalation** - plan for sustained attacks (add geographic blocks, stricter rate limits)

## 7. Deployment

### 7.1 Frontend
- Build React app for production
- Host on **AWS S3 + CloudFront** (deployed via CDK)
  - Static hosting on S3
  - CloudFront CDN for global distribution
  - WAF integration for bot protection
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
  - **BackendConstruct**: Lambda functions, API Gateway (memory/timeout from config)
  - **SecurityConstruct**: WAF, IAM roles, security policies (entire construct conditional on `wafEnabled`)
  - **FrontendConstruct**: CloudFront distribution, S3 static hosting (CloudFront optional for dev)
  - **MonitoringConstruct**: CloudWatch alarms, dashboards (**prod only** — not deployed in dev/beta; log retention still applied per-function in all environments)
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

**Conditional WAF Deployment:**
```typescript
// lib/passvault-stack.ts
if (config.features.wafEnabled) {
  new SecurityConstruct(this, 'Security', { ... });
}
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
| S3 config bucket      | passvault-config-dev-{hash}    | passvault-config-beta-{hash}   | passvault-config-prod-{hash}  |
| S3 frontend bucket    | passvault-frontend-dev-{hash}  | passvault-frontend-beta-{hash} | passvault-frontend-prod-{hash}|
| API Gateway           | passvault-api-dev              | passvault-api-beta             | passvault-api-prod            |
| CloudFront            | *(optional)*                   | passvault-cdn-beta             | passvault-cdn-prod            |
| WAF                   | *(not deployed)*               | *(not deployed)*               | passvault-waf-prod            |
| Lambda functions      | passvault-{fn}-dev             | passvault-{fn}-beta            | passvault-{fn}-prod           |

Stacks share nothing — they can be deployed and destroyed independently.

### 7.5 Initial Deployment Setup
- **Admin Account Creation**:
  - Generate secure random initial admin password (16+ characters)
  - Create admin user in DynamoDB with username="admin", role="admin", status="pending_first_login"
  - Store initial admin password in S3 bucket:
    - Location: `s3://passvault-config/admin-initial-password.txt`
    - Content: Plain text password
    - Can be done via deployment script or IaC tool (CloudFormation custom resource, CDK construct, etc.)
- **Post-Deployment Steps**:
  - AWS account administrator retrieves initial admin password from S3
  - Admin logs in with initial password
  - Admin immediately changes password to secure personal password
  - Optionally delete `admin-initial-password.txt` from S3 after successful password change

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
  - SecurityConstruct: WAF Web ACL, security groups, encryption policies (only instantiated when `wafEnabled=true`)
  - FrontendConstruct: CloudFront distribution, S3 static hosting, OAI (CloudFront optional for dev)
  - MonitoringConstruct: CloudWatch alarms, dashboards, log groups (retention from config)
- [ ] **Setup AWS WAF for bot protection**:
  - Create WAF Web ACL with Bot Control managed rules
  - Configure rate-based rules (100 requests per 5 minutes per IP)
  - Enable AWS Managed Rules for Known Bad Inputs
  - Attach WAF to API Gateway (or CloudFront if using CDN)
  - Configure CAPTCHA action for suspected bots
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
  - Generate initial admin password
  - Create admin user in DynamoDB with status="pending_first_login"
  - Store initial password in S3 config bucket
- [ ] Implement password policy validation module
- [ ] Implement client-side encryption module (post-quantum safe):
  - Argon2id key derivation function
  - AES-256-GCM encryption/decryption
  - Random salt generation per user
  - Random IV generation per encryption
  - Key management (derive at login, hold in memory, clear on logout)
  - Encryption/decryption wrapper functions
  - Password change re-encryption flow
- [ ] Implement TOTP module (RFC 6238):
  - TOTP secret generation
  - QR code generation (otpauth:// URI)
  - TOTP verification with time window tolerance
  - TOTP secret encryption/decryption
- [ ] Implement admin endpoints (with environment-conditional TOTP):
  - POST /admin/login (handle initial password, regular password+TOTP, return requirePasswordChange/requireTotpSetup flags; skip TOTP when disabled)
  - POST /admin/change-password (with policy validation; set status to "active" directly when TOTP disabled, otherwise "pending_totp_setup")
  - POST /admin/totp/setup (generate TOTP secret and QR code; return 404 when TOTP disabled)
  - POST /admin/totp/verify (verify TOTP code, activate TOTP, change status to active; return 404 when TOTP disabled)
  - POST /admin/users (create user invitation with OTP generation, blocked if admin not active)
  - GET /admin/users (list all users, blocked if admin not active)
- [ ] Implement user authentication endpoints (with environment-conditional TOTP):
  - POST /auth/login (handle OTP, regular password+TOTP, return requirePasswordChange/requireTotpSetup flags; skip TOTP when disabled)
  - POST /auth/change-password (with policy validation; set status to "active" directly when TOTP disabled, otherwise "pending_totp_setup")
  - POST /auth/totp/setup (generate TOTP secret and QR code; return 404 when TOTP disabled)
  - POST /auth/totp/verify (verify TOTP code, activate TOTP, change status to active; return 404 when TOTP disabled)
- [ ] Implement vault endpoints:
  - GET /vault (read user's file)
  - PUT /vault (update user's file)
  - GET /vault/download (download complete recovery package with metadata)
- [ ] Create React frontend:
  - **Encryption module**:
    - Derive encryption key from password using Argon2id on login
    - Store key in memory (React context or state, never localStorage)
    - Encrypt file content before PUT /vault
    - Decrypt file content after GET /vault
    - Re-encrypt on password change
    - Clear key from memory on logout
  - Admin login page (with TOTP field for returning admins, derives encryption key)
  - Admin first-time password change page (redirect from login if requirePasswordChange=true, handles re-encryption)
  - Admin TOTP setup page (redirect from password change, display QR code, verify code)
  - Admin dashboard (create users, view user list, accessible only after TOTP setup)
  - User login page (with TOTP field for returning users, derives encryption key)
  - User first-time password change page (with policy display, handles re-encryption)
  - User TOTP setup page (redirect from password change, display QR code, verify code)
  - Vault page with two modes:
    - View mode (read-only, copy to clipboard, download encrypted backup)
    - Edit mode (editable textarea, save/cancel buttons with logout on both)
  - Auto-logout countdown timer (60s view mode, 120s edit mode)
  - Mode switching logic (view → edit with timer reset)
  - Auto-logout implementation when timer expires
  - Immediate logout after save operation
  - Immediate logout after cancel operation (with confirmation dialog)
  - Unsaved changes warning in cancel confirmation
  - Auth state management (admin vs user contexts, track TOTP setup status)
  - Environment-conditional TOTP:
    - Skip TOTP setup screen when TOTP is disabled (dev/beta)
    - Hide TOTP code field on login form when TOTP is disabled
  - Environment banner:
    - Show "DEV ENVIRONMENT" or "BETA ENVIRONMENT" banner when not in prod
    - No banner in prod
  - Route guards:
    - Redirect pending_first_login users/admin to password change page
    - Redirect pending_totp_setup users/admin to TOTP setup page (prod only)
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
  - WAF blocked request alerts
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
- [ ] **AWS WAF configuration**:
  - Enable Bot Control (adds ~$10/month + $1 per million requests)
  - Geographic restrictions: Block specific countries if applicable
  - Rate limits: 100 requests per 5 minutes per IP (adjustable)
  - CAPTCHA challenge vs Block for suspected bots
- [ ] **CloudFront usage decision**:
  - Option A: Use CloudFront for static hosting + WAF (recommended for cost savings)
  - Option B: S3 static hosting + WAF at API Gateway only
  - Option C: Vercel/Netlify hosting (limited WAF integration)
- [ ] **Optional Cloudflare Turnstile**:
  - If using Cloudflare: Enable Turnstile on login page (free tier: 1M/month)
  - Otherwise: Use AWS WAF CAPTCHA
- [ ] **PoW challenge caching strategy**:
  - In-memory cache (fast but lost on Lambda cold start)
  - DynamoDB cache (persistent but adds latency and cost)
  - Redis/ElastiCache (best performance but adds infrastructure cost)
  - **Recommended**: In-memory cache with DynamoDB fallback
- [ ] **Honeypot implementation details**:
  - Hidden field names (e.g., "email", "phone", "website")
  - CSS vs visibility hidden (CSS more reliable)
  - Server-side rejection strategy (silent fail vs explicit error)
- [ ] **Progressive challenge escalation thresholds**:
  - Failed login attempts before CAPTCHA: 3-5 attempts
  - Failed attempts before IP block: 5-10 attempts
  - IP block duration: 15 minutes - 1 hour
  - Tracking method: DynamoDB table vs in-memory (trade-off: persistence vs cost)

### General Infrastructure
- [x] **CSS solution: Tailwind CSS v4** with `@tailwindcss/vite` plugin
- [x] **Deployment/IaC tool: AWS CDK (TypeScript)**
  - Type-safe infrastructure definitions
  - Reusable constructs for common patterns
  - Automated CloudFormation generation
  - Built-in best practices
  - See [DEPLOYMENT.md](DEPLOYMENT.md) for implementation details
- [x] **Frontend hosting: S3 + CloudFront (deployed via CDK)**
  - Full AWS integration with WAF support
  - Low cost (~$0-1/month for static hosting)
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
- [ ] Decide S3 bucket/key for initial admin password storage (e.g., `passvault-config/admin-initial-password.txt`)
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
- [ ] Choose TOTP library:
  - Backend: speakeasy (Node.js), otplib, or similar
  - Frontend: qrcode.react or qrcode for QR code generation/display
- [ ] Decide on TOTP secret encryption method:
  - AWS KMS for encryption keys
  - Application-level encryption (AES-256)
  - Rely on DynamoDB encryption at rest
- [ ] Decide on TOTP parameters:
  - Time step: 30 seconds (standard)
  - Code length: 6 digits (standard)
  - Algorithm: SHA-1 (standard for TOTP compatibility)
  - Time window tolerance: ±1 step (60 second window total)
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
  - Account recovery flow (admin-assisted password reset + TOTP reset)
  - TOTP backup codes (recovery codes in case of lost authenticator)
  - TOTP reset capability (admin can reset TOTP for locked-out users)
  - Multiple TOTP devices support (register backup authenticator)
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
