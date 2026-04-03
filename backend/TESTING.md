# Backend Testing

## Running Tests

```bash
# All backend tests
npm test --workspace=backend

# Watch mode
npm run test:watch --workspace=backend

# Single file
npx vitest run src/services/auth.test.ts --workspace=backend
```

## Type Checking

```bash
npm run typecheck --workspace=backend
# or directly:
cd backend && npx tsc --noEmit
```

No AWS credentials or deployed stack required for either tests or type checking.

---

## Test Inventory

### Utilities

| File | Tests | Covers |
|------|-------|--------|
| `utils/jwt.test.ts` | 6 | `signToken`/`verifyToken` round-trips, tamper detection, wrong secret |
| `utils/crypto.test.ts` | 13 | `hashPassword`/`verifyPassword`, `generateOtp`, `generateSalt` |
| `utils/password.test.ts` | 10 | `validatePassword` — all policy rules, username rejection |
| `utils/router.test.ts` | ~20 | Router method matching, middleware chain, path parameters |

### Middleware

| File | Tests | Covers |
|------|-------|--------|
| `middleware/auth.test.ts` | 13 | JWT extraction, missing header, wrong role, expired token |
| `middleware/pow.test.ts` | 7 | PoW validation, difficulty check, TTL expiry, disabled mode |
| `middleware/honeypot.test.ts` | 8 | Hidden field detection, disabled mode |

### Services

| File | Tests | Covers |
|------|-------|--------|
| `services/auth.test.ts` | 31 | Login (OTP, normal, passkeyToken), changePassword, lockout, status checks |
| `services/admin.test.ts` | 90 | adminLogin, createUserInvitation, listUsers, lock/unlock/expire/retire/reactivate, updateUserProfile, emailUserVault, verifyEmailToken |
| `services/vault.test.ts` | 24 | getVault, putVault, downloadVault, sendVaultEmail, createVault (plan limits), deleteVault |
| `services/passkey.test.ts` | 11 | Challenge JWTs, passkey tokens, WebAuthn assertion/attestation |
| `services/challenge.test.ts` | 3 | Challenge generation, PoW solution validation |

### Handlers

| File | Tests | Covers |
|------|-------|--------|
| `handlers/auth.test.ts` | 25 | Routing, PoW/honeypot middleware, passkey endpoints, email verification, logout |
| `handlers/admin-auth.test.ts` | ~20 | Admin login, change-password, passkey endpoints |
| `handlers/admin-management.test.ts` | ~30 | User CRUD, lock/unlock/expire/retire/reactivate, stats, login-events |
| `handlers/vault.test.ts` | 13 | Vault CRUD, auth middleware, status checks |
| `handlers/health.test.ts` | 4 | Health check |
| `handlers/challenge.test.ts` | 3 | Challenge handler |

---

## Mocking Conventions

All tests mock AWS SDK calls — no real AWS resources are used.

**Module-level mocks** (`vi.mock`):

```typescript
vi.mock('../config.js', () => ({
  config: { environment: 'dev', features: { ... } },
  getJwtSecret: vi.fn().mockResolvedValue('test-secret'),
  DYNAMODB_TABLE: 'test-table',
  FILES_BUCKET: 'test-bucket',
}));
```

**Typed mock references** (`vi.mocked`):

```typescript
import { getUserByUsername } from '../utils/dynamodb.js';
const mockGetUser = vi.mocked(getUserByUsername);
mockGetUser.mockResolvedValue({ userId: '123', ... });
```

Handler tests mock at the **service** layer (not DynamoDB). Service tests mock at the **utility** layer (DynamoDB, S3, JWT).

---

## Adding a Test

Place test files alongside the source they test with a `.test.ts` suffix. Vitest discovers them automatically.

```
src/services/
  auth.ts
  auth.test.ts   <- here
```

---

## Smoke Tests

See [../scripts/README.md](../scripts/README.md) for `smoke-test.ts` — automated API tests against a deployed stack.
