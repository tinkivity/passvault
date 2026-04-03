# @passvault/shared

Shared contract layer for the PassVault monorepo. This package defines the types, configuration objects, and constants that all other packages (`backend`, `frontend`, `cdk`) depend on. It contains no runtime dependencies -- only TypeScript compiled to ESM.

## What it exports

### Types

Type modules re-exported from `src/types/`:

| Module | Contents |
|---|---|
| `api` | `ApiResponse<T>`, `ApiError`, request/response shapes |
| `auth` | `LoginRequest`, `LoginResponse`, passkey payloads |
| `user` | `User`, `UserStatus`, `UserRole`, `UserSummary` |
| `admin` | `AdminStats`, admin action request/response types |
| `vault` | `Vault`, vault CRUD payloads |
| `vault-schema` | Zod-based vault data schema types |
| `challenge` | PoW challenge request/response types |
| `environment` | `EnvironmentName`, `EnvironmentConfig`, `FeatureFlags`, `SessionConfig`, etc. |

### Configuration

Exported from `src/config/`:

- **`getEnvironmentConfig(env)`** -- returns the full `EnvironmentConfig` for `'dev'`, `'beta'`, or `'prod'`. Includes feature flags, session timeouts, Lambda sizing, monitoring, and throttle settings.
- **`validatePassword(password, username?)`** -- shared password-policy check (min 12 chars, upper/lower/digit/special, no username).
- **`PASSWORD_MIN_LENGTH`** -- the minimum password length constant (12).
- **`ARGON2_PARAMS`**, **`AES_PARAMS`**, **`SALT_LENGTH`**, **`ENCRYPTION_ALGORITHM`** -- client-side encryption parameters (Argon2id + AES-256-GCM).

### Constants

Exported from `src/constants.ts`:

- **`API_PATHS`** -- all REST endpoint paths (e.g. `API_PATHS.AUTH_LOGIN` = `'/api/auth/login'`).
- **`POW_CONFIG`** -- proof-of-work difficulty levels (`LOW=16`, `MEDIUM=18`, `HIGH=20`) and challenge TTL.
- **`POW_HEADERS`** -- header names for PoW solution transport.
- **`PASSKEY_CONFIG`** -- WebAuthn RP name, challenge/token expiry.
- **`ERRORS`** -- standardised error message strings used by backend responses and frontend display.
- **`LIMITS`** -- file size cap (1 MB), username length, rate-limit window, vault limits per plan.

## Importing

All other monorepo packages import from the package name:

```ts
import { getEnvironmentConfig, API_PATHS, ERRORS } from '@passvault/shared';
import type { User, EnvironmentConfig } from '@passvault/shared';
```

## Rebuilding after changes

The package compiles with `tsc` to `dist/`. After editing any file in `shared/src/`, you must rebuild before dependent packages will see the changes:

```sh
cd shared && npm run build
```

Dependent packages reference `@passvault/shared` via workspace linking; they resolve to `shared/dist/index.js` and `shared/dist/index.d.ts`.
