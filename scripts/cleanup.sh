#!/usr/bin/env bash
# cleanup.sh — Remove AWS resources left behind after `cdk destroy`.
#
# Usage:
#   ./scripts/cleanup.sh --env <dev|beta|prod> [--profile <aws-profile>] [--region <region>]
#
# Run this after: cdk destroy PassVault-{Dev|Beta|Prod} --context env={env}
#
# Resources cleaned up:
#   • DynamoDB tables   passvault-users-{env}                  (removalPolicy: RETAIN)
#                       passvault-vaults-{env}                 (removalPolicy: RETAIN)
#                       passvault-audit-{env}                  (removalPolicy: DESTROY)
#                       passvault-config-{env}                 (removalPolicy: DESTROY)
#                       passvault-login-events-{env}           (removalPolicy: DESTROY)
#   • S3 files bucket   auto-named, found via CFN stack tag    (removalPolicy: RETAIN)
#   • CloudWatch logs   /aws/lambda/passvault-*-{env}          (DESTROY but sometimes missed)
#   • (prod only)       /aws/lambda/passvault-kill-switch

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV=""
PROFILE=""
REGION="eu-central-1"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)      ENV="$2";     shift 2 ;;
    --profile)  PROFILE="$2"; shift 2 ;;
    --region)   REGION="$2";  shift 2 ;;
    -h|--help)
      echo "Usage: $0 --env <dev|beta|prod> [--profile <name>] [--region <region>]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 --env <dev|beta|prod> [--profile <name>] [--region <region>]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ENV" ]]; then
  echo "Error: --env is required." >&2
  echo "Usage: $0 --env <dev|beta|prod> [--profile <name>] [--region <region>]" >&2
  exit 1
fi

case "$ENV" in
  dev|beta|prod) ;;
  *)
    echo "Error: unknown environment '$ENV'. Valid values: dev, beta, prod." >&2
    exit 1
    ;;
esac

# "dev" → "Dev" for the CloudFormation stack name
STACK_ENV="$(echo "$ENV" | tr '[:lower:]' '[:upper:]' | cut -c1)$(echo "$ENV" | cut -c2-)"
STACK_NAME="PassVault-${STACK_ENV}"

if [[ -n "$PROFILE" ]]; then
  export AWS_PROFILE="$PROFILE"
fi

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "PassVault post-destroy cleanup"
echo "  Environment : $ENV"
echo "  Stack       : $STACK_NAME"
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

# ── Guard: warn if stack is still live ───────────────────────────────────────
stack_status=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].StackStatus" \
  --output text 2>/dev/null || echo "DOES_NOT_EXIST")

if [[ "$stack_status" != "DOES_NOT_EXIST" ]]; then
  echo "⚠  Stack $STACK_NAME still exists (status: $stack_status)."
  echo "   Destroy it first:"
  echo "     cd cdk && cdk destroy $STACK_NAME --context env=$ENV"
  echo ""
  read -rp "Continue anyway? [y/N] " _ans
  [[ "$_ans" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
  echo ""
fi

# ── Extra confirmation gate for prod ─────────────────────────────────────────
if [[ "$ENV" == "prod" ]]; then
  echo "⚠  PRODUCTION — this will permanently delete user data (DynamoDB) and"
  echo "   encrypted vault files (S3). There is no undo."
  echo ""
  read -rp "   Type 'prod' to confirm: " _prod_confirm
  if [[ "$_prod_confirm" != "prod" ]]; then
    echo "Aborted."
    exit 0
  fi
  echo ""
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
DELETED=()

confirm() {
  local ans
  read -rp "  $1 [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

section() {
  echo ""
  echo "── $1 "
}

# ── DynamoDB ──────────────────────────────────────────────────────────────────
section "DynamoDB ───────────────────────────────────────────────────────────────"

_delete_table() {
  local table="$1"
  if aws dynamodb describe-table \
      --table-name "$table" \
      --region "$REGION" &>/dev/null; then

    local item_count
    item_count=$(aws dynamodb scan \
      --table-name "$table" \
      --region "$REGION" \
      --select COUNT \
      --query "Count" \
      --output text)
    echo "  Found: $table  ($item_count items)"

    if confirm "Delete table '$table'?"; then
      aws dynamodb delete-table \
        --table-name "$table" \
        --region "$REGION" &>/dev/null
      echo "  ✓ Deleted."
      DELETED+=("DynamoDB: $table")
    else
      echo "  Skipped."
    fi
  else
    echo "  Not found: $table  (already removed or never deployed)"
  fi
}

_delete_table "passvault-users-${ENV}"
_delete_table "passvault-vaults-${ENV}"
_delete_table "passvault-audit-${ENV}"
_delete_table "passvault-config-${ENV}"
_delete_table "passvault-login-events-${ENV}"

# ── S3 files bucket ───────────────────────────────────────────────────────────
section "S3 ──────────────────────────────────────────────────────────────────────"
echo "  Searching for files bucket tagged 'passvault:env=$ENV' ..."

FILES_BUCKET=""
all_buckets=$(aws s3api list-buckets \
  --query "Buckets[].Name" \
  --output text 2>/dev/null || echo "")

for bucket in $all_buckets; do
  tag_val=$(aws s3api get-bucket-tagging \
    --bucket "$bucket" \
    --query "TagSet[?Key=='passvault:env'].Value | [0]" \
    --output text 2>/dev/null || echo "")
  if [[ "$tag_val" == "$ENV" ]]; then
    FILES_BUCKET="$bucket"
    break
  fi
done

if [[ -n "$FILES_BUCKET" ]]; then
  OBJ_COUNT=$(aws s3 ls "s3://${FILES_BUCKET}" --recursive \
    --region "$REGION" 2>/dev/null | wc -l | tr -d ' ')
  echo "  Found: $FILES_BUCKET  ($OBJ_COUNT current objects)"

  if confirm "Empty and delete bucket '$FILES_BUCKET'?"; then
    echo "  Removing objects..."
    aws s3 rm "s3://${FILES_BUCKET}" --recursive --region "$REGION" &>/dev/null || true

    # For versioned buckets (prod has versioning enabled): delete all versions
    # and delete markers that remain after the recursive remove.
    versioning=$(aws s3api get-bucket-versioning \
      --bucket "$FILES_BUCKET" \
      --query "Status" --output text 2>/dev/null || echo "")

    if [[ "$versioning" == "Enabled" || "$versioning" == "Suspended" ]]; then
      echo "  Removing object versions and delete markers..."
      _PY_DELETE_VERSIONS=$(cat <<'PYEOF'
import sys, json, subprocess
d = json.load(sys.stdin)
objs = [{'Key': v['Key'], 'VersionId': v['VersionId']}
        for v in d.get('Versions', []) + d.get('DeleteMarkers', [])]
if objs:
    payload = json.dumps({'Objects': objs, 'Quiet': True})
    bucket  = sys.argv[1]
    region  = sys.argv[2]
    subprocess.run(
        ['aws', 's3api', 'delete-objects',
         '--bucket', bucket, '--delete', payload, '--region', region],
        check=True,
    )
PYEOF
)
      aws s3api list-object-versions \
        --bucket "$FILES_BUCKET" \
        --region "$REGION" \
        --output json 2>/dev/null \
      | python3 -c "$_PY_DELETE_VERSIONS" "$FILES_BUCKET" "$REGION" || true
    fi

    aws s3api delete-bucket \
      --bucket "$FILES_BUCKET" \
      --region "$REGION"
    echo "  ✓ Deleted."
    DELETED+=("S3: $FILES_BUCKET")
  else
    echo "  Skipped."
  fi
else
  echo "  Not found: no bucket tagged '$STACK_NAME'  (already removed or never deployed)"
fi

# ── CloudWatch log groups ─────────────────────────────────────────────────────
section "CloudWatch log groups ───────────────────────────────────────────────────"

# Collect all Lambda log groups belonging to this environment.
# Two prefixes are needed:
#   1. /aws/lambda/passvault-{env}  — explicitly named app Lambdas (lowercase)
#   2. /aws/lambda/PassVault-{Env}- — CDK-generated custom resource Lambdas
#      (e.g. the autoDeleteObjects handler), which inherit the mixed-case stack name.
LOG_GROUPS=()
_collect_log_groups() {
  local prefix="$1"
  local filter="$2"   # grep pattern; empty string means accept all results
  while IFS= read -r lg; do
    [[ -n "$lg" ]] && LOG_GROUPS+=("$lg")
  done < <(
    aws logs describe-log-groups \
      --log-group-name-prefix "$prefix" \
      --region "$REGION" \
      --query "logGroups[].logGroupName" \
      --output text 2>/dev/null \
    | tr '\t' '\n' \
    | { [[ -n "$filter" ]] && grep -- "$filter" || cat; } \
    || true
  )
}

# App Lambdas: names end with -{env}
_collect_log_groups "/aws/lambda/passvault-" "-${ENV}$"
# CDK custom resource Lambdas: names start with /aws/lambda/PassVault-{Env}-
_collect_log_groups "/aws/lambda/${STACK_NAME}-" ""

# Prod also deploys a kill-switch Lambda with a fixed name (no env suffix).
if [[ "$ENV" == "prod" ]]; then
  ks_lg=$(aws logs describe-log-groups \
    --log-group-name-prefix "/aws/lambda/passvault-kill-switch" \
    --region "$REGION" \
    --query "logGroups[0].logGroupName" \
    --output text 2>/dev/null || echo "")
  if [[ -n "$ks_lg" && "$ks_lg" != "None" ]]; then
    LOG_GROUPS+=("$ks_lg")
  fi
fi

if [[ ${#LOG_GROUPS[@]} -gt 0 ]]; then
  echo "  Found ${#LOG_GROUPS[@]} log group(s):"
  for lg in "${LOG_GROUPS[@]}"; do
    echo "    • $lg"
  done

  if confirm "Delete all ${#LOG_GROUPS[@]} log group(s)?"; then
    for lg in "${LOG_GROUPS[@]}"; do
      aws logs delete-log-group \
        --log-group-name "$lg" \
        --region "$REGION"
      echo "  ✓ Deleted $lg"
      DELETED+=("Log group: $lg")
    done
  else
    echo "  Skipped."
  fi
else
  echo "  Not found: no /aws/lambda/passvault-*-${ENV} log groups  (already removed)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "── Summary ─────────────────────────────────────────────────────────────────"
if [[ ${#DELETED[@]} -gt 0 ]]; then
  echo "  Deleted ${#DELETED[@]} resource(s):"
  for r in "${DELETED[@]}"; do
    echo "    ✓ $r"
  done
else
  echo "  Nothing was deleted."
fi
echo ""
