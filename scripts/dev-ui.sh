#!/usr/bin/env bash
# dev-ui.sh — Start the frontend Vite dev server against a deployed PassVault stack.
#
# Usage:
#   ./scripts/dev-ui.sh [--profile <aws-profile>] [--region <region>] [--stack <stack-name>]
#
# Options:
#   --profile   AWS named profile (sets AWS_PROFILE; picked up by both the
#               AWS CLI and the AWS SDK used by init-admin.ts).
#               Omit to use the default credential chain.
#   --region    AWS region the stack is deployed in (default: eu-central-1)
#   --stack     CloudFormation stack name (default: PassVault-Dev)
#
# What it does:
#   1. Reads ApiUrl and UsersTableName from the deployed CloudFormation stack
#   2. Checks DynamoDB for the admin user; if absent, runs init-admin.ts and
#      prints the one-time password
#   3. Writes frontend/.env.local with VITE_* variables
#   4. Starts `npm run dev` in the frontend/ directory
#   5. On exit (Ctrl-C or normal termination): kills the dev server and
#      deletes frontend/.env.local

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
PROFILE=""
REGION="eu-central-1"
STACK="PassVault-Dev"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/frontend/.env.local"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)  PROFILE="$2";  shift 2 ;;
    --region)   REGION="$2";   shift 2 ;;
    --stack)    STACK="$2";    shift 2 ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--profile <name>] [--region <region>] [--stack <name>]" >&2
      exit 1
      ;;
  esac
done

# ── Export AWS_PROFILE ────────────────────────────────────────────────────────
# Exporting AWS_PROFILE is picked up automatically by both the AWS CLI and the
# AWS SDK (used by init-admin.ts via npx tsx).  All subsequent aws commands and
# the npx tsx invocation inherit it without any extra flags.
if [[ -n "$PROFILE" ]]; then
  export AWS_PROFILE="$PROFILE"
  echo "→ Using AWS profile: $PROFILE"
fi

# ── Derive ENVIRONMENT from stack name ────────────────────────────────────────
# PassVault-Dev → dev, PassVault-Beta → beta, PassVault-Prod → prod
CDK_ENV=$(echo "$STACK" | awk -F'-' '{print tolower($NF)}')

# ── Cleanup on exit ───────────────────────────────────────────────────────────
VITE_PID=""

cleanup() {
  echo ""
  echo "→ Stopping dev server..."
  if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
  fi
  if [[ -f "$ENV_FILE" ]]; then
    rm -f "$ENV_FILE"
    echo "→ Deleted $ENV_FILE"
  fi
  echo "→ Done."
}

trap cleanup EXIT INT TERM

# ── Fetch stack outputs ───────────────────────────────────────────────────────
echo "→ Fetching stack outputs from $STACK ($REGION)..."

_cfn_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
    --output text
}

API_URL=$(_cfn_output ApiUrl) || {
  echo "" >&2
  echo "Error: could not read stack outputs." >&2
  echo "  Stack:  $STACK" >&2
  echo "  Region: $REGION" >&2
  [[ -n "$PROFILE" ]] && echo "  Profile: $PROFILE" >&2
  echo "" >&2
  echo "Make sure the stack is deployed and your credentials are valid:" >&2
  echo "  cd cdk && cdk deploy --context env=$CDK_ENV" >&2
  exit 1
}

TABLE_NAME=$(_cfn_output UsersTableName)

if [[ -z "$API_URL" || "$API_URL" == "None" ]]; then
  echo "Error: ApiUrl output not found in stack $STACK." >&2
  exit 1
fi
if [[ -z "$TABLE_NAME" || "$TABLE_NAME" == "None" ]]; then
  echo "Error: UsersTableName output not found in stack $STACK." >&2
  exit 1
fi

# Strip trailing slash — ApiClient prepends paths with /
API_URL="${API_URL%/}"

echo "→ API URL:    $API_URL"
echo "→ DynamoDB table: $TABLE_NAME"

# ── Check if admin is already initialised ─────────────────────────────────────
echo "→ Checking admin account..."

ADMIN_COUNT=$(aws dynamodb query \
  --table-name "$TABLE_NAME" \
  --index-name "username-index" \
  --key-condition-expression "username = :u" \
  --expression-attribute-values '{":u":{"S":"admin"}}' \
  --region "$REGION" \
  --query "Count" \
  --output text)

if [[ "$ADMIN_COUNT" -eq 0 ]]; then
  echo ""
  echo "┌─────────────────────────────────────────────────────┐"
  echo "│  Admin account not found — initialising now...      │"
  echo "└─────────────────────────────────────────────────────┘"
  echo ""
  # Pass the table name explicitly so init-admin.ts doesn't have to reconstruct it.
  # ENVIRONMENT selects the shared config (admin username, region, etc.).
  # AWS_PROFILE is already exported above if --profile was supplied.
  ENVIRONMENT="$CDK_ENV" \
  DYNAMODB_TABLE="$TABLE_NAME" \
    npx tsx "$REPO_ROOT/scripts/init-admin.ts"
  echo ""
  echo "⚠  Save the one-time password above before continuing."
  echo "   Press Enter to start the dev server..."
  read -r
else
  echo "→ Admin account already exists — skipping initialisation."
fi

# ── Write frontend/.env.local ─────────────────────────────────────────────────
# Timeout values match devConfig in shared/src/config/environments.ts.
# .env.local is covered by .gitignore and is deleted on exit.
cat > "$ENV_FILE" << EOF
# Auto-generated by scripts/dev-ui.sh — DO NOT COMMIT (covered by .gitignore)
VITE_ENVIRONMENT=$CDK_ENV
VITE_API_BASE_URL=$API_URL
VITE_VIEW_TIMEOUT_SECONDS=300
VITE_EDIT_TIMEOUT_SECONDS=600
VITE_ADMIN_TIMEOUT_SECONDS=86400
EOF

echo "→ Wrote $ENV_FILE"

# ── Start Vite dev server ─────────────────────────────────────────────────────
echo "→ Starting Vite dev server at http://localhost:5173"
echo "   Press Ctrl-C to stop and clean up."
echo ""

cd "$REPO_ROOT/frontend"
npm run dev &
VITE_PID=$!

# Block until the dev server exits — the trap handles cleanup either way.
wait "$VITE_PID"
