#!/usr/bin/env bash
# e2etest.sh — Run PassVault Playwright E2E tests against a deployed stack.
#
# Creates a temporary admin user, starts a local Vite dev server pointed at
# the deployed API, runs Playwright tests, then cleans up on exit.
#
# Usage:
#   ./scripts/e2etest.sh --env <dev|beta> [options]
#   ./scripts/e2etest.sh --cleanup [state-file] --env <dev|beta> [--profile <name>]
#
# Options:
#   --env <env>            Environment (required; dev or beta ONLY)
#   --profile <name>       AWS named profile
#   --region <region>      AWS region (default: eu-central-1)
#   --stack <name>         CloudFormation stack name override
#   --base-url <url>       API base URL override (skips CloudFormation lookup)
#   --keep                 Keep test user and state after run (default: cleanup)
#   --cleanup [state-file] Skip tests; only clean up data from a previous --keep run.
#   --headed               Run in headed mode (visible browser)
#   --ui                   Run in Playwright UI mode (interactive)
#   -h, --help             Show usage

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV=""
PROFILE=""
REGION="eu-central-1"
STACK=""
BASE_URL=""
KEEP=false
CLEANUP=false
CLEANUP_FILE=""
RERUN=false
HEADED=false
UI_MODE=false
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VITE_PID=""
VITE_PORT=5173

USAGE="Usage: $0 --env <dev|beta> [options]
       $0 --rerun --env <dev|beta> [--profile <name>]
       $0 --cleanup [state-file] --env <dev|beta> [--profile <name>]

Options:
  --env <env>             Environment (required; dev or beta ONLY)
  --profile <name>        AWS named profile
  --region <region>       AWS region (default: eu-central-1)
  --stack <name>          CloudFormation stack name override
  --base-url <url>        API base URL override (skips CloudFormation lookup)
  --keep                  Keep test user after run (default: cleanup)
  --rerun                 Re-run only the tests that failed in the last run.
                          Requires --env and a state file from a prior --keep
                          run. Reuses the same admin user; leaves state in
                          place so you can iterate. Does not touch AWS.
  --cleanup [state-file]  Skip tests; only clean up from a previous --keep run
  --headed                Run in headed mode (visible browser)
  --ui                    Run in Playwright UI mode (interactive)
  -h, --help              Show usage"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)            ENV="$2";            shift 2 ;;
    --profile)        PROFILE="$2";        shift 2 ;;
    --region)         REGION="$2";         shift 2 ;;
    --stack)          STACK="$2";          shift 2 ;;
    --base-url)       BASE_URL="$2";       shift 2 ;;
    --keep)           KEEP=true;           shift ;;
    --rerun)          RERUN=true;          shift ;;
    --headed)         HEADED=true;         shift ;;
    --ui)             UI_MODE=true;        shift ;;
    --cleanup)
      CLEANUP=true
      if [[ $# -ge 2 && "$2" != --* ]]; then
        CLEANUP_FILE="$2"
        shift 2
      else
        shift
      fi
      ;;
    -h|--help)        echo "$USAGE"; exit 0 ;;
    *)                echo "Unknown option: $1" >&2; echo "$USAGE" >&2; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
section() {
  echo ""
  echo "── $1 "
}

if [[ -n "$PROFILE" ]]; then
  export AWS_PROFILE="$PROFILE"
fi

# ── Cleanup-only mode ────────────────────────────────────────────────────────
if [[ "$CLEANUP" == "true" ]]; then

  if [[ -z "$CLEANUP_FILE" ]]; then
    if [[ -z "$ENV" ]]; then
      echo "Error: --cleanup without a state file requires --env." >&2
      echo "$USAGE" >&2
      exit 1
    fi

    shopt -s nullglob
    MATCHES=( "$REPO_ROOT"/.e2e-state-"${ENV}"-*.json )
    shopt -u nullglob

    if [[ ${#MATCHES[@]} -eq 0 ]]; then
      echo "No E2E state files found for env '$ENV'. Nothing to clean up."
      exit 0
    elif [[ ${#MATCHES[@]} -gt 1 ]]; then
      echo "Multiple E2E state files found for env '$ENV':" >&2
      for f in "${MATCHES[@]}"; do
        echo "  $(basename "$f")" >&2
      done
      echo "" >&2
      echo "Specify which one to clean up:" >&2
      echo "  $0 --cleanup <state-file> --env $ENV" >&2
      exit 1
    fi

    CLEANUP_FILE="${MATCHES[0]}"
    echo "Auto-discovered state file: $(basename "$CLEANUP_FILE")"
  fi

  if [[ ! -f "$CLEANUP_FILE" ]]; then
    echo "Error: state file not found: $CLEANUP_FILE" >&2
    exit 1
  fi

  STATE_ENV=$(jq -r '.env' "$CLEANUP_FILE")
  STATE_REGION=$(jq -r '.region // empty' "$CLEANUP_FILE")
  [[ -n "$STATE_REGION" ]] && REGION="$STATE_REGION"

  echo ""
  echo "PassVault E2E Cleanup"
  echo "  State file  : $(basename "$CLEANUP_FILE")"
  echo "  Environment : $STATE_ENV"
  echo "  Region      : $REGION"
  [[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
  echo ""

  section "AWS credentials"
  if ! aws sts get-caller-identity --region "$REGION" &>/dev/null; then
    echo "  No AWS access — cannot reach AWS STS."
    [[ -n "$PROFILE" ]] \
      && echo "    aws sso login --profile $PROFILE" \
      || echo "    aws sso login"
    exit 1
  fi
  echo "  AWS credentials valid."

  section "Cleanup"
  ENVIRONMENT="$STATE_ENV" \
  SIT_ADMIN_EMAIL=$(jq -r '.adminEmail' "$CLEANUP_FILE") \
  SIT_ADMIN_USER_ID=$(jq -r '.adminUserId' "$CLEANUP_FILE") \
  DYNAMODB_TABLE=$(jq -r '.usersTable' "$CLEANUP_FILE") \
  VAULTS_TABLE_NAME=$(jq -r '.vaultsTable' "$CLEANUP_FILE") \
  LOGIN_EVENTS_TABLE_NAME=$(jq -r '.loginEventsTable' "$CLEANUP_FILE") \
  FILES_BUCKET=$(jq -r '.filesBucket // empty' "$CLEANUP_FILE") \
  CLEANUP_LABEL="E2E" \
    npx tsx "$REPO_ROOT/scripts/sit-cleanup.ts"

  rm -f "$CLEANUP_FILE"
  echo "  State file removed: $(basename "$CLEANUP_FILE")"
  echo ""
  exit 0
fi

# ── Normal mode: require --env ───────────────────────────────────────────────
if [[ -z "$ENV" ]]; then
  echo "Error: --env is required." >&2
  echo "$USAGE" >&2
  exit 1
fi

if [[ "$ENV" == "prod" ]]; then
  echo "Error: E2E tests cannot run against prod." >&2
  exit 1
fi

case "$ENV" in
  dev|beta) ;;
  *)
    echo "Error: unknown environment '$ENV'. Valid values: dev, beta." >&2
    exit 1
    ;;
esac

if [[ -z "$STACK" ]]; then
  STACK_ENV="$(echo "$ENV" | tr '[:lower:]' '[:upper:]' | cut -c1)$(echo "$ENV" | cut -c2-)"
  STACK="PassVault-${STACK_ENV}"
fi

# ── Preflight ────────────────────────────────────────────────────────────────
if [[ "$RERUN" != "true" ]]; then
  echo ""
  echo "PassVault E2E Tests"
  echo "  Environment : $ENV"
  echo "  Stack       : $STACK"
  echo "  Region      : $REGION"
  [[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
  echo ""
fi

# Check Playwright is installed
if ! (cd "$REPO_ROOT/frontend" && npx playwright --version &>/dev/null); then
  echo "Error: Playwright not installed. Run:" >&2
  echo "  cd frontend && npm install && npx playwright install chromium" >&2
  exit 1
fi

# ── Rerun mode: load state from a prior --keep run, skip admin creation ─────
if [[ "$RERUN" == "true" ]]; then
  shopt -s nullglob
  MATCHES=( "$REPO_ROOT"/.e2e-state-"${ENV}"-*.json )
  shopt -u nullglob

  if [[ ${#MATCHES[@]} -eq 0 ]]; then
    echo "Error: no state file found for env '$ENV'." >&2
    echo "Run with --keep first to create one:" >&2
    echo "  $0 --env $ENV --keep" >&2
    exit 1
  fi
  if [[ ${#MATCHES[@]} -gt 1 ]]; then
    echo "Error: multiple state files found for env '$ENV':" >&2
    for f in "${MATCHES[@]}"; do
      echo "  $(basename "$f")" >&2
    done
    echo "Clean up the extras first with --cleanup <state-file>." >&2
    exit 1
  fi

  STATE_FILE="${MATCHES[0]}"

  API_URL=$(jq -r '.apiUrl // empty' "$STATE_FILE")
  TABLE=$(jq -r '.usersTable' "$STATE_FILE")
  FILES_BUCKET=$(jq -r '.filesBucket // empty' "$STATE_FILE")
  E2E_EMAIL=$(jq -r '.adminEmail' "$STATE_FILE")
  E2E_USER_ID=$(jq -r '.adminUserId' "$STATE_FILE")
  E2E_PASSWORD=$(jq -r '.adminPassword // empty' "$STATE_FILE")
  E2E_NAME=$(basename "$STATE_FILE" .json | sed "s|^\.e2e-state-${ENV}-||")

  if [[ -z "$API_URL" || -z "$E2E_PASSWORD" ]]; then
    echo "Error: state file '$(basename "$STATE_FILE")' is from an older --keep run" >&2
    echo "and is missing apiUrl or adminPassword. Delete it and re-run with --keep:" >&2
    echo "  $0 --cleanup --env $ENV" >&2
    echo "  $0 --env $ENV --keep" >&2
    exit 1
  fi

  section "E2E rerun"
  echo "  State file  : $(basename "$STATE_FILE")"
  echo "  Environment : $ENV"
  echo "  Admin email : $E2E_EMAIL"
  echo "  API URL     : $API_URL"
  echo "  Reusing existing admin user; --last-failed only."

  # Treat rerun as an implicit --keep so on_exit preserves admin + state file.
  KEEP=true
fi

# ── AWS access check (skipped on --rerun — no AWS calls needed) ─────────────
if [[ "$RERUN" != "true" ]]; then
section "AWS credentials"
if ! aws sts get-caller-identity --region "$REGION" &>/dev/null; then
  echo "  No AWS access — cannot reach AWS STS."
  echo "  Your SSO session may have expired. Run:"
  [[ -n "$PROFILE" ]] \
    && echo "    aws sso login --profile $PROFILE" \
    || echo "    aws sso login"
  echo ""
  exit 1
fi
echo "  AWS credentials valid."

# ── Fetch CloudFormation outputs ─────────────────────────────────────────────
_cfn_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
    --output text
}

section "Stack outputs"

TABLE=$(_cfn_output UsersTableName) || {
  echo "Error: could not read stack outputs for $STACK." >&2
  exit 1
}

if [[ -z "$TABLE" || "$TABLE" == "None" ]]; then
  echo "Error: UsersTableName output not found in stack $STACK." >&2
  exit 1
fi

FILES_BUCKET=$(_cfn_output FilesBucketName) || FILES_BUCKET=""
[[ "$FILES_BUCKET" == "None" ]] && FILES_BUCKET=""

if [[ -n "$BASE_URL" ]]; then
  API_URL="${BASE_URL%/}"
else
  API_URL=$(_cfn_output ApiUrl) || {
    echo "Error: could not read ApiUrl from stack $STACK." >&2
    exit 1
  }
  if [[ -z "$API_URL" || "$API_URL" == "None" ]]; then
    echo "Error: ApiUrl output not found in stack $STACK." >&2
    exit 1
  fi
  API_URL="${API_URL%/}"
fi

echo "  API URL     : $API_URL"
echo "  Users table : $TABLE"

# ── Create E2E admin user ────────────────────────────────────────────────────
section "E2E admin setup"

ADJECTIVES=("swift" "vivid" "lucid" "agile" "crisp" "noble" "prime" "brisk")
NOUNS=("puma" "kite" "heron" "otter" "raven" "viper" "ibis" "newt")
E2E_NAME="${ADJECTIVES[$((RANDOM % 8))]}-${NOUNS[$((RANDOM % 8))]}"
E2E_EMAIL="e2e-${E2E_NAME}@passvault-test.local"

echo "  E2E admin   : $E2E_EMAIL"

E2E_JSON=$(ENVIRONMENT="$ENV" ADMIN_EMAIL="$E2E_EMAIL" DYNAMODB_TABLE="$TABLE" \
  npx tsx "$REPO_ROOT/scripts/sit-create-admin.ts" 2>/dev/null)

if [[ -z "$E2E_JSON" ]]; then
  echo "  ERROR: Failed to create E2E admin."
  exit 1
fi

E2E_OTP=$(echo "$E2E_JSON" | jq -r '.otp')
E2E_USER_ID=$(echo "$E2E_JSON" | jq -r '.userId')

if [[ -z "$E2E_OTP" || "$E2E_OTP" == "null" ]]; then
  echo "  ERROR: Failed to capture OTP from sit-create-admin.ts"
  exit 1
fi

echo "  E2E admin created (OTP: ${#E2E_OTP} chars, userId: ${E2E_USER_ID:0:8}...)."

# The admin needs to be onboarded (change password) before E2E tests can use it.
# Generate a random password for the E2E admin session.
E2E_PASSWORD="E2e$(openssl rand -hex 12)!Pw"

echo "  Onboarding E2E admin (login + password change)..."

# Login with OTP. sit-create-admin.ts writes the user to DynamoDB via a direct
# PutCommand; the login endpoint reads via the username-index GSI which is
# eventually consistent. If the GSI hasn't propagated yet, the login returns
# a 401 with "Invalid username or password" — the same error as a bad password.
# Retry a few times with backoff to absorb this.
LOGIN_TOKEN=""
LOGIN_RES=""
for attempt in 1 2 3 4 5; do
  LOGIN_RES=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$E2E_EMAIL\",\"password\":\"$E2E_OTP\"}")
  LOGIN_TOKEN=$(echo "$LOGIN_RES" | jq -r '.data.token // empty')
  if [[ -n "$LOGIN_TOKEN" ]]; then
    break
  fi
  if [[ "$attempt" -lt 5 ]]; then
    echo "  Login attempt $attempt returned no token; retrying in 2s (likely GSI propagation)..."
    sleep 2
  fi
done

if [[ -z "$LOGIN_TOKEN" ]]; then
  echo "  ERROR: Failed to login E2E admin with OTP after 5 attempts."
  echo "  Response: $LOGIN_RES"
  exit 1
fi

# Change password
CP_RES=$(curl -s -X POST "$API_URL/api/auth/change-password" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LOGIN_TOKEN" \
  -d "{\"newPassword\":\"$E2E_PASSWORD\"}")

CP_SUCCESS=$(echo "$CP_RES" | jq -r '.success // empty')
if [[ "$CP_SUCCESS" != "true" ]]; then
  echo "  ERROR: Failed to change E2E admin password."
  echo "  Response: $CP_RES"
  exit 1
fi

echo "  E2E admin onboarded successfully."
fi  # end: if [[ "$RERUN" != "true" ]]

# ── Cleanup / state management ───────────────────────────────────────────────
TEST_EXIT_CODE=0

run_cleanup() {
  # Kill Vite if still running
  if [[ -n "$VITE_PID" ]]; then
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
    VITE_PID=""
    echo "  Vite dev server stopped."
  fi

  # Remove .env.local if we created it
  rm -f "$REPO_ROOT/frontend/.env.local"

  # Clean up E2E admin user
  ENVIRONMENT="$ENV" \
  SIT_ADMIN_EMAIL="$E2E_EMAIL" \
  SIT_ADMIN_USER_ID="$E2E_USER_ID" \
  DYNAMODB_TABLE="$TABLE" \
  VAULTS_TABLE_NAME="passvault-vaults-${ENV}" \
  LOGIN_EVENTS_TABLE_NAME="passvault-login-events-${ENV}" \
  FILES_BUCKET="$FILES_BUCKET" \
  CLEANUP_LABEL="E2E" \
    npx tsx "$REPO_ROOT/scripts/sit-cleanup.ts" || echo "  Warning: user cleanup failed."
}

write_state_file() {
  STATE_FILE="$REPO_ROOT/.e2e-state-${ENV}-${E2E_NAME}.json"
  # NOTE: this file contains the throwaway admin's password so --rerun can
  # reuse the same user without recreating it. The file is .gitignored and
  # the admin is a short-lived test account; delete via --cleanup when done.
  cat > "$STATE_FILE" <<EOJSON
{
  "env": "$ENV",
  "region": "$REGION",
  "stack": "$STACK",
  "apiUrl": "$API_URL",
  "usersTable": "$TABLE",
  "vaultsTable": "passvault-vaults-${ENV}",
  "loginEventsTable": "passvault-login-events-${ENV}",
  "filesBucket": "${FILES_BUCKET}",
  "adminEmail": "$E2E_EMAIL",
  "adminUserId": "$E2E_USER_ID",
  "adminPassword": "$E2E_PASSWORD"
}
EOJSON
  chmod 600 "$STATE_FILE"
}

on_exit() {
  # Always stop the preview server
  if [[ -n "$VITE_PID" ]]; then
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
    VITE_PID=""
  fi
  rm -f "$REPO_ROOT/frontend/.env.local"

  if [[ "$KEEP" == "true" ]]; then
    write_state_file
    local rel_state="${STATE_FILE#"$REPO_ROOT"/}"
    echo ""
    if [[ "$RERUN" == "true" ]]; then
      echo "  --rerun complete: E2E admin user and state file preserved."
      echo "  State file  : $rel_state"
      echo "  To re-run failures again, run:"
      echo ""
      echo "    ./scripts/e2etest.sh --rerun --env $ENV"
      [[ -n "$PROFILE" ]] && echo "      (add --profile $PROFILE if needed)"
      echo ""
      echo "  When done, clean up with:"
      echo ""
      echo "    ./scripts/e2etest.sh --cleanup --env $ENV"
      echo ""
    else
      echo "  --keep specified: E2E admin user left in place."
      echo "  State file  : $rel_state"
      echo "  Admin email : $E2E_EMAIL"
      echo "  Admin pass  : $E2E_PASSWORD"
      echo "  To re-run only failing tests, run:"
      echo ""
      echo "    ./scripts/e2etest.sh --rerun --env $ENV"
      [[ -n "$PROFILE" ]] && echo "      (add --profile $PROFILE if needed)"
      echo ""
      echo "  To clean up, run:"
      echo ""
      echo "    ./scripts/e2etest.sh --cleanup --env $ENV"
      echo ""
    fi
  else
    echo ""
    echo "── Cleanup "
    run_cleanup
  fi
}

trap on_exit EXIT

# ── Build and serve frontend ─────────────────────────────────────────────────
section "Frontend build"

cat > "$REPO_ROOT/frontend/.env.local" <<ENVEOF
# Auto-generated by scripts/e2etest.sh — safe to delete
VITE_ENVIRONMENT=$ENV
VITE_API_BASE_URL=$API_URL
ENVEOF
echo "  Wrote frontend/.env.local"

echo "  Building frontend for E2E..."
(cd "$REPO_ROOT/frontend" && npx vite build) || {
  echo "Error: Frontend build failed." >&2
  exit 1
}
echo "  Build complete."

section "Static server"
echo "  Starting preview server on port $VITE_PORT..."
(cd "$REPO_ROOT/frontend" && npx vite preview --port "$VITE_PORT" &>/dev/null) &
VITE_PID=$!

for i in $(seq 1 30); do
  if curl -s "http://localhost:${VITE_PORT}" &>/dev/null; then
    echo "  Server ready at http://localhost:${VITE_PORT}"
    break
  fi
  sleep 1
done

if ! curl -s "http://localhost:${VITE_PORT}" &>/dev/null; then
  echo "Error: Preview server failed to start within 30 seconds." >&2
  exit 1
fi

# ── Run Playwright ───────────────────────────────────────────────────────────
section "Running E2E tests"

PLAYWRIGHT_ARGS=""
if [[ "$HEADED" == "true" ]]; then
  PLAYWRIGHT_ARGS="$PLAYWRIGHT_ARGS --headed"
fi
if [[ "$UI_MODE" == "true" ]]; then
  PLAYWRIGHT_ARGS="--ui"
fi
if [[ "$RERUN" == "true" ]]; then
  PLAYWRIGHT_ARGS="$PLAYWRIGHT_ARGS --last-failed"
fi

E2E_BASE_URL="http://localhost:${VITE_PORT}" \
E2E_API_BASE_URL="$API_URL" \
E2E_ADMIN_EMAIL="$E2E_EMAIL" \
E2E_ADMIN_PASSWORD="$E2E_PASSWORD" \
  npx playwright test $PLAYWRIGHT_ARGS \
    --config "$REPO_ROOT/frontend/playwright.config.ts" || TEST_EXIT_CODE=$?

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "── Summary "
if [[ "$TEST_EXIT_CODE" -eq 0 ]]; then
  echo "  All E2E tests passed."
else
  echo "  E2E tests failed with exit code $TEST_EXIT_CODE."
  echo "  Review the failure details above."
  echo ""
  echo "  HTML report:  frontend/e2e-report/index.html"
  echo "  Screenshots:  frontend/e2e-results/"
  echo "  View traces:  cd frontend && npx playwright show-trace e2e-results/<test>/trace.zip"
fi
echo ""

exit "$TEST_EXIT_CODE"
