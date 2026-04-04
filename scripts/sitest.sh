#!/usr/bin/env bash
# sitest.sh — Run PassVault system integration tests against a deployed stack.
#
# Usage:
#   ./scripts/sitest.sh --env <dev|beta> [options]
#
# Options:
#   --env <env>       Environment (required; dev or beta ONLY)
#   --profile <name>  AWS named profile
#   --region <region> AWS region (default: eu-central-1)
#   --stack <name>    CloudFormation stack name override
#   --base-url <url>  API base URL override (skips CloudFormation lookup)
#   --keep            Keep SIT admin after tests (default: cleanup)
#   -h, --help        Show usage

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV=""
PROFILE=""
REGION="eu-central-1"
STACK=""
BASE_URL=""
KEEP=false
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)      ENV="$2";      shift 2 ;;
    --profile)  PROFILE="$2";  shift 2 ;;
    --region)   REGION="$2";   shift 2 ;;
    --stack)    STACK="$2";    shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --keep)     KEEP=true;     shift   ;;
    -h|--help)
      echo "Usage: $0 --env <dev|beta> [--profile <name>] [--region <region>] [--stack <name>] [--base-url <url>] [--keep]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 --env <dev|beta> [--profile <name>] [--region <region>] [--stack <name>] [--base-url <url>] [--keep]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ENV" ]]; then
  echo "Error: --env is required." >&2
  echo "Usage: $0 --env <dev|beta> [--profile <name>] [--region <region>] [--stack <name>] [--base-url <url>] [--keep]" >&2
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

# ── Export AWS_PROFILE ────────────────────────────────────────────────────────
if [[ -n "$PROFILE" ]]; then
  export AWS_PROFILE="$PROFILE"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
section() {
  echo ""
  echo "── $1 "
}

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "PassVault System Integration Tests"
echo "  Environment : $ENV"
echo "  Stack       : $STACK"
echo "  Region      : $REGION"
[[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
[[ -n "$BASE_URL" ]] && echo "  Base URL    : $BASE_URL (override)"
echo "  Keep admin  : $KEEP"
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

# ── Generate SIT admin name ──────────────────────────────────────────────────
section "SIT admin setup"

ADJECTIVES=("quick" "clever" "silent" "bright" "bold" "sharp" "calm" "keen")
NOUNS=("fox" "owl" "hawk" "wolf" "bear" "lynx" "crane" "pike")
SIT_NAME="${ADJECTIVES[$((RANDOM % 8))]}-${NOUNS[$((RANDOM % 8))]}"
SIT_EMAIL="sit-${SIT_NAME}@passvault-test.local"

echo "  SIT admin   : $SIT_EMAIL"

# ── Create SIT admin ──────────────────────────────────────────────────────────
SIT_OTP=$(ENVIRONMENT="$ENV" ADMIN_EMAIL="$SIT_EMAIL" DYNAMODB_TABLE="$TABLE" \
  npx tsx "$REPO_ROOT/scripts/sit-create-admin.ts")

echo "  SIT admin created (OTP captured)."

# ── Cleanup state ─────────────────────────────────────────────────────────────
TEST_EXIT_CODE=0

cleanup() {
  if [[ "$KEEP" == "true" ]]; then
    echo ""
    echo "  --keep specified: SIT admin $SIT_EMAIL left in place."
    echo ""
  else
    echo ""
    echo "── Cleanup "
    ENVIRONMENT="$ENV" \
    SIT_ADMIN_EMAIL="$SIT_EMAIL" \
    DYNAMODB_TABLE="$TABLE" \
    VAULTS_TABLE_NAME="passvault-vaults-${ENV}" \
    LOGIN_EVENTS_TABLE_NAME="passvault-login-events-${ENV}" \
      npx tsx "$REPO_ROOT/scripts/sit-cleanup.ts" || echo "  Warning: cleanup failed."
  fi
}

trap cleanup EXIT

# ── Run tests ─────────────────────────────────────────────────────────────────
section "Running tests"

SIT_BASE_URL="$API_URL" \
SIT_ENV="$ENV" \
SIT_ADMIN_EMAIL="$SIT_EMAIL" \
SIT_ADMIN_OTP="$SIT_OTP" \
SIT_TABLE="$TABLE" \
  npx vitest run --config "$REPO_ROOT/backend/sit/vitest.config.ts" || TEST_EXIT_CODE=$?

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
