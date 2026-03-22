# PassVault — User Manual

## Table of Contents

1. [Overview](#1-overview)
2. [End Users](#2-end-users)
   - [2.1 First-Time Login](#21-first-time-login)
   - [2.2 Normal Login](#22-normal-login)
   - [2.3 Vault — View Mode](#23-vault--view-mode)
   - [2.4 Vault — Edit Mode](#24-vault--edit-mode)
3. [Administrators](#3-administrators)
   - [3.1 First-Time Admin Login](#31-first-time-admin-login)
   - [3.2 Normal Admin Login](#32-normal-admin-login)
   - [3.3 Dashboard](#33-dashboard)
   - [3.4 Users](#34-users)
   - [3.5 User Detail](#35-user-detail)
   - [3.6 Logins](#36-logins)

---

## 1. Overview

PassVault is an invitation-only secure text vault. Each user has exactly one private text file stored with end-to-end encryption. The server never sees the plaintext; only the user can decrypt their content using their password.

The admin manages user accounts via a dedicated admin console. Regular users access their vault directly through the main login page.

---

## 2. End Users

### 2.1 First-Time Login

When the admin creates your account you receive a username and a one-time password (OTP). Enter them on the login page.

```
┌─────────────────────────────────────────────────┐
│                   PassVault                     │
│                                                 │
│  Username  [ alice                            ] │
│  Password  [ ••••••••••••••••                 ] │
│                                                 │
│                    [ Log In ]                   │
│                                                 │
│   Note: You are using a one-time password.      │
│   You will be asked to set a new password       │
│   immediately after login.                      │
└─────────────────────────────────────────────────┘
```

**Steps:**
1. Enter the username and OTP provided by your admin.
2. Click **Log In**.
3. You are immediately taken to the **Change Password** screen.

> OTPs expire after a per-environment grace period (10 min in beta, 120 min in production).
> If your OTP has expired, ask your admin to issue a new one.

---

#### Change Password Screen

```
┌─────────────────────────────────────────────────┐
│                 Change Password                 │
│                                                 │
│  Welcome, alice. Please set a secure password.  │
│                                                 │
│  New password      [ ••••••••••••••••         ] │
│  Confirm password  [ ••••••••••••••••         ] │
│                                                 │
│  Requirements:                                  │
│    ✓ At least 12 characters                     │
│    ✓ Uppercase letter                           │
│    ✓ Lowercase letter                           │
│    ✓ Number                                     │
│    ✓ Special character                          │
│                                                 │
│                   [ Set Password ]              │
└─────────────────────────────────────────────────┘
```

Requirements are validated in real-time. All checkmarks must be green before you can submit.

---

#### Passkey Setup Screen (production only)

After setting your password you must register a passkey so that future logins are passwordless and more secure.

```
┌─────────────────────────────────────────────────┐
│               Register a Passkey                │
│                                                 │
│  A passkey uses your device's biometrics or     │
│  PIN to verify your identity. It replaces the   │
│  need to type your username on future logins.   │
│                                                 │
│             [ Register Passkey ]                │
│                                                 │
│  You cannot access your vault until a passkey   │
│  has been registered.                           │
└─────────────────────────────────────────────────┘
```

Click **Register Passkey** and follow the browser/OS prompt (Face ID, Touch ID, Windows Hello, etc.).

> **Dev / Beta environments**: Passkey setup is skipped. You are taken directly to the vault.

---

### 2.2 Normal Login

On subsequent visits the login process has two steps (production) or one step (dev/beta).

#### Production (passkey + password)

```
┌─────────────────────────────────────────────────┐
│                   PassVault                     │
│                                                 │
│  Step 1 of 2                                    │
│             [ Sign in with Passkey ]            │
│                                                 │
│  Your browser will ask for your biometric       │
│  or device PIN to identify you.                 │
└─────────────────────────────────────────────────┘
```

After the passkey is verified the username is pre-filled and you enter your password:

```
┌─────────────────────────────────────────────────┐
│                   PassVault                     │
│                                                 │
│  Step 2 of 2                                    │
│  Username  [ alice                  (locked) ]  │
│  Password  [ ••••••••••••••••                 ] │
│                                                 │
│                    [ Log In ]                   │
└─────────────────────────────────────────────────┘
```

#### Dev / Beta (username + password only)

```
┌─────────────────────────────────────────────────┐
│             PassVault  [BETA ENVIRONMENT]       │
│                                                 │
│  Username  [ alice                            ] │
│  Password  [ ••••••••••••••••                 ] │
│                                                 │
│                    [ Log In ]                   │
└─────────────────────────────────────────────────┘
```

---

### 2.3 Vault — View Mode

After login you land in view mode. Your decrypted text is displayed read-only.

```
┌─────────────────────────────────────────────────┐
│  PassVault                Auto-logout in: 47s   │
│─────────────────────────────────────────────────│
│                                                 │
│  My secrets are here...                         │
│  Line two of my vault content.                  │
│  ...                                            │
│                                                 │
│─────────────────────────────────────────────────│
│  [ Edit ]  [ Copy ]  [ Download ]  [ Logout ]   │
└─────────────────────────────────────────────────┘
```

| Button | Action |
|--------|--------|
| **Edit** | Enter edit mode (timer resets to 120 s) |
| **Copy** | Copy all vault text to clipboard |
| **Download** | Download encrypted backup as JSON (for offline recovery) |
| **Email** | Send encrypted backup to your registered email (beta/prod) |
| **Logout** | End session immediately |

> The countdown timer in the top-right shows remaining session time. When it reaches zero you are logged out automatically.

---

### 2.4 Vault — Edit Mode

Click **Edit** to switch to edit mode. The background changes to indicate you are editing.

```
┌─────────────────────────────────────────────────┐
│  PassVault  [EDIT MODE]       Auto-logout in: 2m│
│─────────────────────────────────────────────────│
│  ! Changes are not saved automatically.         │
│    Click Save to persist changes.               │
│─────────────────────────────────────────────────│
│ ┌─────────────────────────────────────────────┐ │
│ │ My secrets are here...                      │ │
│ │ Line two of my vault content.               │ │
│ │ |                                           │ │
│ └─────────────────────────────────────────────┘ │
│─────────────────────────────────────────────────│
│            [ Save ]        [ Cancel ]           │
└─────────────────────────────────────────────────┘
```

| Button | Action |
|--------|--------|
| **Save** | Encrypt and save your changes, then log you out |
| **Cancel** | Discard all changes and log you out (confirmation dialog shown) |

> After a successful save you are automatically logged out. This ensures the encryption key is cleared from memory.

---

## 3. Administrators

### 3.1 First-Time Admin Login

The admin account is created by running `scripts/init-admin.ts`. The initial password is printed to the console once and never stored. Use it to log in at `/admin/login`.

The flow mirrors the end-user first-time login:
1. Log in with the initial password.
2. Set a new admin password (same policy as regular users).
3. Register a passkey (production only).
4. Land on the Admin Dashboard.

---

### 3.2 Normal Admin Login

Navigate to `/admin/login`.

```
┌─────────────────────────────────────────────────┐
│              PassVault Admin Login              │
│                                                 │
│  (Production — Step 1)                          │
│             [ Sign in with Passkey ]            │
│                                                 │
│  ─────────────────── OR ──────────────────────  │
│                                                 │
│  (Dev / Beta — direct)                          │
│  Username  [ admin                            ] │
│  Password  [ ••••••••••••••••                 ] │
│                                                 │
│                    [ Log In ]                   │
└─────────────────────────────────────────────────┘
```

---

### 3.3 Dashboard

After login the admin is taken to the **Dashboard** (`/admin/dashboard`). The console uses a full-browser layout.

```
┌──────────────────────────────────────────────────────────────────┐
│  PassVault  Admin Console    Admin > Dashboard    admin · 7:42 · [Logout] │
├──────────────────┬───────────────────────────────────────────────┤
│                  │                                               │
│  Dashboard       │  Dashboard                                    │
│                  │                                               │
│  Users           │  ┌──────────┐  ┌──────────────┐  ┌────────┐ │
│                  │  │  Users   │  │ Vault Storage │  │ Logins │ │
│  Logs            │  │    [12]  │  │   [1.3 MB]   │  │  [47]  │ │
│    Logins        │  └──────────┘  └──────────────┘  └────────┘ │
│                  │  (clickable)                    (clickable)  │
│                  │                                               │
└──────────────────┴───────────────────────────────────────────────┘
```

**Metric cards:**
- **Users** — total user count. Click the number to go to the Users screen.
- **Vault Storage** — combined size of all encrypted vault files.
- **Logins (last 7 days)** — login event count. Click the number to go to the Logins screen.

**Top bar (right side):**
- Username label
- Session countdown timer (e.g. `7:42`)
- **Logout** button

**Sidebar:**
- *Dashboard* — this screen
- *Users* — user management
- *Logs > Logins* — login event history

---

### 3.4 Users

Navigate to `/admin/users` via the sidebar.

```
┌──────────────────────────────────────────────────────────────────┐
│  PassVault  Admin Console    Admin > Users        admin · 7:30 · [Logout] │
├──────────────────┬───────────────────────────────────────────────┤
│                  │  Users                          [+ Create User] │
│  Dashboard       │                                               │
│                  │  ┌────────┬──────────┬──────────┬───────────┐ │
│  Users  ◄        │  │ User   │  Status  │  Created │ Last Login│ │
│                  │  ├────────┼──────────┼──────────┼───────────┤ │
│  Logs            │  │ alice  │ active   │ 2024-01  │ 2024-03   │ │
│    Logins        │  │ bob    │ pending  │ 2024-02  │ —         │ │
│                  │  │ carol  │ active   │ 2024-02  │ 2024-03   │ │
│                  │  └────────┴──────────┴──────────┴───────────┘ │
│                  │  (click any row for details)                  │
└──────────────────┴───────────────────────────────────────────────┘
```

#### Create User

Click **+ Create User** to open the modal:

```
┌─────────────────────────────────────────────────┐
│                  Create User                    │
│                                                 │
│  Username  [ newuser                          ] │
│  Email     [ user@example.com       (optional)] │
│                                                 │
│             [ Create ]         [ Cancel ]       │
└─────────────────────────────────────────────────┘
```

After creation the OTP is shown:

```
┌─────────────────────────────────────────────────┐
│               User Created                      │
│                                                 │
│  Username:           newuser                    │
│  One-Time Password:  X7kP#mQ2rZ!vLn9            │
│                      [ Copy ]                   │
│                                                 │
│  Share this OTP securely with the user.         │
│  It expires in 120 minutes.                     │
│                                                 │
│                     [ Done ]                    │
└─────────────────────────────────────────────────┘
```

Click **Done** to close the modal. If an email was provided, the OTP was also sent to the user's inbox.

---

### 3.5 User Detail

Click any row on the Users screen to open the detail view (`/admin/users/:userId`).

```
┌──────────────────────────────────────────────────────────────────┐
│  PassVault  Admin Console  Admin > Users > alice  admin · 7:18 · [Logout] │
├──────────────────┬───────────────────────────────────────────────┤
│                  │  ← Users                                      │
│  Dashboard       │                                               │
│                  │  alice                                        │
│  Users  ◄        │  ──────────────────────────────────────────  │
│                  │  Status:       active                         │
│  Logs            │  Email:        alice@example.com              │
│    Logins        │  Created:      2024-01-15 09:00 UTC           │
│                  │  Last Login:   2024-03-10 08:00 UTC           │
│                  │  Vault Size:   4.2 KB                         │
│                  │                                               │
│                  │  [ Download Vault ]                           │
│                  │  [ Refresh OTP ]    (pending users only)      │
│                  │  [ Delete User ]    (pending users only)      │
└──────────────────┴───────────────────────────────────────────────┘
```

| Button | Available when | Action |
|--------|---------------|--------|
| **Download Vault** | Always | Downloads the user's encrypted vault file |
| **Refresh OTP** | Status = `pending_first_login` | Generates and displays a new OTP; sends email if address is on file |
| **Delete User** | Status = `pending_first_login` | Permanently removes the user record and vault file |

> Active users cannot be deleted. Only users who have never completed their first login can be removed.

---

### 3.6 Logins

Navigate to `/admin/logs/logins` via **Logs > Logins** in the sidebar (or click the Logins count on the Dashboard).

```
┌──────────────────────────────────────────────────────────────────┐
│  PassVault  Admin Console  Admin > Logs > Logins  admin · 6:55 · [Logout] │
├──────────────────┬───────────────────────────────────────────────┤
│                  │  Logins                                    [↺] │
│  Dashboard       │                                               │
│                  │  Status [All ▼]  Username [All ▼]            │
│  Users           │  From [          ]  To [          ]          │
│                  │  Duration [All durations ▼]  [Clear filters] │
│  Logs            │                                               │
│    Logins  ◄     │  ┌────────┬──────────┬───────────────┬───────┐ │
│                  │  │ Status │ Username │ Login Time    │ Dur.  │ │
│                  │  ├────────┼──────────┼───────────────┼───────┤ │
│                  │  │  ✓     │ alice    │ 2024-03-13 …  │ 03:22 │ │
│                  │  │  ✗     │ bob      │ 2024-03-12 …  │ —     │ │
│                  │  │  ✓     │ alice    │ 2024-03-11 …  │ 45:00 │ │
│                  │  └────────┴──────────┴───────────────┴───────┘ │
│                  │                   Showing 3 of 47 events      │
└──────────────────┴───────────────────────────────────────────────┘
```

#### Columns

| Column | Description |
|--------|-------------|
| **Status** | Green checkmark (✓) = successful login; red cross (✗) = failed attempt |
| **Username** | The username used for this login attempt |
| **Login Time (UTC)** | Date and time of the login in UTC (`YYYY-MM-DD HH:MM:SS`) |
| **Duration** | Session length in `mm:ss` format; `—` if the user did not log out normally |

#### Sorting

Click any column header button to sort by that column. Click again to reverse the direction. An arrow (↑/↓) indicates the active sort. Default: newest first (Login Time descending).

#### Filtering

The filter bar appears once events have loaded.

| Filter | Options |
|--------|---------|
| **Status** | All / Success only / Failed only |
| **Username** | All users / select a specific username |
| **From date** | Date picker — show events on or after this date |
| **To date** | Date picker — show events on or before this date |
| **Duration** | All durations / No duration recorded / < 1 min / 1–5 min / 5–15 min / 15–60 min / > 60 min |

When multiple filters are active they combine (AND logic). The row count below the table updates to show `Showing X of Y events`.

Click **Clear filters** (visible only when at least one filter is active) to reset all filters at once.

#### Refresh

Click the **↺** button in the top-right of the page to reload the event list from the server.

---

*End of User Manual*
