#!/usr/bin/env bash
# sitest.sh — Run PassVault system integration tests against a deployed stack.
#
# Usage:
#   ./scripts/sitest.sh --env <dev|beta> [options]
#   ./scripts/sitest.sh --rerun [state-file] --env <dev|beta> [--profile <name>]
#   ./scripts/sitest.sh --cleanup [state-file] --env <dev|beta> [--profile <name>]
#
# Options:
#   --env <env>            Environment (required; dev or beta ONLY)
#   --profile <name>       AWS named profile
#   --region <region>      AWS region (default: eu-central-1)
#   --stack <name>         CloudFormation stack name override
#   --base-url <url>       API base URL override (skips CloudFormation lookup)
#   --keep                 Keep SIT data after tests (default: cleanup)
#   --rerun [state-file]   Re-run tests reusing admin from a previous --keep run.
#                          State is preserved afterward (implies --keep).
#   --cleanup [state-file] Skip tests; only clean up data from a previous --keep run.
#                          If no file given, auto-discovers by --env.
#   -- <vitest-args>       Extra args forwarded to vitest (e.g. -- -t "Avatar")
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
RERUN_FILE=""
VITEST_EXTRA_ARGS=""
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

USAGE="Usage: $0 --env <dev|beta> [--profile <name>] [--region <region>] [--stack <name>] [--base-url <url>] [--keep]
       $0 --rerun [state-file] --env <dev|beta> [--profile <name>] [-- <vitest-args>]
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
    --rerun)
      RERUN=true
      KEEP=true  # rerun always preserves state
      if [[ $# -ge 2 && "$2" != --* ]]; then
        RERUN_FILE="$2"
        shift 2
      else
        shift
      fi
      ;;
    --cleanup)
      CLEANUP=true
      if [[ $# -ge 2 && "$2" != --* ]]; then
        CLEANUP_FILE="$2"
        shift 2
      else
        shift
      fi
      ;;
    --)
      shift
      VITEST_EXTRA_ARGS="$*"
      break
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

if [[ "$CLEANUP" == "true" && "$RERUN" == "true" ]]; then
  echo "Error: --cleanup and --rerun are mutually exclusive." >&2
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
    MATCHES=( "$REPO_ROOT"/.sit-state-"${ENV}"-*.json )
    shopt -u nullglob

    if [[ ${#MATCHES[@]} -eq 0 ]]; then
      echo "No SIT state files found for env '$ENV'. Nothing to clean up."
      exit 0
    elif [[ ${#MATCHES[@]} -gt 1 ]]; then
      echo "Multiple SIT state files found for env '$ENV':" >&2
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
  echo "PassVault SIT Cleanup"
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
    npx tsx "$REPO_ROOT/scripts/sit-cleanup.ts"

  rm -f "$CLEANUP_FILE"
  echo "  State file removed: $(basename "$CLEANUP_FILE")"
  echo ""
  exit 0
fi

# ── Rerun mode ───────────────────────────────────────────────────────────────
if [[ "$RERUN" == "true" ]]; then
  # Auto-discover state file if not given explicitly
  if [[ -z "$RERUN_FILE" ]]; then
    if [[ -z "$ENV" ]]; then
      echo "Error: --rerun without a state file requires --env." >&2
      exit 1
    fi
    shopt -s nullglob
    MATCHES=( "$REPO_ROOT"/.sit-state-"${ENV}"-*.json )
    shopt -u nullglob
    if [[ ${#MATCHES[@]} -eq 0 ]]; then
      echo "Error: no SIT state file found for env '$ENV'. Run without --rerun first." >&2
      exit 1
    elif [[ ${#MATCHES[@]} -gt 1 ]]; then
      echo "Multiple SIT state files found for env '$ENV':" >&2
      for f in "${MATCHES[@]}"; do echo "  $(basename "$f")" >&2; done
      echo "Specify which one: $0 --rerun <state-file> --env $ENV" >&2
      exit 1
    fi
    RERUN_FILE="${MATCHES[0]}"
  fi

  if [[ ! -f "$RERUN_FILE" ]]; then
    echo "Error: state file not found: $RERUN_FILE" >&2
    exit 1
  fi

  # Read state
  ENV=$(jq -r '.env' "$RERUN_FILE")
  REGION=$(jq -r '.region // "eu-central-1"' "$RERUN_FILE")
  TABLE=$(jq -r '.usersTable' "$RERUN_FILE")
  FILES_BUCKET=$(jq -r '.filesBucket // empty' "$RERUN_FILE")
  SIT_EMAIL=$(jq -r '.adminEmail' "$RERUN_FILE")
  SIT_USER_ID=$(jq -r '.adminUserId' "$RERUN_FILE")
  SIT_NAME=$(basename "$RERUN_FILE" .json | sed "s|^\.sit-state-${ENV}-||")
  STACK_ENV="$(echo "$ENV" | tr '[:lower:]' '[:upper:]' | cut -c1)$(echo "$ENV" | cut -c2-)"
  [[ -z "$STACK" ]] && STACK="PassVault-${STACK_ENV}"

  if [[ -n "$PROFILE" ]]; then
    export AWS_PROFILE="$PROFILE"
  fi

  _cfn_output() {
    aws cloudformation describe-stacks \
      --stack-name "$STACK" \
      --region "$REGION" \
      --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
      --output text
  }

  API_URL=$(_cfn_output ApiUrl 2>/dev/null || echo "")
  [[ "$API_URL" == "None" ]] && API_URL=""
  API_URL="${API_URL%/}"

  if [[ -z "$API_URL" ]]; then
    echo "Error: could not read ApiUrl from stack $STACK." >&2
    exit 1
  fi

  # Discover plus-address
  if [[ -z "${PASSVAULT_PLUS_ADDRESS:-}" ]]; then
    DISCOVERED_PLUS=$(_cfn_output PlusAddress 2>/dev/null || echo "")
    [[ "$DISCOVERED_PLUS" == "None" ]] && DISCOVERED_PLUS=""
    [[ -n "$DISCOVERED_PLUS" ]] && export PASSVAULT_PLUS_ADDRESS="$DISCOVERED_PLUS"
  fi

  # Onboard the admin — get a fresh OTP by logging in
  echo ""
  echo "PassVault SIT Re-run"
  echo "  Environment : $ENV"
  echo "  Stack       : $STACK"
  echo "  Admin       : $SIT_EMAIL"
  echo "  API URL     : $API_URL"
  [[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
  [[ -n "$VITEST_EXTRA_ARGS" ]] && echo "  Extra args  : $VITEST_EXTRA_ARGS"
  echo ""

  STATE_FILE="$RERUN_FILE"

  # Need a fresh SIT_OTP — read it from the admin's DynamoDB record
  SIT_OTP=$(aws dynamodb get-item \
    --table-name "$TABLE" \
    --region "$REGION" \
    --key "{\"userId\": {\"S\": \"$SIT_USER_ID\"}}" \
    --query 'Item.oneTimePassword.S' \
    --output text 2>/dev/null || echo "")
  [[ "$SIT_OTP" == "None" || -z "$SIT_OTP" ]] && SIT_OTP=""

  echo "── Running tests (rerun) "
  echo ""

  SIT_BASE_URL="$API_URL" \
  SIT_ENV="$ENV" \
  SIT_ADMIN_EMAIL="$SIT_EMAIL" \
  SIT_ADMIN_OTP="${SIT_OTP:-rerun-no-otp}" \
  SIT_TABLE="$TABLE" \
    npx vitest run --config "$REPO_ROOT/backend/sit/vitest.config.ts" $VITEST_EXTRA_ARGS || TEST_EXIT_CODE=$?

  echo ""
  echo "── Summary "
  if [[ "${TEST_EXIT_CODE:-0}" -eq 0 ]]; then
    echo "  All tests passed."
  else
    echo "  Tests failed with exit code ${TEST_EXIT_CODE:-1}."
  fi
  echo ""
  echo "  State preserved: $(basename "$RERUN_FILE")"
  echo "  Re-run again:  $0 --rerun --env $ENV"
  [[ -n "$PROFILE" ]] && echo "    (add --profile $PROFILE if needed)"
  echo "  Clean up:      $0 --cleanup --env $ENV"
  echo ""
  exit "${TEST_EXIT_CODE:-0}"
fi

# ── Normal mode: require --env ───────────────────────────────────────────────
if [[ -z "$ENV" ]]; then
  echo "Error: --env is required." >&2
  echo "$USAGE" >&2
  exit 1
fi

# ── Prod guard ────────────────────────────────────────────────────────────────
if [[ "$ENV" == "prod" ]]; then
  echo "Error: system integration tests cannot run against prod." >&2
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
echo "PassVault System Integration Tests"
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

# Discover plus-address routing from stack outputs (beta/prod).
# See e2etest.sh for why this matters (SES reputation).
if [[ -z "${PASSVAULT_PLUS_ADDRESS:-}" ]]; then
  DISCOVERED_PLUS=$(_cfn_output PlusAddress 2>/dev/null || echo "")
  [[ "$DISCOVERED_PLUS" == "None" ]] && DISCOVERED_PLUS=""
  if [[ -n "$DISCOVERED_PLUS" ]]; then
    export PASSVAULT_PLUS_ADDRESS="$DISCOVERED_PLUS"
  fi
fi

# ── Generate SIT admin name ──────────────────────────────────────────────────
section "SIT admin setup"

ADJECTIVES=("quick" "clever" "silent" "bright" "bold" "sharp" "calm" "keen")
NOUNS=("fox" "owl" "hawk" "wolf" "bear" "lynx" "crane" "pike")
SIT_NAME="${ADJECTIVES[$((RANDOM % 8))]}-${NOUNS[$((RANDOM % 8))]}"
source "$REPO_ROOT/scripts/lib/test-emails.sh"
SIT_EMAIL=$(make_test_email "sit-${SIT_NAME}")
if [[ -n "${PASSVAULT_PLUS_ADDRESS:-}" ]]; then
  echo "  Email routing: on → $SIT_EMAIL"
fi

echo "  SIT admin   : $SIT_EMAIL"

# ── Create SIT admin ──────────────────────────────────────────────────────────
SIT_JSON=$(ENVIRONMENT="$ENV" ADMIN_EMAIL="$SIT_EMAIL" DYNAMODB_TABLE="$TABLE" \
  npx tsx "$REPO_ROOT/scripts/sit-create-admin.ts" 2>/dev/null)

if [[ -z "$SIT_JSON" ]]; then
  echo "  ERROR: Failed to create SIT admin."
  exit 1
fi

SIT_OTP=$(echo "$SIT_JSON" | jq -r '.otp')
SIT_USER_ID=$(echo "$SIT_JSON" | jq -r '.userId')

if [[ -z "$SIT_OTP" || "$SIT_OTP" == "null" ]]; then
  echo "  ERROR: Failed to capture OTP from sit-create-admin.ts"
  exit 1
fi

echo "  SIT admin created (OTP: ${#SIT_OTP} chars, userId: ${SIT_USER_ID:0:8}...)."

# ── Cleanup state ─────────────────────────────────────────────────────────────
TEST_EXIT_CODE=0

run_cleanup() {
  ENVIRONMENT="$ENV" \
  SIT_ADMIN_EMAIL="$SIT_EMAIL" \
  SIT_ADMIN_USER_ID="$SIT_USER_ID" \
  DYNAMODB_TABLE="$TABLE" \
  VAULTS_TABLE_NAME="passvault-vaults-${ENV}" \
  LOGIN_EVENTS_TABLE_NAME="passvault-login-events-${ENV}" \
  FILES_BUCKET="$FILES_BUCKET" \
    npx tsx "$REPO_ROOT/scripts/sit-cleanup.ts" || echo "  Warning: cleanup failed."
}

write_state_file() {
  STATE_FILE="$REPO_ROOT/.sit-state-${ENV}-${SIT_NAME}.json"
  cat > "$STATE_FILE" <<EOJSON
{
  "env": "$ENV",
  "region": "$REGION",
  "usersTable": "$TABLE",
  "vaultsTable": "passvault-vaults-${ENV}",
  "loginEventsTable": "passvault-login-events-${ENV}",
  "filesBucket": "${FILES_BUCKET}",
  "adminEmail": "$SIT_EMAIL",
  "adminUserId": "$SIT_USER_ID"
}
EOJSON
}

on_exit() {
  if [[ "$KEEP" == "true" ]]; then
    write_state_file
    local rel_state="${STATE_FILE#"$REPO_ROOT"/}"
    echo ""
    echo "  --keep specified: SIT users, vaults, and audit events left in place."
    echo "  State file  : $rel_state"
    echo "  To clean up later, run:"
    echo ""
    echo "    ./scripts/sitest.sh --cleanup --env $ENV"
    [[ -n "$PROFILE" ]] && echo "      (add --profile $PROFILE if needed)"
    echo ""
  else
    echo ""
    echo "── Cleanup "
    run_cleanup
  fi
}

trap on_exit EXIT

# ── Run tests ─────────────────────────────────────────────────────────────────
section "Running tests"

SIT_BASE_URL="$API_URL" \
SIT_ENV="$ENV" \
SIT_ADMIN_EMAIL="$SIT_EMAIL" \
SIT_ADMIN_OTP="$SIT_OTP" \
SIT_TABLE="$TABLE" \
  npx vitest run --config "$REPO_ROOT/backend/sit/vitest.config.ts" $VITEST_EXTRA_ARGS || TEST_EXIT_CODE=$?

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "── Summary "
if [[ "$TEST_EXIT_CODE" -eq 0 ]]; then
  echo "  All tests passed."
else
  echo "  Tests failed with exit code $TEST_EXIT_CODE."
  echo "  Review the failure details above."
fi
echo ""

exit "$TEST_EXIT_CODE"
