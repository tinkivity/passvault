# Frontend Testing

## Running Tests

```bash
# All frontend tests
npm test --workspace=frontend

# Watch mode
npm run test:watch --workspace=frontend

# Single file
npx vitest run src/components/admin/UserList.test.tsx --workspace=frontend
```

## Type Checking

```bash
npm run typecheck --workspace=frontend
# or directly:
cd frontend && npx tsc --noEmit
```

No AWS credentials or deployed stack required.

---

## Test Inventory

### Services and Hooks

| File | Tests | Covers |
|------|-------|--------|
| `services/honeypot.test.ts` | 6 | Hidden field generation, timing |
| `hooks/useAutoLogout.test.ts` | 7 | Timer countdown, auto-logout, activity reset |
| `hooks/useVault.computeWarnings.test.ts` | 8 | `computeWarnings` — duplicate/weak password detection |
| `context/AuthContext.test.tsx` | 4 | Auth state, plan field, logout |

### Components

| File | Tests | Covers |
|------|-------|--------|
| `components/vault/CountdownTimer.test.tsx` | 8 | Timer display, expiry callback |
| `components/vault/ConfirmDialog.test.tsx` | 5 | Confirm/cancel dialog |
| `components/admin/OtpDisplay.test.tsx` | 5 | OTP display, copy, Done |
| `components/admin/AdminBreadcrumbs.test.tsx` | 10 | Breadcrumb rendering for all routes |
| `components/admin/AdminSidebar.test.tsx` | 15 | Sidebar nav, collapsible sections |
| `components/admin/CreateUserForm.test.tsx` | 14 | Email validation, plan toggle, expiresAt, OTP display |
| `components/admin/UserList.test.tsx` | 41 | Table, sorting, filters, row actions, confirmation dialogs |
| `components/admin/pages/DashboardPage.test.tsx` | 9 | Stats cards, chart rendering |
| `components/admin/pages/AdminPage.test.tsx` | 10 | Admin account management |
| `components/admin/pages/UserDetailPage.test.tsx` | 26 | User detail, inline edit, lifecycle buttons |
| `components/admin/pages/LoginsPage.test.tsx` | 34 | Login events table, sorting, filtering |
| `components/layout/Layout.test.tsx` | 11 | Layout rendering, environment banner |

---

## Adding a Test

Place test files alongside the source with a `.test.ts` or `.test.tsx` suffix. Vitest discovers them automatically.

```
src/components/vault/
  SecretField.tsx
  SecretField.test.tsx   <- here
```

---

## E2E Browser Tests (Playwright)

E2E tests run in headless Chromium against a deployed stack. The test specs live in `e2e/specs/` and use a shared auth fixture in `e2e/fixtures/auth.fixture.ts`.

### Running E2E tests

```bash
# Recommended: use the wrapper script from repo root
./scripts/e2etest.sh --env dev --profile <aws-profile>

# Interactive debugging
./scripts/e2etest.sh --env dev --profile <aws-profile> --ui

# View the last HTML report
npx playwright show-report e2e-report
```

See [docs/TESTING.md](../docs/TESTING.md#e2e-browser-tests-playwright) for full documentation including environment variables and example output.

### E2E test inventory

| Spec | Tests | Status | What it covers |
|------|-------|--------|---------------|
| `e2e/specs/01-auth.spec.ts` | 7 | Active | Login via API injection, logout (header icon + sidebar fallback), invalid credentials, route guards for /ui and /ui/admin, sidebar never renders raw displayName ciphertext |
| `e2e/specs/02-admin-users.spec.ts` | 6 | Active | Dashboard heading, users table, create user + OTP dialog, view user detail, edit user, delete user |
| `e2e/specs/03-admin-templates.spec.ts` | 5 | Active | Email templates page, language tabs (EN/DE/FR/RU), preview in new tab, download, upload + edited badge |
| `e2e/specs/04-vault-unlock.spec.ts` | 3 | Fixme | Vault unlock with password (needs vault data fixture) |
| `e2e/specs/05-vault-items.spec.ts` | 3 | Fixme | Create/search/delete vault items (needs vault data fixture) |
| `e2e/specs/06-notifications.spec.ts` | 3 | Fixme | Notification preferences (only available for `role=user`, not admin) |
| `e2e/specs/07-language.spec.ts` | 2 | Active | Switch to German via globe icon, switch back to English |
| `e2e/specs/08-vault-crud.spec.ts` | 3 | Active | Vault `displayName` round-trip: create (unicode), rename, delete via API + sidebar assertions |
| `e2e/specs/09-admin-user-lifecycle.spec.ts` | 9 | 8 active, 1 fixme | Admin actions on users: lock/unlock, expire/reactivate, retire, reset login, refresh OTP. `email-vault` is fixme (UI disabled on dev, SES blocked on beta) |
| `e2e/specs/10-user-onboarding.spec.ts` | 3 | Active | OTP login → onboarding → change-password flow for both user and admin roles; old OTP rejected after change |
| `e2e/specs/11-passkey.spec.ts` | 6 | Active | Passkey registration + login, multi-passkey management in Security dialog, password-login blocked after passkey setup, admin two-step login, cleared-credential failure mode |
| `e2e/specs/12-vault-import-gz.spec.ts` | 2 | Active | Import dialog accepts `.vault.gz` and plain `.json` (uses pre-baked encrypted fixture in `e2e/fixtures/known-vault.*`) |
| `e2e/specs/13-user-avatar.spec.ts` | 3 | Active | Default puppy avatar in sidebar, AccountDialog renders large avatar, custom `avatarBase64` survives page reload |

### Auth fixture

The `adminPage` fixture (`e2e/fixtures/auth.fixture.ts`) authenticates via direct API call to `/api/auth/login` and injects the session into `sessionStorage` (key `pv_session`). This bypasses browser form submission, avoiding race conditions with `vite preview` where React event handlers may not be attached when Playwright clicks the submit button.

### Debugging failures

- **Screenshots**: `e2e-results/<test>/test-failed-1.png`
- **Video**: `e2e-results/<test>/video.webm`
- **Traces**: `npx playwright show-trace e2e-results/<test>/trace.zip`
- **HTML report**: `e2e-report/index.html`

---

## Manual UI Testing

Use `scripts/post-deploy.sh --env dev` to test against a deployed dev stack:

```bash
# Start local dev server pointing at the deployed dev backend
./scripts/post-deploy.sh --env dev --profile my-profile
```

The script reads API URL from CloudFormation outputs, writes `.env.local`, starts Vite at `http://localhost:5173`, and cleans up on exit.

### What to test manually

**Admin flow:**
1. Log in with OTP (printed on first run) at `/login`
2. Change password when prompted
3. Create a test user from the dashboard

**User flow:**
1. Log in with test user OTP
2. Change password
3. Add/edit vault items, verify encryption round-trip
4. Download encrypted backup

**Session timeouts (dev):** view=5 min, edit=10 min, admin=24 hours.

See [../scripts/README.md](../scripts/README.md) for full script documentation.
