#!/usr/bin/env bash
# beta-deploy-ui.sh — Initialise admin (if needed) and deploy the frontend to
#                     the PassVault-Beta CloudFront distribution.
#
# Usage:
#   ./scripts/beta-deploy-ui.sh [--profile <aws-profile>] [--region <region>] [--stack <stack-name>]
#
# Options:
#   --profile   AWS named profile (sets AWS_PROFILE; picked up by both the
#               AWS CLI and the AWS SDK used by init-admin.ts).
#               Omit to use the default credential chain.
#   --region    AWS region the stack is deployed in (default: eu-central-1)
#   --stack     CloudFormation stack name (default: PassVault-Beta)
#
# What it does:
#   1. Reads ApiUrl, FrontendBucketName, CloudFrontUrl, and UsersTableName
#      from the deployed CloudFormation stack
#   2. Checks DynamoDB for the admin user; if absent, runs init-admin.ts and
#      prints the one-time password
#   3. Builds the frontend (npm run build) with the correct VITE_* variables
#   4. Syncs the built assets to the S3 frontend bucket
#   5. Creates a CloudFront invalidation to flush stale cache
#   6. Runs smoke-test.ts against the CloudFront URL to verify the full stack
#   7. Prints the live CloudFront URL

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
PROFILE=""
REGION="eu-central-1"
STACK="PassVault-Beta"
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
if [[ -n "$PROFILE" ]]; then
  export AWS_PROFILE="$PROFILE"
  echo "→ Using AWS profile: $PROFILE"
fi

# ── Derive ENVIRONMENT from stack name ────────────────────────────────────────
# PassVault-Dev → dev, PassVault-Beta → beta, PassVault-Prod → prod
CDK_ENV=$(echo "$STACK" | awk -F'-' '{print tolower($NF)}')

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  if [[ -f "$ENV_FILE" ]]; then
    rm -f "$ENV_FILE"
    echo "→ Deleted $ENV_FILE"
  fi
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
  echo "  cd cdk && cdk deploy --all --context env=$CDK_ENV" >&2
  exit 1
}

TABLE_NAME=$(_cfn_output UsersTableName)
FRONTEND_BUCKET=$(_cfn_output FrontendBucketName)
CLOUDFRONT_URL=$(_cfn_output CloudFrontUrl)

if [[ -z "$API_URL" || "$API_URL" == "None" ]]; then
  echo "Error: ApiUrl output not found in stack $STACK." >&2
  exit 1
fi
if [[ -z "$TABLE_NAME" || "$TABLE_NAME" == "None" ]]; then
  echo "Error: UsersTableName output not found in stack $STACK." >&2
  exit 1
fi
if [[ -z "$FRONTEND_BUCKET" || "$FRONTEND_BUCKET" == "None" ]]; then
  echo "Error: FrontendBucketName output not found in stack $STACK." >&2
  exit 1
fi
if [[ -z "$CLOUDFRONT_URL" || "$CLOUDFRONT_URL" == "None" ]]; then
  echo "Error: CloudFrontUrl output not found in stack $STACK." >&2
  echo "       Make sure cloudFrontEnabled=true for this environment." >&2
  exit 1
fi

# Strip trailing slash — ApiClient prepends paths with /
API_URL="${API_URL%/}"
# Extract bare domain for CloudFront distribution lookup (strip https://)
CF_DOMAIN="${CLOUDFRONT_URL#https://}"
CF_DOMAIN="${CF_DOMAIN%/}"

echo "→ API URL:          $API_URL"
echo "→ Frontend bucket:  $FRONTEND_BUCKET"
echo "→ CloudFront URL:   $CLOUDFRONT_URL"
echo "→ DynamoDB table:   $TABLE_NAME"

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
  ENVIRONMENT="$CDK_ENV" \
  DYNAMODB_TABLE="$TABLE_NAME" \
    npx tsx "$REPO_ROOT/scripts/init-admin.ts"
  echo ""
  echo "⚠  Save the one-time password above before continuing."
  echo "   Press Enter to continue with the frontend build..."
  read -r
else
  echo "→ Admin account already exists — skipping initialisation."
fi

# ── Write frontend/.env.local ─────────────────────────────────────────────────
# Timeout values match betaConfig in shared/src/config/environments.ts.
# .env.local is covered by .gitignore and is deleted on exit.
cat > "$ENV_FILE" << EOF
# Auto-generated by scripts/beta-deploy-ui.sh — DO NOT COMMIT (covered by .gitignore)
VITE_ENVIRONMENT=$CDK_ENV
# API calls use relative paths (no base URL) so they are same-origin requests
# routed by CloudFront to the API Gateway via the distribution's path behaviors.
# Using the direct API Gateway URL here would cause CORS failures when the page
# is served from a custom domain whose Origin doesn't match FRONTEND_ORIGIN in Lambda.
VITE_API_BASE_URL=
VITE_PASSKEY_REQUIRED=false
VITE_VIEW_TIMEOUT_SECONDS=300
VITE_EDIT_TIMEOUT_SECONDS=600
VITE_ADMIN_TIMEOUT_SECONDS=86400
EOF

echo "→ Wrote $ENV_FILE"

# ── Build frontend ────────────────────────────────────────────────────────────
echo "→ Building frontend..."
cd "$REPO_ROOT/frontend"
npm run build
cd "$REPO_ROOT"
echo "→ Build complete."

# ── Sync to S3 ───────────────────────────────────────────────────────────────
echo "→ Syncing to s3://$FRONTEND_BUCKET ..."
aws s3 sync "$REPO_ROOT/frontend/dist/" "s3://$FRONTEND_BUCKET/" \
  --region "$REGION" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"

# index.html must not be cached so browsers always fetch the latest entry point
aws s3 cp "$REPO_ROOT/frontend/dist/index.html" "s3://$FRONTEND_BUCKET/index.html" \
  --region "$REGION" \
  --cache-control "no-cache,no-store,must-revalidate"

echo "→ Sync complete."

# ── CloudFront invalidation ───────────────────────────────────────────────────
echo "→ Looking up CloudFront distribution for $CF_DOMAIN ..."

DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='${CF_DOMAIN}'].Id | [0]" \
  --output text 2>/dev/null || echo "")

if [[ -z "$DISTRIBUTION_ID" || "$DISTRIBUTION_ID" == "None" ]]; then
  echo "⚠  Could not resolve CloudFront distribution ID — skipping invalidation."
  echo "   You may need to invalidate manually: /*"
else
  echo "→ Creating invalidation for distribution $DISTRIBUTION_ID ..."
  INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --query "Invalidation.Id" \
    --output text)
  echo "→ Invalidation created: $INVALIDATION_ID"
  echo "   (propagation typically takes 30–60 seconds)"
fi

# ── Run smoke tests ───────────────────────────────────────────────────────────
# Test against the CloudFront URL to validate the full stack (API paths are
# cache-disabled, so invalidation propagation delay does not affect these tests).
echo "→ Running smoke tests against $CLOUDFRONT_URL ..."
ENVIRONMENT="$CDK_ENV" \
  npx tsx "$REPO_ROOT/scripts/smoke-test.ts" \
    --base-url "$CLOUDFRONT_URL" \
    --region "$REGION"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "┌─────────────────────────────────────────────────────┐"
echo "│  ✓ Frontend deployed successfully                   │"
echo "└─────────────────────────────────────────────────────┘"
echo ""
echo "  $CLOUDFRONT_URL"
echo ""
