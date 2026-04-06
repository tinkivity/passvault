# PassVault — User Manual

## Table of Contents

1. [Overview](#1-overview)
2. [End Users](#2-end-users)
   - [2.1 First-Time Login](#21-first-time-login)
   - [2.2 Normal Login](#22-normal-login)
   - [2.3 Vault — Items List](#23-vault--items-list)
   - [2.4 Vault — Item Detail](#24-vault--item-detail)
   - [2.5 Adding and Editing Items](#25-adding-and-editing-items)
3. [Administrators](#3-administrators)
   - [3.1 First-Time Admin Login](#31-first-time-admin-login)
   - [3.2 Normal Admin Login](#32-normal-admin-login)
   - [3.3 Dashboard](#33-dashboard)
   - [3.4 Users](#34-users)
   - [3.5 User Detail](#35-user-detail)
   - [3.6 Logins](#36-logins)

---

## 1. Overview

PassVault is an invitation-only password manager and secure vault with end-to-end encryption. Each user's vaults hold structured items — logins, credit cards, notes, identities, WiFi credentials, SSH keys, and email accounts. The server stores only encrypted blobs; only the user can decrypt their content using their password.

The admin manages user accounts via a dedicated admin console. Regular users access their vault directly through the main login page.

---

## 2. End Users

### 2.1 First-Time Login

When the admin creates your account you receive an invitation (prod) or a direct OTP (dev/beta). Your email address is your login username.

#### Production (email verification required)

1. Check your inbox for the invitation email. It contains both an OTP and a verification link.
2. Click the **email verification link** in the email. You will see a confirmation page.
3. Go to the PassVault login page and enter your email address and the OTP from the email.

#### Dev / Beta (no verification required)

Your admin will give you the OTP directly. Log in with your email address and the OTP.

```
┌─────────────────────────────────────────────────┐
│                   PassVault                     │
│                                                 │
│  Email     [ alice@example.com                ] │
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
1. Enter your email address and the OTP provided by your admin.
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

After the passkey is verified the email address is pre-filled and you enter your password:

```
┌─────────────────────────────────────────────────┐
│                   PassVault                     │
│                                                 │
│  Step 2 of 2                                    │
│  Email     [ alice@example.com      (locked) ]  │
│  Password  [ ••••••••••••••••                 ] │
│                                                 │
│                    [ Log In ]                   │
└─────────────────────────────────────────────────┘
```

#### Dev / Beta (email + password only)

```
┌─────────────────────────────────────────────────┐
│             PassVault  [BETA ENVIRONMENT]       │
│                                                 │
│  Email     [ alice@example.com                ] │
│  Password  [ ••••••••••••••••                 ] │
│                                                 │
│                    [ Log In ]                   │
└─────────────────────────────────────────────────┘
```

---

### 2.3 Vault — Items List

After login you land on the items list for your active vault. The layout has a sidebar on the left listing your vaults and a main content area showing the items.

```
┌──────────────────────────────────────────────────────────────┐
│  [logo] PassVault  │ Personal Vault › Items   Auto-logout: 47s│
│────────────────────│──────────────────────────────────────────│
│                    │  Personal Vault          [+ New Item]    │
│  Personal Vault ◄  │                                          │
│  Work Vault        │  Name▲   Category    Display     ⚠       │
│  [+ New Vault]     │  ───────────────────────────────────     │
│                    │  GitHub  Login       alice@…             │
│────────────────────│  Amex    Credit card ·· 1234    ⚠       │
│  alice@example.com │  Notes   Note        —                   │
│  [Logout]          │                                          │
└────────────────────┴──────────────────────────────────────────┘
```

| Column | Description |
|--------|-------------|
| **Name** | Item name (sortable) |
| **Category** | Colored badge: Login, Credit card, Note, Identity, WiFi, SSH key, Email |
| **Display field** | Username for logins, last-4 for credit cards, email for email accounts, etc. |
| **⚠** | Warning badge — hover to see details (e.g. duplicate or weak password) |

Click any row to view the item's details.

> The countdown timer in the top-right shows remaining session time. When it reaches zero you are logged out automatically.

---

### 2.4 Vault — Item Detail

Click any item in the list to open the detail view.

```
┌──────────────────────────────────────────────────────────────┐
│ Personal Vault › Items › GitHub         Auto-logout: 47s     │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  GitHub                                  Login              │
│  ────────────────────────────────────────────────────────   │
│  Username    alice@example.com                              │
│  Password    ••••••••••••   [ 👁 ]  [ 📋 ]                  │
│  URL         https://github.com                             │
│  Created     2026-01-01                                      │
│                                                              │
│                    [ Edit ]  [ Delete ]                      │
└──────────────────────────────────────────────────────────────┘
```

- Secret fields (password, CVV, private key, etc.) are **masked by default**.
- Click the **eye icon** to reveal; click again to hide.
- Click the **clipboard icon** to copy — a checkmark confirms the copy.
- **[Edit]** opens the edit form for this item.
- **[Delete]** opens a confirmation dialog that requires your password.

---

### 2.5 Adding and Editing Items

Click **+ New Item** on the items list to add a new item.

1. Select a **category** from the dropdown.
2. Fill in the fields. Required fields are marked.
3. Password fields include a **[Generate]** button — click it to fill the field with a cryptographically random strong password.
4. Note items have a **format** toggle (plain text or Markdown).
5. Click **Save** — warnings are recomputed across all items before saving.

> **Warning badges** (`⚠`) appear automatically when a password is shared across multiple items (`duplicate_password`) or fails the password policy (`too_simple_password`). They clear as soon as you fix the issue and save.

---

## 3. Administrators

### 3.1 First-Time Admin Login

The admin account is created by running `scripts/init-admin.ts`. The initial password is printed to the console once and never stored. Use it to log in at `/login` — the same login page used by regular users. The backend detects the admin role and redirects accordingly.

The flow mirrors the end-user first-time login:
1. Log in with the initial password.
2. Set a new admin password (same policy as regular users).
3. Register a passkey (production only).
4. Land on the Admin Dashboard.

---

### 3.2 Normal Admin Login

Navigate to `/login` — the same page used by regular users.

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

After the passkey is verified, the username is pre-filled and you enter your password. The backend determines whether the account is admin or user and redirects accordingly.

#### Dev / Beta (username + password only)

```
┌─────────────────────────────────────────────────┐
│             PassVault  [BETA ENVIRONMENT]       │
│                                                 │
│  Username  [ admin                            ] │
│  Password  [ ••••••••••••••••                 ] │
│                                                 │
│                    [ Log In ]                   │
└─────────────────────────────────────────────────┘
```

After login the admin is redirected to `/admin/dashboard`; a regular user is redirected to `/vault/:vaultId/items`.

---

### 3.3 Dashboard

After login the admin is taken to the **Dashboard** (`/admin/dashboard`). The console uses a full-browser layout with a collapsible sidebar on the left and a content area on the right.

```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo] PassVault  │ [≡] Admin › Dashboard                  7h 42m ☀ │
│───────────────────│──────────────────────────────────────────────────│
│                   │                                                  │
│  Dashboard        │  Dashboard                                       │
│                   │                                                  │
│  Management       │  ┌──────────┐  ┌──────────────┐  ┌──────────┐  │
│    Users          │  │  Users   │  │ Vault Storage │  │  Logins  │  │
│    Admin          │  │   [12]   │  │   [1.3 MB]   │  │   [47]   │  │
│                   │  └──────────┘  └──────────────┘  └──────────┘  │
│  Logs             │  (clickable)                      (clickable)   │
│    Logins         │                                                  │
│                   │  [Login chart — today: hourly / 7d or 30d: daily]│
│───────────────────│                                                  │
│  admin            │                                                  │
│  [Logout]         │                                                  │
└───────────────────┴──────────────────────────────────────────────────┘
```

**Metric cards:**
- **Users** — total user count. Click the number to go to the Users screen.
- **Vault Storage** — combined size of all encrypted vault files.
- **Logins (last 7 days)** — login event count. Click the number to go to the Logins screen.

**Sticky header (top of content area):**
- `[≡]` — sidebar collapse/expand toggle
- Breadcrumbs (e.g. `Admin › Dashboard`)
- Session countdown timer (e.g. `7h 42m`) — hidden on small screens
- Dark/light mode toggle (☀/🌙)

**Sidebar footer:**
- Username label
- **Logout** button (icon-only when sidebar is collapsed)

**Sidebar nav:**
- *Dashboard* — this screen
- *Management > Users* — user management
- *Management > Admin* — admin account management
- *Logs > Logins* — login event history

**Login chart (below metric cards):**
- Range selector: **Today** / **Last 7 days** / **Last 30 days**
- *Today*: x-axis shows hours (`0h`, `4h`, `8h`, …, `20h`); subtitle "Number of logins per hour"
- *Last 7 / 30 days*: x-axis shows dates (`Mar 28`); subtitle "Number of logins per day"

---

### 3.4 Users

Navigate to `/admin/users` via the sidebar.

```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo] PassVault  │ [≡] Admin › Users                      7h 30m ☀ │
│───────────────────│──────────────────────────────────────────────────│
│                   │  Users                            [+ Create User] │
│  Dashboard        │                                                  │
│                   │  ┌───────────┬─────────┬──────┬──────────────┬──────────┐ │
│  Management       │  │ Email     │ Status  │ Plan │ Expires      │Vault Size│ │
│    Users  ◄       │  ├───────────┼─────────┼──────┼──────────────┼──────────┤ │
│    Admin          │  │ alice@…   │ active  │ Free │ 2027-01-15   │  4.2 KB  │ │
│                   │  │ bob@…     │ active  │ Pro  │ ♾ lifetime   │  2.1 KB  │ │
│  Logs             │  │ carol@… 🔒│ locked  │ Free │ 2026-06-01   │  1.8 KB  │ │
│    Logins         │  └───────────┴─────────┴──────┴──────────────┴──────────┘ │
│                   │  (click any row for details)                    │
│───────────────────│                                                  │
│  admin            │                                                  │
│  [Logout]         │                                                  │
└───────────────────┴──────────────────────────────────────────────────┘
```

The Users table displays: Email, Status, Plan (Free/Pro badge), Expires (date or "♾ lifetime"), Created, Last Login, and Vault Size. Use the **Status** and **Plan** filter dropdowns above the table to narrow the list.

#### Create User

Click **+ Create User** to open the modal (also accessible via the 3-dot hover menu on the "Users" sidebar item):

```
┌─────────────────────────────────────────────────┐
│                  Create User                    │
│                                                 │
│  Email address  [ user@example.com            ] │
│  First name     [ Jane                        ] │
│  Last name      [ Doe                         ] │
│  Display name   [ Jane (optional)             ] │
│                                                 │
│  Plan           [ Free ]  [ Pro ]               │
│                                                 │
│  Expires        [ 2026-04-28          📅 ]      │
│                 [ ♾ Lifetime ]                  │
│                                                 │
│             [ Create ]         [ Cancel ]       │
└─────────────────────────────────────────────────┘
```

The email address is the user's login identity. `firstName`, `lastName`, `displayName`, `plan`, and `expiresAt` are optional — `plan` defaults to Free and `expiresAt` defaults to 30 days from today. Check **♾ Lifetime** to grant permanent access with no expiry date. In production, an invitation email containing the OTP and a verification link is sent automatically. In dev/beta, the OTP is shown in the admin UI only.

After creation the OTP is shown:

```
┌─────────────────────────────────────────────────┐
│               User Created                      │
│                                                 │
│  Email:              user@example.com           │
│  One-Time Password:  X7kP#mQ2rZ!vLn9            │
│                      [ Copy ]                   │
│                                                 │
│  In prod: invitation email sent automatically.  │
│  In dev/beta: share this OTP with the user.     │
│  It expires in 120 minutes.                     │
│                                                 │
│                     [ Done ]                    │
└─────────────────────────────────────────────────┘
```

Click **Done** to close the modal.

---

### 3.5 User Detail

Click any row on the Users screen to open the detail view (`/admin/users/:userId`).

```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo] PassVault  │ [≡] Admin › Users › alice@…            7h 18m ☀ │
│───────────────────│──────────────────────────────────────────────────│
│                   │  ← Users                                         │
│  Dashboard        │                                                  │
│                   │  alice@example.com                               │
│  Management       │  ──────────────────────────────────────────────  │
│    Users  ◄       │  First name:   Alice             [ Edit ]        │
│    Admin          │  Last name:    Johnson                           │
│                   │  Display name: Alice J.                          │
│  Logs             │  Status:       active                            │
│    Logins         │  Plan:         Free                              │
│                   │  Expires:      2027-01-15                        │
│───────────────────│  Created:      2024-01-15 09:00 UTC              │
│  admin            │  Last Login:   2024-03-10 08:00 UTC              │
│  [Logout]         │  Vault Size:   4.2 KB                            │
│                   │                                                  │
│                   │  [ Download Vault ]                              │
│                   │  [ Lock ]   [ Expire ]   [ Retire ]              │
│                   │  [ Refresh OTP ]    (pending users only)         │
│                   │  [ Delete User ]    (pending/unverified only)    │
└───────────────────┴──────────────────────────────────────────────────┘
```

Click **Edit** next to the profile section to open an inline form where you can update `firstName`, `lastName`, `displayName`, `plan`, and `expiresAt` (or check **♾ Lifetime** to remove the expiry date).

| Button | Available when | Action |
|--------|---------------|--------|
| **Download Vault** | Always | Downloads the user's encrypted vault file |
| **Lock** | Status = `active` or `expired` | Prevents login; user gets `ACCOUNT_SUSPENDED` error |
| **Unlock** | Status = `locked` | Restores login access (status → `active`) |
| **Expire** | Status = `active` or `locked` | User can still read vault but write operations are blocked |
| **Reactivate** | Status = `expired` | Opens a date picker to set a new `expiresAt`; restores full vault access |
| **Retire** | Any non-retired status | Permanently disables account; frees email for reuse (shows confirmation dialog) |
| **Refresh OTP** | Status = `pending_first_login` | Generates and displays a new OTP; sends email if environment supports it |
| **Delete User** | Status = `pending_first_login` or `pending_email_verification` | Permanently removes the user record and all vault files |

> Retired users are removed from the admin list. Their original email address can be used to create a new account immediately.

---

### 3.6 Logins

Navigate to `/admin/logs/logins` via **Logs > Logins** in the sidebar (or click the Logins count on the Dashboard).

```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo] PassVault  │ [≡] Admin › Logs › Logins              6h 55m ☀ │
│───────────────────│──────────────────────────────────────────────────│
│                   │  Logins                                      [↺] │
│  Dashboard        │                                                  │
│                   │  Status [All ▼]  Username [All ▼]               │
│  Management       │  From [          ]  To [          ]             │
│    Users          │  Duration [All durations ▼]  [Clear filters]    │
│    Admin          │                                                  │
│                   │  ┌────────┬──────────┬───────────────┬───────┐  │
│  Logs             │  │ Status │ Username │ Login Time    │ Dur.  │  │
│    Logins  ◄      │  ├────────┼──────────┼───────────────┼───────┤  │
│                   │  │  ✓     │ alice    │ 2024-03-13 …  │ 03:22 │  │
│───────────────────│  │  ✗     │ bob      │ 2024-03-12 …  │ —     │  │
│  admin            │  │  ✓     │ alice    │ 2024-03-11 …  │ 45:00 │  │
│  [Logout]         │  └────────┴──────────┴───────────────┴───────┘  │
└───────────────────┴──────────────────────────────────────────────────┘
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

### 3.7 Email Templates

Navigate to **Email > Templates** in the sidebar to manage email templates.

The template list shows all configured templates organized by type and language. Templates that have been customized from the system defaults display an **edited** badge next to their name.

#### Viewing and Editing

Click any template to view its HTML source. Click **Edit** to modify it, then **Save** to upload the changes. Use the **Preview** button to render the template with sample data before saving.

#### Exporting Templates

Click the **Export** button above the template list to download templates as a `.zip` file.

- The **Modified only** checkbox (checked by default) includes only templates that differ from the system defaults. Uncheck it to export all templates.
- The zip contains HTML files organized by language and type (`en/invitation.html`, `de/vault-backup.html`, etc.) along with a `_export.json` manifest.
- Use exports to back up your customizations before a system upgrade, or to transfer templates between environments.

#### Importing Templates

Click the **Import** button above the template list and select a `.zip` file (in the same format as the export).

After uploading, the system validates each template and shows a summary:

- **Imported**: number of templates successfully updated
- **Warnings**: informational issues that did not block the import (e.g. version mismatch between the zip and the current system, or unrecognized `{{placeholder}}` variables in a template)
- **Errors**: files that were skipped (e.g. unrecognized template type or language)

Review warnings carefully -- an unknown placeholder like `{{myCustomVar}}` will be replaced with an empty string at send time.

---

*End of User Manual*
