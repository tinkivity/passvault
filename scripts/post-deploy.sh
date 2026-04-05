#!/usr/bin/env bash
# post-deploy.sh — Build and deploy the PassVault frontend (or start a local dev server).
#
# Usage:
#   ./scripts/post-deploy.sh --env <dev|beta|prod> [--profile <aws-profile>] [--region <region>] [--stack <stack-name>]
#
# Environments:
#   dev   Start a local Vite dev server pointed at a deployed PassVault-Dev stack.
#         Writes frontend/.env.local; deletes it and kills the server on exit.
#   beta  Build and deploy to PassVault-Beta (S3 + CloudFront invalidation).
#   prod  Build and deploy to PassVault-Prod (S3 + CloudFront invalidation).
#         Requires explicit confirmation before the build starts.
#
# Options:
#   --env       Target environment: dev | beta | prod  (required)
#   --profile   AWS named profile (sets AWS_PROFILE). Omit to use the default credential chain.
#   --region    AWS region the stack is deployed in (default: eu-central-1)
#   --stack     CloudFormation stack name (overrides the default derived from --env)

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV=""
PROFILE=""
REGION="eu-central-1"
STACK=""
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/frontend/.env.local"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)      ENV="$2";     shift 2 ;;
    --profile)  PROFILE="$2"; shift 2 ;;
    --region)   REGION="$2";  shift 2 ;;
    --stack)    STACK="$2";   shift 2 ;;
    -h|--help)
      echo "Usage: $0 --env <dev|beta|prod> [--profile <name>] [--region <region>] [--stack <name>]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 --env <dev|beta|prod> [--profile <name>] [--region <region>] [--stack <name>]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ENV" ]]; then
  echo "Error: --env is required." >&2
  echo "Usage: $0 --env <dev|beta|prod> [--profile <name>] [--region <region>] [--stack <name>]" >&2
  exit 1
fi

case "$ENV" in
  dev|beta|prod) ;;
  *)
    echo "Error: unknown environment '$ENV'. Valid values: dev, beta, prod." >&2
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
echo "PassVault frontend deploy"
echo "  Environment : $ENV"
echo "  Stack       : $STACK"
echo "  Region      : $REGION"
[[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
echo ""

# ── AWS access check ─────────────────────────────────────────────────────────
if ! aws sts get-caller-identity --region "$REGION" &>/dev/null; then
  echo "✗ No AWS access — cannot reach AWS STS."
  echo "  Your SSO session may have expired. Run:"
  [[ -n "$PROFILE" ]] \
    && echo "    aws sso login --profile $PROFILE" \
    || echo "    aws sso login"
  echo ""
  exit 1
fi

# ── Cleanup on exit ───────────────────────────────────────────────────────────
VITE_PID=""

cleanup() {
  echo ""
  if [[ "$ENV" == "dev" ]]; then
    echo "→ Stopping dev server..."
    if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
      kill "$VITE_PID" 2>/dev/null || true
      wait "$VITE_PID" 2>/dev/null || true
    fi
  fi
  if [[ -f "$ENV_FILE" ]]; then
    rm -f "$ENV_FILE"
    echo "→ Deleted $ENV_FILE"
  fi
  echo "→ Done."
}

trap cleanup EXIT INT TERM

# ── Fetch stack outputs ───────────────────────────────────────────────────────
section "Stack outputs ────────────────────────────────────────────────────────────"

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
  echo "  cd cdk && cdk deploy --context env=$ENV" >&2
  exit 1
}

TABLE_NAME=$(_cfn_output UsersTableName)
FILES_BUCKET_NAME=$(_cfn_output FilesBucketName)
ADMIN_EMAIL=$(_cfn_output AdminEmail)

if [[ -z "$API_URL" || "$API_URL" == "None" ]]; then
  echo "Error: ApiUrl output not found in stack $STACK." >&2; exit 1
fi
if [[ -z "$TABLE_NAME" || "$TABLE_NAME" == "None" ]]; then
  echo "Error: UsersTableName output not found in stack $STACK." >&2; exit 1
fi
if [[ -z "$ADMIN_EMAIL" || "$ADMIN_EMAIL" == "None" ]]; then
  echo "Error: AdminEmail output not found in stack $STACK." >&2; exit 1
fi
if [[ "$ENV" == "dev" && ( -z "$FILES_BUCKET_NAME" || "$FILES_BUCKET_NAME" == "None" ) ]]; then
  echo "Error: FilesBucketName output not found in stack $STACK." >&2; exit 1
fi

# Strip trailing slash — ApiClient prepends paths with /
API_URL="${API_URL%/}"

if [[ "$ENV" != "dev" ]]; then
  FRONTEND_BUCKET=$(_cfn_output FrontendBucketName)
  CLOUDFRONT_URL=$(_cfn_output CloudFrontUrl)

  if [[ -z "$FRONTEND_BUCKET" || "$FRONTEND_BUCKET" == "None" ]]; then
    echo "Error: FrontendBucketName output not found in stack $STACK." >&2; exit 1
  fi
  if [[ -z "$CLOUDFRONT_URL" || "$CLOUDFRONT_URL" == "None" ]]; then
    echo "Error: CloudFrontUrl output not found in stack $STACK." >&2
    echo "       Make sure cloudFrontEnabled=true for this environment." >&2
    exit 1
  fi

  # Extract bare domain for CloudFront distribution lookup
  CF_DOMAIN="${CLOUDFRONT_URL#https://}"
  CF_DOMAIN="${CF_DOMAIN%/}"
fi

echo "  API URL          : $API_URL"
echo "  Admin email      : $ADMIN_EMAIL"
[[ "$ENV" != "dev" ]] && echo "  Frontend bucket  : $FRONTEND_BUCKET"
[[ "$ENV" != "dev" ]] && echo "  CloudFront URL   : $CLOUDFRONT_URL"
echo "  DynamoDB table   : $TABLE_NAME"
[[ "$ENV" == "dev" ]] && echo "  Files bucket     : $FILES_BUCKET_NAME"

# ── Check/initialise admin account ───────────────────────────────────────────
section "Admin account ───────────────────────────────────────────────────────────"

ADMIN_COUNT=$(aws dynamodb query \
  --table-name "$TABLE_NAME" \
  --index-name "username-index" \
  --key-condition-expression "username = :u" \
  --expression-attribute-values "{\":u\":{\"S\":\"$ADMIN_EMAIL\"}}" \
  --region "$REGION" \
  --query "Count" \
  --output text)

if [[ "$ADMIN_COUNT" -eq 0 ]]; then
  echo ""
  echo "┌─────────────────────────────────────────────────────┐"
  echo "│  Admin account not found — initialising now...      │"
  echo "└─────────────────────────────────────────────────────┘"
  echo ""
  ENVIRONMENT="$ENV" \
  DYNAMODB_TABLE="$TABLE_NAME" \
  ADMIN_EMAIL="$ADMIN_EMAIL" \
    npx tsx "$REPO_ROOT/scripts/init-admin.ts"
  echo ""
  echo "⚠  Save the one-time password above before continuing."
  if [[ "$ENV" == "dev" ]]; then
    echo "   Press Enter to start the dev server..."
  else
    echo "   Press Enter to continue with the frontend build..."
  fi
  read -r
else
  echo "  Admin account already exists — skipping initialisation."
fi

# ── Dev: seed test users ─────────────────────────────────────────────────────
if [[ "$ENV" == "dev" ]]; then
  section "Test users ──────────────────────────────────────────────────────────────"
  ENVIRONMENT="$ENV" \
  DYNAMODB_TABLE="$TABLE_NAME" \
  VAULTS_TABLE_NAME="passvault-vaults-${ENV}" \
  FILES_BUCKET="$FILES_BUCKET_NAME" \
    npx tsx "$REPO_ROOT/scripts/seed-dev.ts" || echo "  ⚠  Seed step failed — skipping (see above)."
fi

# ── Production confirmation ───────────────────────────────────────────────────
if [[ "$ENV" == "prod" ]]; then
  echo ""
  echo "⚠  PRODUCTION — you are about to build and deploy a new frontend to"
  echo "   the live environment."
  echo ""
  read -rp "   Type 'prod' to confirm: " _prod_confirm
  if [[ "$_prod_confirm" != "prod" ]]; then
    echo "Aborted."
    exit 0
  fi
  echo ""
fi

# ── Write frontend/.env.local ─────────────────────────────────────────────────
section "Environment file ────────────────────────────────────────────────────────"

# Derive VITE_* values from shared environment config (single source of truth)
eval "$(npx tsx "$REPO_ROOT/scripts/get-env-config.ts" "$ENV")"

{
  echo "# Auto-generated by scripts/post-deploy.sh (--env $ENV) — DO NOT COMMIT (covered by .gitignore)"
  echo "VITE_ENVIRONMENT=$ENV"
  if [[ "$ENV" == "dev" ]]; then
    echo "VITE_API_BASE_URL=$API_URL"
  else
    # API calls use relative paths so they are same-origin requests routed by
    # CloudFront to API Gateway. Using the direct API Gateway URL here would
    # cause CORS failures when the page is served from a custom domain.
    echo "VITE_API_BASE_URL="
    echo "VITE_PASSKEY_REQUIRED=$VITE_PASSKEY_REQUIRED"
  fi
  echo "VITE_SESSION_TIMEOUT_SECONDS=$VITE_SESSION_TIMEOUT_SECONDS"
  echo "VITE_VAULT_TIMEOUT_SECONDS=$VITE_VAULT_TIMEOUT_SECONDS"
} > "$ENV_FILE"

echo "  Wrote $ENV_FILE"

# ── Dev: smoke test + start Vite dev server ───────────────────────────────────
if [[ "$ENV" == "dev" ]]; then
  section "Smoke tests ─────────────────────────────────────────────────────────────"
  ENVIRONMENT="$ENV" \
    npx tsx "$REPO_ROOT/scripts/smoke-test.ts" \
      --base-url "$API_URL" \
      --region "$REGION"

  section "Dev server ──────────────────────────────────────────────────────────────"
  echo "  Starting Vite dev server at http://localhost:5173"
  echo "  Press Ctrl-C to stop and clean up."
  echo ""
  cd "$REPO_ROOT/frontend"
  npm run dev &
  VITE_PID=$!
  wait "$VITE_PID"
  exit 0
fi

# ── Beta/Prod: build → S3 sync → CloudFront invalidation → smoke test ─────────
section "Build ───────────────────────────────────────────────────────────────────"
cd "$REPO_ROOT/frontend"
npm run build
cd "$REPO_ROOT"

section "S3 sync ─────────────────────────────────────────────────────────────────"
echo "  Syncing to s3://$FRONTEND_BUCKET ..."
aws s3 sync "$REPO_ROOT/frontend/dist/" "s3://$FRONTEND_BUCKET/" \
  --region "$REGION" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"

# index.html must not be cached so browsers always fetch the latest entry point
aws s3 cp "$REPO_ROOT/frontend/dist/index.html" "s3://$FRONTEND_BUCKET/index.html" \
  --region "$REGION" \
  --cache-control "no-cache,no-store,must-revalidate"

echo "  ✓ Sync complete."

section "CloudFront invalidation ─────────────────────────────────────────────────"
echo "  Looking up distribution for $CF_DOMAIN ..."
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='${CF_DOMAIN}'].Id | [0]" \
  --output text 2>/dev/null || echo "")

if [[ -z "$DISTRIBUTION_ID" || "$DISTRIBUTION_ID" == "None" ]]; then
  echo "  ⚠  Could not resolve CloudFront distribution ID — skipping invalidation."
  echo "     You may need to invalidate manually: /*"
else
  INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --query "Invalidation.Id" \
    --output text)
  echo "  ✓ Invalidation created: $INVALIDATION_ID"
  echo "    (propagation typically takes 30–60 seconds)"
fi

section "Smoke tests ─────────────────────────────────────────────────────────────"
ENVIRONMENT="$ENV" \
  npx tsx "$REPO_ROOT/scripts/smoke-test.ts" \
    --base-url "$CLOUDFRONT_URL" \
    --region "$REGION"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "── Summary ─────────────────────────────────────────────────────────────────"
echo "  ✓ Frontend deployed successfully"
echo ""
echo "  $CLOUDFRONT_URL"
echo ""
