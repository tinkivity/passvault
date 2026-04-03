# Backend Architecture

## Overview

The backend is a serverless Node 22 application deployed as a set of AWS Lambda functions behind API Gateway. All API paths are prefixed with `/api/`. Each Lambda is individually bundled and handles a subset of routes using a lightweight in-process router.

## Lambda Entry Points

Eight handler files live in `src/handlers/`. Each exports a `handler` function consumed by Lambda:

| Handler | File | Purpose |
|---|---|---|
| **auth** | `auth.ts` | User login, password changes, profile updates, logout, passkey flows |
| **admin-auth** | `admin-auth.ts` | Admin login, admin password change, admin passkey flows |
| **admin-management** | `admin-management.ts` | User CRUD, lock/unlock/expire/retire, OTP refresh, vault download, stats, login events |
| **vault** | `vault.ts` | Vault CRUD, download, email, warning codes, notification preferences |
| **challenge** | `challenge.ts` | Generates proof-of-work challenges (single endpoint, no router) |
| **health** | `health.ts` | Returns environment name and timestamp (single endpoint, no router) |
| **ses-notifier** | `ses-notifier.ts` | SNS-triggered; forwards monitoring alerts via SES email |
| **digest** | `digest.ts` | EventBridge-triggered daily; sends failed-login digests and vault backup emails |

The `challenge` and `health` handlers are simple single-endpoint functions. The `ses-notifier` and `digest` handlers are event-driven (SNS and EventBridge respectively) rather than API Gateway-triggered. The remaining four (`auth`, `admin-auth`, `admin-management`, `vault`) use the `Router` abstraction described below.

## Router Abstraction

`src/utils/router.ts` provides a minimal `Router` class that maps HTTP method + path to a handler function, with an ordered middleware chain per route.

**Key types:**

- `Middleware` -- `(event) => Promise<APIGatewayProxyResult | null>`. Returns `null` to continue, or a response to short-circuit.
- `RouteHandler` -- `(event, params) => Promise<APIGatewayProxyResult>`.

**Dispatch flow:**

1. Iterate registered routes in insertion order.
2. Match on HTTP method and path template (path parameters like `{vaultId}` are matched via regex).
3. Run each middleware in order; if any returns a non-null response, return it immediately.
4. Call the route handler.
5. If no route matches, return 404. Uncaught exceptions return 500.

Routes are registered declaratively at module scope. Example from `auth.ts`:

```ts
router.post(API_PATHS.AUTH_LOGIN, [pow(MEDIUM), honeypot(), validate(LoginSchema)], handleLogin);
```

Static paths must be registered before parameterized paths to avoid ambiguity, since matching is by insertion order.

## Middleware Layer

Four middleware modules live in `src/middleware/`. The router re-exports adapter factories (`pow()`, `honeypot()`, `auth()`, `adminActive()`) that wrap each middleware into the `Middleware` signature.

| Middleware | Factory | Purpose |
|---|---|---|
| `pow.ts` | `pow(difficulty)` | Validates the proof-of-work nonce in request headers. Difficulty levels: LOW (16), MEDIUM (18), HIGH (20). |
| `honeypot.ts` | `honeypot()` | Rejects requests that populate a hidden honeypot field (bot detection). |
| `auth.ts` | `auth()` | Extracts and verifies the JWT from the `Authorization` header. Attaches user to the event. |
| `auth.ts` | `adminActive()` | Same as `auth()` but additionally requires the user to have an admin role and active status. |
| `validate.ts` | `validate(schema)` | Parses the request body and validates it against a Zod schema. Returns 400 with field errors on failure. |

**Typical ordering:** `pow` -> `honeypot` (public routes) or `pow` -> `auth`/`adminActive` (authenticated routes), then `validate` when a request body is expected.

## Shared Passkey Handlers

`src/handlers/passkey.shared.ts` contains passkey handler functions (`handlePasskeyChallenge`, `handlePasskeyVerify`, `handlePasskeyRegisterChallenge`, `handlePasskeyRegister`) shared by both the `auth` and `admin-auth` Lambdas. Each caller passes a `UserRole` argument (`'user'` or `'admin'`) to scope the operation. This avoids duplicating WebAuthn logic across the two authentication Lambdas.

## Service Layer

Services in `src/services/` contain business logic, called by handlers.

**auth.ts** -- User login (password verification via Argon2/bcrypt, JWT issuance), password changes (admin-initiated and self-service), profile updates, and email token verification. Records login events fire-and-forget.

**admin.ts** -- Admin-specific login, user invitation creation (generates OTP), user lifecycle management (lock, unlock, expire, retire, reactivate, delete), OTP refresh, stats aggregation, login event listing, and admin-initiated vault email.

**vault.ts** -- CRUD operations for encrypted vaults stored in S3. Handles listing, creation, renaming, deletion, download, and email delivery of vault data. Also manages warning codes and vault size tracking.

**passkey.ts** -- WebAuthn operations using `@simplewebauthn/server`. Generates challenge JWTs, verifies passkey assertions (login) and attestations (registration), and produces passkey tokens consumed by the login flow.

**challenge.ts** -- Generates proof-of-work challenges with a random prefix and configurable difficulty, returned to clients before authenticated requests.

## Passkey Credentials Table

Passkey credentials are stored in a dedicated DynamoDB table (`passvault-passkey-credentials-{env}`) rather than as attributes on the user record. This supports a multi-passkey model where users can register multiple passkeys (max 10 for users, max 2 for admins).

**Table schema:**
- Partition key: `credentialId` (String, base64url)
- GSI `byUser`: partition key `userId` -- used to list all credentials for a user

**CRUD functions** (in `dynamodb.ts`):
- `createPasskeyCredential` -- stores a new credential with public key, counter, transports, aaguid, and user-assigned name
- `getPasskeyCredential` -- fetches a single credential by ID (used during login verification)
- `listPasskeyCredentials` -- queries the `byUser` GSI to return all credentials for a user
- `deletePasskeyCredential` -- removes a credential by ID (revocation)
- `updatePasskeyCounter` -- increments the signature counter after successful authentication

`getUserByCredentialId` resolves a credential ID to its owning user by first querying the credentials table (O(1) lookup via partition key), then fetching the user record. This replaces the previous approach of scanning the users table.

**Endpoints:**
- `GET /api/auth/passkeys` -- lists the authenticated user's passkey credentials
- `DELETE /api/auth/passkeys/{credentialId}` -- revokes a specific passkey credential
- `GET /api/admin/passkeys` -- lists the authenticated admin's passkey credentials
- `DELETE /api/admin/passkeys/{credentialId}` -- revokes a specific admin passkey credential

Login events now include `passkeyCredentialId` and `passkeyName` fields, enabling audit trails that identify which specific passkey was used for each login.

## Utility Layer

| File | Purpose |
|---|---|
| `dynamodb.ts` | DynamoDB document client wrapper. User, passkey-credential, and login-event CRUD, queries by email and credential ID, GSI lookups. |
| `s3.ts` | S3 client wrapper for vault file storage (put, get, delete, list, copy). |
| `jwt.ts` | JWT signing and verification using the secret fetched from SSM Parameter Store. |
| `crypto.ts` | Cryptographic helpers (random token generation, hashing). |
| `password.ts` | Password hashing (Argon2id primary, bcrypt fallback) and verification with automatic rehashing. |
| `response.ts` | `success()` and `error()` helpers that produce `APIGatewayProxyResult` objects in a standardized `{ success, data/error }` envelope. |
| `request.ts` | `parseBody()` for safe JSON parsing of request bodies with base64 decoding support. |
| `ses.ts` | SES email sending wrapper. |

## Request Validation

Request bodies are validated using Zod schemas defined in co-located `.schemas.ts` files (e.g., `auth.schemas.ts`, `vault.schemas.ts`, `admin-management.schemas.ts`).

The `validate(schema)` middleware factory in `src/middleware/validate.ts` runs `schema.safeParse()` on the parsed body. On failure it returns a 400 response with flattened field-level error messages. On success (returns `null`), the handler later re-parses the body -- the middleware serves as a guard, not a transformer.

## Configuration

`src/config.ts` loads environment-specific configuration from the `@passvault/shared` package and resolves table/bucket names from environment variables with sensible defaults. The JWT secret is fetched lazily from AWS SSM Parameter Store (`/passvault/{env}/jwt-secret`) and cached in-process.

## Build

`build.mjs` uses esbuild to bundle each handler into its own directory under `dist/`:

```
dist/{name}/{name}.js
```

Build settings:
- **Format:** CommonJS
- **Platform:** Node 22
- **External:** `@aws-sdk/*` (provided by the Lambda runtime)
- **Source maps:** enabled
- **Minification:** disabled

The CDK stack references each handler at `../backend/dist/{name}/` with entry point `{name}.handler`.
