# PassVault - Testing Guide

## Running Tests

```bash
# All tests across all packages (from repo root)
npm test

# Single package
npm test --workspace=backend
npm test --workspace=frontend
npm test --workspace=cdk

# Type checking (all packages)
npm run typecheck
```

No AWS credentials or deployed stack required for unit tests or type checking.

---

## Package Testing Guides

| Package | Tests | Guide |
|---------|-------|-------|
| Backend | ~280 tests (services, handlers, middleware, utils) | [backend/TESTING.md](backend/TESTING.md) |
| Frontend | ~200 tests (components, hooks, services) | [frontend/TESTING.md](frontend/TESTING.md) |
| CDK | ~60 tests (stack synthesis, constructs) | Run with `npm test --workspace=cdk` |
| Shared | ~57 tests (password policy, configs, constants) | Run with `npm test --workspace=shared` |

---

## Smoke Tests

`scripts/smoke-test.ts` runs automated API tests against a deployed stack:

```bash
# Public + rejection tests (no credentials needed)
ENVIRONMENT=beta npx tsx scripts/smoke-test.ts

# Full suite including admin login
ENVIRONMENT=beta npx tsx scripts/smoke-test.ts --password <admin-password>
```

See [scripts/README.md](scripts/README.md) for details.

---

## Pre-Deployment Checklist

Before promoting from dev to beta to prod:

- [ ] `npm test` passes (all unit tests green)
- [ ] `npm run typecheck` passes (no type errors in any package)
- [ ] `npm run build` succeeds (shared, backend, frontend)
- [ ] `ENVIRONMENT=<env> npx tsx scripts/smoke-test.ts --password <pw>` passes
- [ ] Admin login and first-password-change flow works end-to-end
- [ ] User creation, login, vault item CRUD works
- [ ] Multi-vault: free users limited to 1, pro users to 10
- [ ] (Prod only) Passkey registration and login work correctly
- [ ] OTP expiry enforced; Refresh OTP issues working replacement
- [ ] User lifecycle: lock/unlock/expire/retire work correctly
- [ ] Warning codes: duplicate password badge appears and clears
- [ ] (Prod) Email verification flow works
- [ ] (Beta/prod) SES `SENDER_EMAIL` is set; emails deliver
