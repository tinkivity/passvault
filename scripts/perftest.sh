#!/usr/bin/env bash
# perftest.sh — Run PassVault performance tests against a deployed stack.
#
# Creates a temporary admin user, onboards it (OTP login + password change),
# runs vitest perf scenarios, and cleans up on exit.
#
# Usage:
#   ./scripts/perftest.sh --env <dev|beta> [options]
#   ./scripts/perftest.sh --cleanup [state-file] --env <dev|beta> [--profile <name>]
#
# Options:
#   --env <env>            Environment (required; dev or beta ONLY)
#   --profile <name>       AWS named profile
#   --region <region>      AWS region (default: eu-central-1)
#   --stack <name>         CloudFormation stack name override
#   --base-url <url>       API base URL override (skips CloudFormation lookup)
#   --keep                 Keep test data after run (default: cleanup)
#   --cleanup [state-file] Skip tests; only clean up data from a previous --keep run.
#                          If no file given, auto-discovers by --env.
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
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

USAGE="Usage: $0 --env <dev|beta> [--profile <name>] [--region <region>] [--stack <name>] [--base-url <url>] [--keep]
       $0 --cleanup [state-file] --env <dev|beta> [--profile <name>] [--region <region>]"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)      ENV="$2";          shift 2 ;;
    --profile)  PROFILE="$2";      shift 2 ;;
    --region)   REGION="$2";       shift 2 ;;
    --stack)    STACK="$2";        shift 2 ;;
    --base-url) BASE_URL="$2";     shift 2 ;;
    --keep)     KEEP=true;         shift   ;;
    --cleanup)
      CLEANUP=true
      if [[ $# -ge 2 && "$2" != --* ]]; then
        CLEANUP_FILE="$2"
        shift 2
      else
        shift
      fi
      ;;
    -h|--help)
      echo "$USAGE"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "$USAGE" >&2
      exit 1
      ;;
  esac
done

if [[ "$KEEP" == "true" && "$CLEANUP" == "true" ]]; then
  echo "Error: --keep and --cleanup are mutually exclusive." >&2
  echo "$USAGE" >&2
  exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
section() {
  echo ""
  echo "── $1 "
}

# ── Export AWS_PROFILE ────────────────────────────────────────────────────────
if [[ -n "$PROFILE" ]]; then
  export AWS_PROFILE="$PROFILE"
fi

# ── Cleanup-only mode ────────────────────────────────────────────────────────
if [[ "$CLEANUP" == "true" ]]; then

  # If no explicit file given, auto-discover by env
  if [[ -z "$CLEANUP_FILE" ]]; then
    if [[ -z "$ENV" ]]; then
      echo "Error: --cleanup without a state file requires --env." >&2
      echo "$USAGE" >&2
      exit 1
    fi

    shopt -s nullglob
    MATCHES=( "$REPO_ROOT"/.perf-state-"${ENV}"-*.json )
    shopt -u nullglob

    if [[ ${#MATCHES[@]} -eq 0 ]]; then
      echo "No perf state files found for env '$ENV'. Nothing to clean up."
      exit 0
    elif [[ ${#MATCHES[@]} -gt 1 ]]; then
      echo "Multiple perf state files found for env '$ENV':" >&2
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

  # Read state file
  STATE_ENV=$(jq -r '.env' "$CLEANUP_FILE")
  STATE_REGION=$(jq -r '.region // empty' "$CLEANUP_FILE")
  [[ -n "$STATE_REGION" ]] && REGION="$STATE_REGION"

  echo ""
  echo "PassVault Perf Cleanup"
  echo "  State file  : $(basename "$CLEANUP_FILE")"
  echo "  Environment : $STATE_ENV"
  echo "  Region      : $REGION"
  [[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
  echo ""

  # Verify AWS access
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
  FILES_BUCKET=$(jq -r '.filesBucket' "$CLEANUP_FILE") \
  CLEANUP_LABEL="Perf" \
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

# ── Prod guard ────────────────────────────────────────────────────────────────
if [[ "$ENV" == "prod" ]]; then
  echo "Error: performance tests cannot run against prod." >&2
  exit 1
fi

case "$ENV" in
  dev|beta) ;;
  *)
    echo "Error: unknown environment '$ENV'. Valid values: dev, beta." >&2
    exit 1
    ;;
esac

# ── Per-environment defaults ──────────────────────────────────────────────────
STACK_ENV="$(echo "$ENV" | tr '[:lower:]' '[:upper:]' | cut -c1)$(echo "$ENV" | cut -c2-)"
[[ -z "$STACK" ]] && STACK="PassVault-${STACK_ENV}"

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "PassVault Performance Tests"
echo "  Environment : $ENV"
echo "  Stack       : $STACK"
echo "  Region      : $REGION"
[[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
[[ -n "$BASE_URL" ]] && echo "  Base URL    : $BASE_URL (override)"
echo "  Keep data   : $KEEP"
echo ""

# ── AWS access check ─────────────────────────────────────────────────────────
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

# ── Fetch CloudFormation outputs ──────────────────────────────────────────────
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
if [[ "$FILES_BUCKET" == "None" ]]; then
  FILES_BUCKET=""
fi

if [[ -z "$BASE_URL" ]]; then
  API_URL=$(_cfn_output ApiUrl) || {
    echo "Error: could not read ApiUrl from stack $STACK." >&2
    exit 1
  }
  if [[ -z "$API_URL" || "$API_URL" == "None" ]]; then
    echo "Error: ApiUrl output not found in stack $STACK." >&2
    exit 1
  fi
  # Strip trailing slash
  API_URL="${API_URL%/}"
else
  API_URL="${BASE_URL%/}"
fi

echo "  API URL     : $API_URL"
echo "  Users table : $TABLE"
[[ -n "$FILES_BUCKET" ]] && echo "  Files bucket: $FILES_BUCKET"

# ── Generate perf admin name ─────────────────────────────────────────────────
section "Perf admin setup"

ADJECTIVES=("rapid" "steady" "fluid" "dense" "sonic" "polar" "ember" "azure")
NOUNS=("tiger" "eagle" "shark" "bison" "cobra" "falcon" "orca" "mantis")
PERF_NAME="${ADJECTIVES[$((RANDOM % 8))]}-${NOUNS[$((RANDOM % 8))]}"
PERF_EMAIL="perf-${PERF_NAME}@passvault-test.local"

echo "  Perf admin  : $PERF_EMAIL"

# ── Create perf admin ────────────────────────────────────────────────────────
PERF_JSON=$(ENVIRONMENT="$ENV" ADMIN_EMAIL="$PERF_EMAIL" DYNAMODB_TABLE="$TABLE" \
  npx tsx "$REPO_ROOT/scripts/sit-create-admin.ts" 2>/dev/null)

if [[ -z "$PERF_JSON" ]]; then
  echo "  ERROR: Failed to create perf admin."
  exit 1
fi

PERF_OTP=$(echo "$PERF_JSON" | jq -r '.otp')
PERF_USER_ID=$(echo "$PERF_JSON" | jq -r '.userId')

if [[ -z "$PERF_OTP" || "$PERF_OTP" == "null" ]]; then
  echo "  ERROR: Failed to capture OTP from sit-create-admin.ts"
  exit 1
fi

echo "  Perf admin created (OTP: ${#PERF_OTP} chars, userId: ${PERF_USER_ID:0:8}...)."

# ── Onboard perf admin (login with OTP + change password) ────────────────────
PERF_PASSWORD="Perf$(openssl rand -hex 12)!Pw"

echo "  Onboarding perf admin (login + password change)..."

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
    -d "{\"username\":\"$PERF_EMAIL\",\"password\":\"$PERF_OTP\"}")
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
  echo "  ERROR: Failed to login perf admin with OTP after 5 attempts."
  echo "  Response: $LOGIN_RES"
  exit 1
fi

# Change password
CP_RES=$(curl -s -X POST "$API_URL/api/auth/change-password" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LOGIN_TOKEN" \
  -d "{\"newPassword\":\"$PERF_PASSWORD\"}")

CP_SUCCESS=$(echo "$CP_RES" | jq -r '.success // empty')
if [[ "$CP_SUCCESS" != "true" ]]; then
  echo "  ERROR: Failed to change perf admin password."
  echo "  Response: $CP_RES"
  exit 1
fi

echo "  Perf admin onboarded successfully."

# ── Cleanup state ─────────────────────────────────────────────────────────────
TEST_EXIT_CODE=0

run_cleanup() {
  ENVIRONMENT="$ENV" \
  SIT_ADMIN_EMAIL="$PERF_EMAIL" \
  SIT_ADMIN_USER_ID="$PERF_USER_ID" \
  DYNAMODB_TABLE="$TABLE" \
  VAULTS_TABLE_NAME="passvault-vaults-${ENV}" \
  LOGIN_EVENTS_TABLE_NAME="passvault-login-events-${ENV}" \
  FILES_BUCKET="$FILES_BUCKET" \
  CLEANUP_LABEL="Perf" \
    npx tsx "$REPO_ROOT/scripts/sit-cleanup.ts" || echo "  Warning: cleanup failed."
}

write_state_file() {
  STATE_FILE="$REPO_ROOT/.perf-state-${ENV}-${PERF_NAME}.json"
  cat > "$STATE_FILE" <<EOJSON
{
  "env": "$ENV",
  "region": "$REGION",
  "usersTable": "$TABLE",
  "vaultsTable": "passvault-vaults-${ENV}",
  "loginEventsTable": "passvault-login-events-${ENV}",
  "filesBucket": "${FILES_BUCKET}",
  "adminEmail": "$PERF_EMAIL",
  "adminUserId": "$PERF_USER_ID"
}
EOJSON
}

on_exit() {
  if [[ "$KEEP" == "true" ]]; then
    write_state_file
    local rel_state="${STATE_FILE#"$REPO_ROOT"/}"
    echo ""
    echo "  --keep specified: perf admin user left in place."
    echo "  State file  : $rel_state"
    echo "  Admin email : $PERF_EMAIL"
    echo "  Admin pass  : $PERF_PASSWORD"
    echo "  To clean up later, run:"
    echo ""
    echo "    ./scripts/perftest.sh --cleanup --env $ENV"
    [[ -n "$PROFILE" ]] && echo "      (add --profile $PROFILE if needed)"
    echo ""
  else
    echo ""
    echo "── Cleanup "
    run_cleanup
  fi
}

trap on_exit EXIT

# ── Run performance tests ────────────────────────────────────────────────────
section "Running performance tests"

SIT_BASE_URL="$API_URL" \
SIT_ENV="$ENV" \
SIT_ADMIN_EMAIL="$PERF_EMAIL" \
SIT_ADMIN_OTP="$PERF_OTP" \
SIT_ADMIN_PASSWORD="$PERF_PASSWORD" \
  npx vitest run --config "$REPO_ROOT/backend/perf/vitest.config.ts" || TEST_EXIT_CODE=$?

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "── Summary "
if [[ "$TEST_EXIT_CODE" -eq 0 ]]; then
  echo "  All performance tests passed."
else
  echo "  Performance tests failed with exit code $TEST_EXIT_CODE."
  echo "  Review the failure details above."
fi
echo ""

exit "$TEST_EXIT_CODE"
