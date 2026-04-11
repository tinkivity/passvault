# PassVault - Application Specification

## 1. Overview

PassVault is an invitation-only, personal password manager and secure vault with end-to-end encryption and post-quantum cryptographic protection. Each user can have one or more encrypted vaults stored in AWS S3, where each vault holds structured items (logins, credit cards, notes, identities, WiFi, SSH keys, email accounts). All vault content is encrypted client-side using a key derived from the user's password — the server stores only encrypted blobs. Administrators create user invitations using the user's email address as their username. Users login with their assigned email and one-time password, then must set a secure password on first login. The application features a React frontend with serverless backend using AWS Lambda and API Gateway. The first vault is automatically created when the admin creates the invitation and is only accessible by that user.

**Critical Privacy Feature**: The admin has **zero access** to user file content. Files are encrypted with keys derived from each user's personal password (not the admin password), ensuring complete user privacy. Even with full system access, the admin cannot decrypt user files without knowing the individual user's password.

> **User State Model**: For the complete account state machine (statuses, transitions, admin expiration rules, brute-force lockout), see [USER-STATE-MODEL.md](USER-STATE-MODEL.md).

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
  - Username + password (step 1 — verifies credentials)
  - Passkey (step 2 — shown in a second dialog after step 1 succeeds)
  - > **Environment Note**: In dev, the status transitions directly from "pending_first_login" to "active" after password change. The passkey setup step is skipped entirely and login requires only username + password. In beta/prod, admins must complete passkey setup during onboarding and use two-step login thereafter.
- **Create User Invitation**: Admin creates new users by:
  - Specifying the user's email address (used as the username / login identity); optionally setting `firstName`, `lastName`, `displayName`, `plan` (`free` or `pro`, default `free`), and `expiresAt` (ISO date or null for lifetime)
  - System generates a secure one-time password (OTP) with a per-environment expiry time
  - In prod: SES sends a combined invitation email containing the OTP and an email verification link; user status is set to `pending_email_verification` until the link is clicked
  - In dev/beta: no verification email; user status starts at `pending_first_login` directly
  - First vault record (`Personal Vault`) is automatically created alongside the user record
  - Admin always sees the OTP in the UI regardless of email delivery
  - **Important**: Admin does NOT set user passwords - users set their own passwords
- **View User Invitations**: Admin can view a list of all non-retired users and their status, including vault size
- **User Lifecycle Management**: Admin can change a user's status from the User Detail page:
  - **Lock** (`active` or `expired` → `locked`): User cannot log in; returns `ACCOUNT_SUSPENDED` (403)
  - **Unlock** (`locked` → `active`): Restores login access
  - **Expire** (`active` → `expired`): User can log in and read but cannot create/update/delete vault items; returns `ACCOUNT_EXPIRED` (403) on write attempts
  - **Retire** (any non-retired status → `retired`): Username is renamed to `_retired_{userId}_{original}` freeing the email for reuse; user disappears from the admin list; login returns `INVALID_CREDENTIALS` (indistinguishable from wrong password)
  - Admin cannot lock/unlock/expire/retire another admin account (returns 403)
- **Refresh OTP**: Admin can generate a new OTP for a user that is still in `pending_first_login` state (e.g. OTP expired or was lost); sends email if the user is in a beta/prod environment
- **Delete Pending User**: Admin can delete a user that has not yet completed first login; removes the DynamoDB record and all associated S3 vault files
- **Reactivate User**: Admin can reactivate an `expired` user, optionally setting a new `expiresAt` date or granting lifetime access
- **Update User Profile**: Admin can update `firstName`, `lastName`, `displayName`, `plan`, and `expiresAt` on any non-retired user
- **Email Vault**: Admin can trigger an encrypted vault backup email to be sent to the user's registered email address (prod only; requires `SENDER_EMAIL`)
- **Admin Limitations - Zero Access to User Data**:
  - **Admin CANNOT access user file content** unless they know the user's password
  - User files are encrypted with keys derived from user passwords (not admin password)
  - Admin only knows the temporary OTP, never the user's final password
  - Even with full AWS/database access, admin cannot decrypt user files
  - This ensures complete user privacy and zero-knowledge architecture

#### User Functions
- **First-Time Login**: Users receive an invitation email (prod) or OTP from admin (dev/beta)
  - **Prod**: Click the email verification link first; status transitions `pending_email_verification` → `pending_first_login`; then log in with the OTP
  - **Dev/beta**: Log in with the OTP directly (no verification required)
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
  - > **Environment Note**: In dev, the status transitions directly from "pending_first_login" to "active" after password change. The passkey setup step is skipped entirely and login requires only username + password. In beta/prod, users complete passkey setup during onboarding.
- **Session Management**: Maintain authenticated state during user session
- **Logout**: Users can end their session

### 2.2 Vault Management

#### Vault Structure

Each vault holds a `VaultFile` JSON object (encrypted before storage):

```typescript
interface VaultFile {
  version: 1;
  items: VaultItem[];
}
```

**Item categories:** `login`, `email`, `credit_card`, `identity`, `wifi`, `private_key`, `note`

Each item has a common base (`id`, `name`, `category`, `createdAt`, `updatedAt`, `warningCodes`) plus category-specific fields (e.g. `login` has `username`, `password`, optional `url`/`totp`/`notes`).

**`warningCodes`** are zero-knowledge metadata computed entirely client-side and stored inside the encrypted vault. The backend never sees or processes them. Current codes:
- `duplicate_password` — password appears in more than one login/email/wifi item
- `too_simple_password` — password fails the shared password policy

#### Multiple Vaults

| Plan | Max vaults |
|------|------------|
| `free` (default) | 1 |
| `pro` | 10 |

Plan is set by the admin on the user record and enforced server-side on vault creation.

#### Vault Operations

- **Browse items**: Vault item list with Name, Category, display field (e.g. username for login), and ⚠ warning badge
- **View item**: Detail page with all fields; secret fields (password, CVV, etc.) are masked by default with reveal/copy controls
- **Add item**: Category selector → dynamic form; password fields include a one-click password generator
- **Edit item**: Same form; recomputes all `warningCodes` across the vault before saving
- **Delete item**: Confirmation dialog with password verification
- **Download encrypted backup**: Downloads vault as a JSON file containing the encrypted blob + recovery metadata
- **Email encrypted backup**: Sends backup to the user's registered email (beta/prod only)
- **Create vault**: Adds a new named vault (blocked if at plan limit)
- **Delete vault**: Removes vault and its S3 file (blocked if it is the last vault)

#### Encryption
- **Client-Side Encryption**: All vault content is encrypted on the client (browser) before being sent to the server
- **Password-Based Key Derivation**: Encryption key is derived from user's password using Argon2id (quantum-resistant KDF)
- **Post-Quantum Safe**: Uses AES-256-GCM for symmetric encryption (quantum-resistant with 256-bit keys)
- **End-to-End Encryption**: Server never sees plaintext content, only encrypted blobs
- **Zero-Knowledge Warning Codes**: `warningCodes` arrays are stored inside the encrypted blob — backend is completely blind to their values
- **Password Change Re-encryption**: When password changes, all vaults are automatically re-encrypted with the new key

#### Session Timeouts

Auto-logout fires after configurable inactivity; a countdown timer is always visible.

| Environment | View mode | Edit mode |
|-------------|-----------|-----------|
| Dev / Beta  | 5 min     | 10 min    |
| Prod        | 60 sec    | 120 sec   |

#### Expired Accounts

If an admin marks a user as `expired`, the user can still log in and view vault items but all create/edit/delete operations return 403 `ACCOUNT_EXPIRED`. A read-only banner is shown in the UI.

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
- **Admin Console** (accessible after passkey is set up) — full-viewport AWS Console-style layout:
  - **Top bar**: PassVault branding + "Admin Console" label (left); breadcrumb trail (centre); session countdown timer + Logout button (right)
  - **Sidebar**: fixed left navigation with flat sections
    - *Main*: Dashboard
    - *Users*: Users
    - *Logs*: Logins
  - **Dashboard page** (`/admin/dashboard`): three metric cards
    - **Users** — total active+pending user count; clicking the number navigates to the Users screen
    - **Vault Storage** — sum of all user vault file sizes, formatted (B / KB / MB / GB)
    - **Logins (last 7 days)** — login event count for the past 7 days; clicking the number navigates to the Logins screen
  - **Users page** (`/admin/users`):
    - "Create User" button opens a modal dialog; form collects email, `firstName`, `lastName`, `displayName`, `plan` (Free/Pro toggle), and `expiresAt` (date picker, default +30 days, with "♾ Lifetime" checkbox); after creation the OTP is shown and clicking "Done" closes the modal
    - Hovering the "Users" sidebar item reveals a 3-dot menu with a "Create user" shortcut (navigates to `/admin/users?create=1`)
    - Users table columns: Username, Status, Plan (Free/Pro badge), Expires (date or "♾ lifetime"), Created, Last Login, Vault Size
    - Status and Plan filters (Popover+Command pattern); clicking a row navigates to the User Detail page
    - Row actions: Lock (active users), Unlock (locked users), Expire (active/locked users, orange), Reactivate (expired users — opens date picker dialog for new `expiresAt`), Email vault (prod only); all destructive actions have confirmation dialogs
  - **User Detail page** (`/admin/users/:userId`): full user record including `firstName`, `lastName`, `displayName`, `plan`, and `expiresAt`; inline edit form for all profile fields; action buttons (Download Vault, Refresh OTP, Delete User, Lock/Unlock/Expire/Reactivate/Retire)
  - **Logins page** (`/admin/logs/logins`):
    - Table with columns: Status (icon), Username, Login Time (UTC), Duration (mm:ss)
    - Sortable by all four columns (click column header to toggle asc/desc)
    - Filter bar (visible once data is loaded): Status (All/Success/Failed), Username (dropdown of unique names), From date, To date, Duration bucket (All / No duration / < 1 min / 1–5 min / 5–15 min / 15–60 min / > 60 min)
    - "Clear filters" button appears only when at least one filter is active
    - "Showing X of Y events" count displayed when filters are active
    - Refresh button reloads events from the server

#### User Interface
- **Login Page (first time)**: Form to authenticate with OTP (username, password/OTP)
- **Login Page (after setup)**: Two-step authentication form
  - Step 1: "Sign in with passkey" button — triggers browser WebAuthn dialog, pre-fills username
  - Step 2: Password field (username pre-filled and read-only)
  - Login button
  - > **Dev**: Single-step form — username + password fields, no passkey prompt
  - > **Beta/Prod admin login**: Step 1 is username + password on the login page. On success, a second dialog prompts for passkey verification before completing login.
- **First-Time Password Change**: Displayed immediately after first login with OTP
  - Welcome message
  - Password policy requirements display
  - New password field
  - Confirm password field
  - Real-time password policy validation feedback
  - Submit button
- **Passkey Setup Page**: Displayed immediately after password change (beta/prod)
  - "Register passkey" button triggers browser WebAuthn dialog (biometric / PIN prompt)
  - Explains that the passkey will be required to sign in going forward
  - Cannot proceed to vault until passkey is registered
- **Vault Shell** (full-viewport layout after login):
  - **Sidebar**: vault list (one entry per vault, active vault highlighted); "New Vault" option if under plan limit; username + Logout footer
  - **Top bar**: breadcrumb trail showing current vault + page; session countdown timer; theme toggle
  - **Expired-account banner**: shown when `status === 'expired'`; all write actions hidden

- **Vault Items Page** (`/vault/:vaultId/items`):
  - Table: Name (sortable), Category badge (sortable), display field per category, ⚠ badge if `warningCodes.length > 0`
  - Filter bar: name text search + category multi-select
  - "+ New Item" button (hidden when `expired`)
  - Clicking a row navigates to item detail

- **Vault Item Detail Page** (`/vault/:vaultId/items/:itemId`):
  - All fields shown in a definition list
  - Secret fields (password, CVV, private key, etc.) masked by default; Eye/EyeOff toggle; Copy button with 1.5 s check feedback
  - Note items rendered as plain text (raw) or markdown
  - "[Edit]" / "[Delete]" buttons (hidden when `expired`)
  - Delete opens confirmation dialog with password re-entry

- **Vault Item New Page** (`/vault/:vaultId/items/new`):
  - Category selector → dynamic fields rendered based on category
  - Password fields include `[Generate]` button (cryptographically random, mixed character classes)
  - Note items include format toggle (raw / markdown)

- No longer a single text-area vault editor — vault is always structured items

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

> **Implementation details** have moved to per-package docs:
> - [frontend/ARCHITECTURE.md](frontend/ARCHITECTURE.md) — routing, state management, encryption flow, PoW, honeypot
> - [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) — handlers, services, middleware, utilities, build
> - [cdk/ARCHITECTURE.md](cdk/ARCHITECTURE.md) — CDK constructs, DynamoDB, Lambda, API Gateway, CloudFront, kill switch
>
> This section retains the high-level design intent.

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
  - The credential ID from the assertion is recorded in the resulting login event (`passkeyCredentialId`, `passkeyName`)
  - Returns a short-lived passkey token (5 min) encoding the userId; used with POST /admin/login

- **POST /api/admin/login** (PoW HIGH + honeypot)
  - Request (beta/prod): `{ "passkeyToken": "string", "password": "string" }` — passkeyToken identifies the admin
  - Request (dev): `{ "username": "string", "password": "string" }` — direct username+password
  - Response: `{ "token": "string", "role": "admin", "username": "string", "userId": "string", "plan": "string", "loginEventId": "string (UUID)", "firstName"?: "string", "lastName"?: "string", "displayName"?: "string", "expiresAt"?: "string", "preferredLanguage"?: "string", "requirePasswordChange"?: true, "requirePasskeySetup"?: true }`
  - Returns JWT token with admin role; includes full user profile fields
  - Flags if password change or passkey setup is required
  - `loginEventId` uniquely identifies this login event; sent with `POST /api/auth/logout` to record session duration

- **POST /api/admin/change-password** (Requires admin auth)
  - Request: `{ "newPassword": "string" }`
  - Response: `{ "success": true }` or error with policy violations
  - Validates new password against security policy
  - Updates admin password; sets status to "pending_passkey_setup" (beta/prod) or "active" (dev)

- **GET /api/admin/passkey/register/challenge** (Requires admin auth, status must be "pending_passkey_setup")
  - Response: `{ "challengeJwt": "string" }`

- **POST /api/admin/passkey/register** (Requires admin auth, status "pending_passkey_setup" or "active", PoW HIGH)
  - Request: `{ "challengeJwt": "string", "attestation": PasskeyAttestationJSON, "name": "string" }`
  - Response: `{ "success": true }`
  - Verifies and stores the passkey credential in the credentials table; changes admin status to "active" if currently "pending_passkey_setup"
  - Rejects registration if the admin already has 2 passkeys or if a credential with the same aaguid already exists

- **GET /api/admin/passkeys** (Requires admin auth)
  - Response: `{ "passkeys": [{ "credentialId": "string", "name": "string", "aaguid": "string", "createdAt": "string" }] }`
  - Lists all passkey credentials for the authenticated admin

- **DELETE /api/admin/passkeys/{credentialId}** (Requires admin auth, PoW HIGH)
  - Response: `{ "success": true }`
  - Revokes (deletes) a specific passkey credential; the admin must retain at least one passkey in prod

> **Passkey endpoints (dev)**: When `passkeyRequired=false`, the passkey challenge/verify/register endpoints are still deployed but will not be exercised by the UI. POST /admin/login accepts `username` + `password` directly.

- **POST /api/admin/users** (Requires admin auth, blocked if admin status is not "active")
  - Request: `{ "username": "string", "firstName"?: "string", "lastName"?: "string", "displayName"?: "string", "plan"?: "free" | "pro", "expiresAt"?: "string | null" }` — username must be a valid email address
  - Response: `{ "success": true, "username": "string", "oneTimePassword": "string", "userId": "string" }`
  - Creates new user invitation; also creates the first vault record (`Personal Vault`) for the user
  - Generates secure random one-time password (min 16 characters) with per-environment expiry (dev=60min, beta=10min, prod=120min)
  - **Prod**: generates a `registrationToken` (UUID); SES sends a combined invitation email containing both the OTP and an email verification link (`/api/auth/verify-email?token=...`); user status set to `pending_email_verification`
  - **Dev/beta**: no email sent; user status set to `pending_first_login` directly
  - Returns OTP to display to admin in the UI (always, regardless of email delivery)

- **GET /api/admin/users** (Requires admin auth, blocked if admin status is not "active")
  - Response: `{ "users": [{ "userId": "string", "username": "string", "status": "string", "plan": "free" | "pro", "firstName"?: "string", "lastName"?: "string", "displayName"?: "string", "expiresAt"?: "string | null", "createdAt": "timestamp", "lastLoginAt": "timestamp", "vaultSizeBytes": number | null }] }`
  - Returns list of all non-retired users with their status and current vault file size

- **GET /api/admin/users/:userId** (Requires admin auth)
  - Response: full user record (same fields as list + additional detail)

- **POST /api/admin/users/lock** (Requires admin auth)
  - Request: `{ "userId": "string" }`
  - Response: `{ "success": true }`
  - Sets user status to `locked`; returns 403 if target is an admin account

- **POST /api/admin/users/unlock** (Requires admin auth)
  - Request: `{ "userId": "string" }`
  - Response: `{ "success": true }`
  - Restores user status to `active`; returns 403 if target is an admin account

- **POST /api/admin/users/expire** (Requires admin auth)
  - Request: `{ "userId": "string" }`
  - Response: `{ "success": true }`
  - Sets user status to `expired`; user retains read access but write operations return 403 `ACCOUNT_EXPIRED`

- **POST /api/admin/users/retire** (Requires admin auth)
  - Request: `{ "userId": "string" }`
  - Response: `{ "success": true }`
  - Renames username to `_retired_{userId}_{originalUsername}` (freeing the email address for reuse)
  - Sets user status to `retired`; user disappears from admin list; login returns `INVALID_CREDENTIALS`
  - Returns 403 if target is an admin account

- **POST /api/admin/users/refresh-otp** (Requires admin auth, blocked if admin status is not "active")
  - Request: `{ "userId": "string" }`
  - Response: `{ "success": true, "oneTimePassword": "string" }`
  - Generates a new OTP for a user whose status is `pending_first_login`
  - Returns 400 if user is not in `pending_first_login` state
  - In beta/prod, sends new OTP by email if the environment supports it
  - Returns new OTP to admin in the UI (always)

- **DELETE /api/admin/users?userId=** (Requires admin auth, blocked if admin status is not "active")
  - Deletes a user whose status is `pending_first_login` or `pending_email_verification`
  - Returns 400 if user is in any other status
  - Removes the DynamoDB user record and all associated S3 vault files
  - Response: `{ "success": true }`

- **POST /api/admin/users/reactivate** (Requires admin auth, PoW HIGH)
  - Request: `{ "userId": "string", "expiresAt": "string | null" }` — `expiresAt` is an ISO date string or `null` for lifetime access
  - Response: `{ "success": true }`
  - Reactivates an `expired` user; sets `expiresAt` to the new value; sets status back to `active`

- **POST /api/admin/users/update** (Requires admin auth, PoW HIGH)
  - Request: `{ "userId": "string", "firstName"?: "string", "lastName"?: "string", "displayName"?: "string", "plan"?: "free" | "pro", "expiresAt"?: "string | null" }`
  - Response: `{ "success": true }`
  - Updates profile fields on any non-retired user; only fields present in the request body are changed

- **POST /api/admin/users/email-vault** (Requires admin auth, PoW HIGH; prod only)
  - Request: `{ "userId": "string" }`
  - Response: `{ "success": true }`
  - Emails the user's encrypted vault backup to their registered email address
  - Returns 503 if `SENDER_EMAIL` is not set; returns 400 if called in dev

- **GET /api/admin/stats** (Requires admin auth, PoW HIGH)
  - Response: `{ "totalUsers": number, "totalVaultSizeBytes": number, "loginsLast7Days": number }`
  - `totalUsers`: count of all non-admin user records in DynamoDB
  - `totalVaultSizeBytes`: sum of S3 object sizes for all user vault files
  - `loginsLast7Days`: count of login events in the past 7 days (from the login events table)

- **GET /api/admin/login-events** (Requires admin auth, PoW HIGH)
  - Response: `{ "events": [{ "eventId": "string", "userId": "string", "username": "string", "timestamp": "string (ISO 8601)", "success": boolean, "logoutAt": "string (ISO 8601) | undefined" }] }`
  - Returns up to 500 most-recent login events sorted by timestamp descending
  - Each event records whether login succeeded (`success: true`) or failed (`success: false`)
  - `logoutAt` is present only if the user has since called `POST /api/auth/logout` for this session; used to calculate session duration on the client

### 4.3 User Authentication Endpoints

- **GET /api/auth/passkey/challenge**
  - Response: `{ "challengeJwt": "string" }`
  - No auth required; no PoW required

- **POST /api/auth/passkey/verify** (PoW MEDIUM + honeypot)
  - Request: `{ "challengeJwt": "string", "assertion": PasskeyAssertionJSON }`
  - Response: `{ "passkeyToken": "string", "username": "string", "encryptionSalt": "string" }`
  - The credential ID from the assertion is recorded in the resulting login event (`passkeyCredentialId`, `passkeyName`)

- **GET /api/auth/verify-email?token=** (no auth, no PoW — prod only)
  - Validates the `registrationToken` from the invitation email
  - On success: sets user status to `pending_first_login`; returns `{ "success": true }`
  - Returns 400 `EMAIL_VERIFICATION_INVALID` if token is unknown or expired (> 7 days)
  - Returns 200 with `{ "alreadyVerified": true }` if status is already past `pending_email_verification`

- **POST /api/auth/login** (PoW MEDIUM + honeypot)
  - Request (user passkey login): `{ "passkeyToken": "string" }` — passkeyToken from verify step; no password needed
  - Request (password login): `{ "username": "string", "password": "string" }` — used by admins (all envs) and users without passkeys
  - Response: `{ "token": "string", "role": "string", "username": "string", "userId": "string", "plan"?: "string", "loginEventId"?: "string (UUID)", "firstName"?: "string", "lastName"?: "string", "displayName"?: "string", "expiresAt"?: "string", "preferredLanguage"?: "string", "requirePasswordChange"?: true, "requirePasskeySetup"?: true, "requirePasskeyVerification"?: true, "accountExpired"?: true }`
  - `requirePasswordChange`: admin/user must change OTP password before proceeding
  - `requirePasskeySetup`: admin (beta/prod) must register a passkey before proceeding
  - `requirePasskeyVerification`: admin (beta/prod) must complete passkey verification as a second login step (via admin passkey endpoints, then POST /api/admin/login)
  - Returns JWT token with user ID and role, plus encryption salt for key derivation and `plan` for vault limit enforcement
  - `loginEventId` uniquely identifies this login event; sent with `POST /api/auth/logout` to record session duration
  - Returns 403 `ACCOUNT_SUSPENDED` if `status === 'locked'`
  - Returns 401 `INVALID_CREDENTIALS` if `status === 'retired'` (indistinguishable from wrong password)
  - Returns 403 `EMAIL_NOT_VERIFIED` if `status === 'pending_email_verification'` (prod only)

- **POST /api/auth/change-password** (Requires user auth)
  - Request: `{ "newPassword": "string" }`
  - Response: `{ "success": true }` or error with policy violations
  - Validates new password against security policy
  - Updates user password; sets status to "pending_passkey_setup" (beta/prod) or "active" (dev)

- **GET /api/auth/passkey/register/challenge** (Requires user auth, status must be "pending_passkey_setup")
  - Response: `{ "challengeJwt": "string" }`

- **POST /api/auth/passkey/register** (Requires user auth, status "pending_passkey_setup" or "active", PoW MEDIUM)
  - Request: `{ "challengeJwt": "string", "attestation": PasskeyAttestationJSON, "name": "string" }`
  - Response: `{ "success": true }`
  - Verifies and stores the passkey credential in the credentials table; changes user status to "active" if currently "pending_passkey_setup"
  - Rejects registration if the user already has 10 passkeys or if a credential with the same aaguid already exists

- **GET /api/auth/passkeys** (Requires user auth)
  - Response: `{ "passkeys": [{ "credentialId": "string", "name": "string", "aaguid": "string", "createdAt": "string" }] }`
  - Lists all passkey credentials for the authenticated user

- **DELETE /api/auth/passkeys/{credentialId}** (Requires user auth, PoW MEDIUM)
  - Response: `{ "success": true }`
  - Revokes (deletes) a specific passkey credential; the user must retain at least one passkey in prod

> **Passkey endpoints (dev)**: When `passkeyRequired=false`, the passkey challenge/verify/register endpoints are still deployed but will not be exercised by the UI. POST /auth/login accepts `username` + `password` directly.

- **POST /api/auth/logout** (Requires user or admin auth)
  - Request: `{ "eventId": "string" }` — the `loginEventId` returned by the login response
  - Response: `{ "success": true }`
  - Records `logoutAt` timestamp on the matching login event in DynamoDB (fire-and-forget UpdateItem)
  - Used to calculate session duration on the Logins admin screen
  - If `eventId` is unknown or already has a `logoutAt`, the call is silently ignored

### 4.4 Vault Operations (Protected Endpoints)
All endpoints require user authentication via Authorization header (Bearer token).

> **Note:** The email-change feature (`POST /api/auth/email/change` + `POST /api/auth/email/verify`) is **suspended**. Changing email = changing login identity = invalidating the registered passkey. These endpoints are not implemented.

- **GET /api/vaults** (Requires user auth)
  - Response: `{ "vaults": [{ "vaultId": "string", "displayName": "string", "createdAt": "string" }] }`
  - Returns the authenticated user's vault records (display names + IDs only; no encrypted content)

- **POST /api/vaults** (Requires user auth)
  - Request: `{ "displayName": "string" }`
  - Response: `{ "vaultId": "string", "displayName": "string", "createdAt": "string" }`
  - Creates a new vault; returns 403 `VAULT_LIMIT_REACHED` if user is at their plan limit

- **DELETE /api/vaults/:vaultId** (Requires user auth)
  - Deletes the vault record and its S3 file
  - Returns 400 `CANNOT_DELETE_LAST_VAULT` if it is the user's only vault
  - Returns 404 if vault does not belong to the authenticated user

- **GET /api/vault/:vaultId** (Requires user auth)
  - Response: `{ "encryptedContent": "string (base64)", "lastModified": "timestamp" }`
  - Returns the vault's **encrypted** content blob
  - Auto-migrates legacy `user-{userId}.enc` S3 key to `vault-{vaultId}.enc` on first access
  - Blocked if user status is not "active" or "expired"

- **PUT /api/vault/:vaultId** (Requires user auth)
  - Request: `{ "encryptedContent": "string (base64)" }`
  - Response: `{ "success": true, "lastModified": "timestamp" }`
  - Stores the vault's **encrypted** content blob
  - Returns 403 `ACCOUNT_EXPIRED` if user status is `expired`
  - Blocked if user status is not "active" or "expired" (write blocked for expired)

- **GET /api/vault/:vaultId/download** (Requires user auth)
  - Response: `{ "encryptedContent": "string (base64)", "encryptionSalt": "string (base64)", "algorithm": "argon2id+aes-256-gcm", "parameters": { "argon2": { "memory": 65536, "iterations": 3, "parallelism": 4, "hashLength": 32 }, "aes": { "keySize": 256, "ivSize": 96, "tagSize": 128 } }, "lastModified": "timestamp", "username": "string" }`
  - Returns complete recovery package with encrypted blob and all metadata needed for offline decryption

- **POST /api/vault/:vaultId/email** (Requires user auth; beta/prod only)
  - Response: `{ "success": true }` — sends the encrypted vault JSON (same payload as `/download`) to the user's username (email address)
  - Returns 503 if `SENDER_EMAIL` env var is not set
  - Returns 400 if called in dev (feature disabled)

- **GET /api/config/warning-codes** (no auth, no PoW)
  - Response: `{ "codes": [{ "code": "string", "label": "string", "description": "string", "severity": "info" | "warning" | "critical" }] }`
  - Returns the warning code catalog from the config DynamoDB table
  - Used by the frontend to display human-readable labels on ⚠ badges

## 5. Data Model

### 5.1 DynamoDB Users Table
```
Table: passvault-users-{env}
Primary Key: userId (String)

Attributes:
- userId:                   unique identifier (UUID)
- username:                 email address used as login identity (String, GSI)
                            Retired users have username renamed to _retired_{userId}_{original}
- firstName:                given name (String, optional)
- lastName:                 family name (String, optional)
- displayName:              preferred display name (String, optional)
- passwordHash:             bcrypt hashed password (String)
- role:                     "admin" or "user" (String)
- status:                   "pending_email_verification" | "pending_first_login" |
                            "pending_passkey_setup" | "active" | "locked" | "expired" | "retired"
- plan:                     "free" | "pro" (String) — default "free"
- expiresAt:                ISO date string after which the account transitions to "expired" (String, nullable)
- oneTimePasswordHash:      bcrypt hash of OTP (String, nullable) - cleared after first password change
- otpExpiresAt:             ISO timestamp when the one-time password expires (String, nullable)
- registrationToken:        UUID for email verification link (String, nullable) — prod only
- registrationTokenExpiresAt: ISO timestamp (String, nullable) — 7 days after user creation
- passkeyCredentialId:      **Deprecated** — passkey credentials are now stored in a separate `passvault-passkey-credentials-{env}` table (see below)

**Passkey Credentials Table** (`passvault-passkey-credentials-{env}`):
- credentialId:             WebAuthn credential ID (String, base64url) — partition key
- userId:                   owning user's ID (String) — GSI `byUser` partition key
- name:                     user-assigned label for the credential (String)
- publicKey:                COSE-encoded public key (String, base64url)
- counter:                  signature counter for replay protection (Number)
- transports:               list of transport hints (List of Strings, nullable)
- aaguid:                   authenticator attestation GUID (String) — used for duplicate provider prevention
- createdAt:                ISO timestamp (String)
- encryptionSalt:           salt for password-based key derivation (String, base64)
- createdAt:                ISO timestamp (String)
- lastLoginAt:              ISO timestamp (String, nullable)
- createdBy:                userId of admin who created this user (String, nullable)
- failedLoginAttempts:      count of consecutive failed logins (Number) — reset on success
- lockedUntil:              ISO timestamp for brute-force lockout (String, nullable)
                            Distinct from status=locked (admin-set); this is auto-set after 5 failures
```

> **Two distinct lockout mechanisms:**
> - `status === 'locked'` — set by admin via `/api/admin/users/lock`; returns 403 `ACCOUNT_SUSPENDED`
> - `lockedUntil` — set automatically after 5 consecutive failed logins; returns 429 `ACCOUNT_LOCKED`

Global Secondary Index (GSI):
- Index Name: username-index
- Partition Key: username
- Used for login lookups

**Admin User Initialization:**
- Exactly one admin user is created during deployment/initialization
- Admin user attributes:
  - username: admin email (set by `scripts/init-admin.ts`)
  - passwordHash: bcrypt hash of initial password
  - role: "admin"
  - status: "pending_first_login"
  - plan: "free" (not meaningful for admin)
  - encryptionSalt: randomly generated 256-bit salt (base64)
- Initial admin password is generated by `scripts/init-admin.ts` and printed to console only
  - The OTP is never stored at rest — save it from the console output during initialization
  - This establishes the root of trust: AWS account access (to run the init script) → admin access

### 5.2 DynamoDB Login Events Table
```
Table: passvault-login-events-{env}
Primary Key: eventId (String) — UUID generated server-side before fire-and-forget write

Attributes:
- eventId:   UUID (String) — PK
- userId:    user who logged in (String)
- username:  username at time of event (String)
- timestamp: ISO 8601 login time (String)
- success:   whether login succeeded (Boolean)
- logoutAt:  ISO 8601 logout time (String, nullable) — written by POST /api/auth/logout
- expiresAt: TTL epoch seconds — auto-set to 90 days after event; DynamoDB TTL attribute
```

- No GSI required — admin reads up to 500 rows via Scan, sorted in-memory
- TTL auto-deletes events older than 90 days at no extra cost
- removalPolicy: DESTROY (same as users table)
- Auth Lambda: `dynamodb:PutItem` + `dynamodb:UpdateItem` on this table
- Admin Lambda: `dynamodb:Scan` on this table

### 5.3 DynamoDB Vaults Table
```
Table: passvault-vaults-{env}
Primary Key: vaultId (String)

Attributes:
- vaultId:     UUID (String) — PK
- userId:      owner's userId (String) — GSI PK (byUser index)
- displayName: ENCRYPTED human-readable vault name (String, format: "v1:<base64url>")
- createdAt:   ISO timestamp (String)
```

**displayName encryption.** The stored value is AES-256-GCM ciphertext, base64url-encoded and prefixed with a literal `v1:` format tag. The 32-byte AES key is derived at Lambda cold-start from the JWT secret in SSM Parameter Store (`/passvault/{env}/jwt-secret`) via HKDF-SHA256 with info label `passvault-vault-displayname-v1`. Encryption/decryption happens in `backend/src/utils/dynamodb.ts` so service/handler/frontend code continues to deal in plaintext — the API contracts at §6.4 remain unchanged. See `cdk/DEPLOYMENT.md` for the rotation runbook, which re-encrypts every row when the JWT secret rotates.

Global Secondary Index (GSI):
- Index Name: byUser
- Partition Key: userId
- Used to list all vaults for a user

The first vault (`Personal Vault`) is created automatically by `createUserInvitation` in the admin service. Plan limits (free=1, pro=10) are enforced by `createVault`.

### 5.4 S3 Storage Structure
```
s3://passvault-files-{env}/
  ├── vault-{vaultId-1}.enc
  ├── vault-{vaultId-2}.enc
  └── vault-{vaultId-3}.enc
```

- Files stored with naming pattern: `vault-{vaultId}.enc` (one S3 object per vault record)
- Multiple vaults per user are supported; each has its own encrypted object
- **Files contain encrypted content only** - server cannot decrypt without user's password
- File created (as empty blob) when a vault record is first written
- Auto-migration: if `user-{userId}.enc` exists on first `GET /api/vault/:vaultId`, it is copied to `vault-{vaultId}.enc` and the old key is deleted
- File metadata (`lastModified`) retrieved from S3 object metadata
- Extension `.enc` indicates encrypted content

### 5.4 Password Policy

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
  - Multi-passkey model: users may register up to 10 passkeys, admins up to 2
  - Duplicate provider prevention: registering a second credential with the same aaguid is rejected
  - Login events track `passkeyCredentialId` and `passkeyName` for audit purposes
  - Users with registered passkeys cannot change their password (password login is disabled once passkeys are present)
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
  - **Critical**: Users can ONLY access vault records whose `userId` matches their token's userId
    - GET /api/vault/:vaultId → verified: `vault.userId === tokenUserId`
    - PUT /api/vault/:vaultId → verified: `vault.userId === tokenUserId`

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

Deployment details have moved to dedicated guides:

- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Quick start and overview
- **[cdk/DEPLOYMENT.md](cdk/DEPLOYMENT.md)** — Full deployment guide (SSM secrets, CDK context variables, SES email, monitoring, troubleshooting)
- **[cdk/ARCHITECTURE.md](cdk/ARCHITECTURE.md)** — CDK constructs, stack composition, resource naming
- **[scripts/README.md](scripts/README.md)** — Post-deploy scripts (init-admin, seed-dev, setup, cleanup)

## 8. Development Phases

All phases are complete. The build plan was documented in the now-deleted `IMPLEMENTATION.md` (8 sequential steps from shared types through frontend UI). See the per-package ARCHITECTURE.md files for current implementation details.

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
  - Credential storage: dedicated DynamoDB table `passvault-passkey-credentials-{env}` (credentialId PK, byUser GSI on userId)
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

## 11. Future Enhancements

### Completed in v2

The following items from the original roadmap have been implemented:

- ~~Delete/deactivate user accounts~~ — lock, retire, and reset via admin panel (v2 Phase 1)
- ~~Reset user passwords (generate new OTP)~~ — admin reset with OTP delivery (v2 Phase 1)
- ~~Admin activity audit log~~ — configurable audit system with retention policies (v2 Phase 2)
- ~~Multiple admin accounts with admin management~~ — peer admin model (v2 Phase 1)
- ~~Email integration for sending OTP directly to users~~ — SES integration (v2 Phase 3)
- ~~Self-service password change~~ — change-password/self endpoint (v2 Phase 1)
- ~~Multiple passkey support~~ — users: max 10, admins: max 2 (pre-v2)
- ~~File export/download functionality~~ — vault download (pre-v2)
- ~~Configurable session timeout preferences~~ — per-role timeout settings (v2 Phase 6)
- ~~"Extend session" button~~ — extend time before auto-logout (v2 Phase 6)
- ~~Audio/visual warning alerts before auto-logout~~ — red timer and confirmation modal (v2 Phase 6)
- ~~Passkey reset capability~~ — admin reset clears passkeys for locked-out users (v2 Phase 1)
- ~~Password breach detection (HIBP k-anonymity)~~ — breached password checks (v2 Phase 4)
- ~~Vault import~~ — import from external formats, pro+ only (v2 Phase 8)
- ~~Internationalization~~ — EN, DE, FR, RU (v2 Phase 11)
- ~~Secure email change with verification~~ — email change flow with confirmation (v2 Phase 10)

### Planned

#### Security
- Password expiration policy (force password change every N days)
- Account recovery flow (admin-assisted password reset + passkey reset)
- Passkey recovery codes (recovery codes in case of lost authenticator)
- Session management dashboard (view/revoke active sessions)
- Login history and suspicious activity alerts
- IP whitelisting for admin access

#### Encryption
- ML-KEM (CRYSTALS-Kyber) key encapsulation for post-quantum protection
- Hardware security key support (YubiKey) for key derivation
- Key rotation policy (periodic re-encryption with new salt/key)

#### UX & Editor
- Version history / file versioning (view/restore previous versions via S3 versioning)
- Rich text editing (WYSIWYG editor, markdown preview improvements)
- Auto-save functionality (save as user types)
- Dark mode / theme customization
- Copy individual lines or selected text (not just entire file)

#### Mobile & Offline
- Responsive mobile design improvements
- Offline support (local caching, sync on reconnect)
- Mobile app (React Native or PWA)
