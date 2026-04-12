#!/usr/bin/env bash
# killswitch.sh — Check, activate, or reset the Lambda concurrency kill switch.
#
# Usage:
#   ./scripts/killswitch.sh --env beta                    # check status
#   ./scripts/killswitch.sh --env prod --activate          # activate (block all traffic)
#   ./scripts/killswitch.sh --env beta --reset             # reset (restore concurrency)
#   ./scripts/killswitch.sh --env prod --reset --yes       # reset without confirmation
#
# Options:
#   --env <name>     Target environment: beta | prod (required; dev rejected)
#   --profile <name> AWS named profile
#   --region <region> AWS region (default: eu-central-1)
#   --activate       Trigger the kill switch via SNS
#   --reset          Restore Lambda concurrency to expected values
#   --yes            Skip confirmation prompt
#   -h, --help       Show usage

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV=""
PROFILE=""
REGION="eu-central-1"
ACTIVATE=false
RESET=false
YES=false
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

USAGE="Usage: $0 --env <beta|prod> [--activate | --reset] [--profile <name>] [--region <region>] [--yes]"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)       ENV="$2";       shift 2 ;;
    --profile)   PROFILE="$2";   shift 2 ;;
    --region)    REGION="$2";    shift 2 ;;
    --activate)  ACTIVATE=true;  shift ;;
    --reset)     RESET=true;     shift ;;
    --yes)       YES=true;       shift ;;
    -h|--help)
      echo "$USAGE"
      echo ""
      echo "Modes:"
      echo "  (default)    Show kill switch status and Lambda concurrency table"
      echo "  --activate   Publish SNS ALARM to trigger the kill switch (blocks all API traffic)"
      echo "  --reset      Directly restore Lambda concurrency to expected values"
      echo ""
      echo "The kill switch is only deployed in beta and prod. Dev is rejected."
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "$USAGE" >&2
      exit 1
      ;;
  esac
done

# ── Validation ────────────────────────────────────────────────────────────────
if [[ -z "$ENV" ]]; then
  echo "Error: --env is required." >&2
  echo "$USAGE" >&2
  exit 1
fi

case "$ENV" in
  beta|prod) ;;
  dev)
    echo "Error: kill switch is not enabled in dev." >&2
    exit 1
    ;;
  *)
    echo "Error: unknown environment '$ENV'. Valid values: beta, prod." >&2
    exit 1
    ;;
esac

if [[ "$ACTIVATE" == "true" && "$RESET" == "true" ]]; then
  echo "Error: --activate and --reset cannot be used together." >&2
  exit 1
fi

# ── AWS setup ─────────────────────────────────────────────────────────────────
STACK_ENV="$(echo "$ENV" | tr '[:lower:]' '[:upper:]' | cut -c1)$(echo "$ENV" | cut -c2-)"
STACK="PassVault-${STACK_ENV}"

if [[ -n "$PROFILE" ]]; then
  export AWS_PROFILE="$PROFILE"
fi

if ! aws sts get-caller-identity --region "$REGION" &>/dev/null; then
  echo "No AWS access — cannot reach AWS STS." >&2
  echo "  Your SSO session may have expired. Run:" >&2
  [[ -n "$PROFILE" ]] \
    && echo "    aws sso login --profile $PROFILE" >&2 \
    || echo "    aws sso login" >&2
  exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
_cfn_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
    --output text
}

# ── Read stack outputs ────────────────────────────────────────────────────────
echo ""
echo "PassVault Kill Switch"
echo "  Environment : $ENV"
echo "  Stack       : $STACK"
echo "  Region      : $REGION"
[[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
echo ""

FN_NAMES_CSV=$(_cfn_output KillSwitchFunctionNames 2>/dev/null || echo "")
EXPECTED_CSV=$(_cfn_output KillSwitchExpectedConcurrency 2>/dev/null || echo "")

[[ "$FN_NAMES_CSV" == "None" ]] && FN_NAMES_CSV=""
[[ "$EXPECTED_CSV" == "None" ]] && EXPECTED_CSV=""

if [[ -z "$FN_NAMES_CSV" || -z "$EXPECTED_CSV" ]]; then
  echo "Error: could not read KillSwitchFunctionNames / KillSwitchExpectedConcurrency" >&2
  echo "  from stack $STACK. Is the kill switch deployed?" >&2
  exit 1
fi

# Split into arrays
IFS=',' read -ra FN_NAMES <<< "$FN_NAMES_CSV"
IFS=',' read -ra EXPECTED <<< "$EXPECTED_CSV"

if [[ ${#FN_NAMES[@]} -ne ${#EXPECTED[@]} ]]; then
  echo "Error: function count (${#FN_NAMES[@]}) != concurrency count (${#EXPECTED[@]})." >&2
  exit 1
fi

# ── Get current concurrency for a function ────────────────────────────────────
_get_concurrency() {
  local result
  result=$(aws lambda get-function-concurrency \
    --function-name "$1" \
    --region "$REGION" \
    --query "ReservedConcurrentExecutions" \
    --output text 2>/dev/null || echo "")
  # Empty or "None" means no reserved concurrency (unreserved pool)
  if [[ -z "$result" || "$result" == "None" ]]; then
    echo "None"
  else
    echo "$result"
  fi
}

# ── Show status table ─────────────────────────────────────────────────────────
_show_status() {
  local any_killed=false

  printf "  %-42s %-12s %-12s %s\n" "Function" "Current" "Expected" "Status"
  printf "  %-42s %-12s %-12s %s\n" "--------" "-------" "--------" "------"

  for i in "${!FN_NAMES[@]}"; do
    local fn="${FN_NAMES[$i]}"
    local exp="${EXPECTED[$i]}"
    local cur
    cur=$(_get_concurrency "$fn")

    local exp_display="$exp"
    local status="ok"

    if [[ "$exp" == "0" ]]; then
      # Expected = unreserved pool
      exp_display="unreserved"
      if [[ "$cur" == "0" ]]; then
        status="KILLED"
        any_killed=true
      elif [[ "$cur" == "None" ]]; then
        status="ok"
        cur="unreserved"
      fi
    else
      # Expected = specific number
      if [[ "$cur" == "0" ]]; then
        status="KILLED"
        any_killed=true
      elif [[ "$cur" == "$exp" ]]; then
        status="ok"
      elif [[ "$cur" == "None" ]]; then
        status="no reservation"
      else
        status="mismatch"
      fi
    fi

    printf "  %-42s %-12s %-12s %s\n" "$fn" "$cur" "$exp_display" "$status"
  done

  echo ""
  if [[ "$any_killed" == "true" ]]; then
    echo "  Kill switch: ACTIVE"
  else
    echo "  Kill switch: inactive"
  fi
  echo ""
}

# ── Write audit event to DynamoDB ─────────────────────────────────────────────
_write_audit_event() {
  local action="$1"
  local trigger="$2"
  local audit_table="passvault-audit-${ENV}"
  local event_id
  event_id=$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null || echo "manual-$(date +%s)")
  event_id=$(echo "$event_id" | tr '[:upper:]' '[:lower:]')
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
  local expires_at
  expires_at=$(( $(date +%s) + 7776000 ))  # 90 days

  aws dynamodb put-item \
    --table-name "$audit_table" \
    --region "$REGION" \
    --item "{
      \"eventId\": {\"S\": \"$event_id\"},
      \"category\": {\"S\": \"system\"},
      \"action\": {\"S\": \"$action\"},
      \"userId\": {\"S\": \"SYSTEM\"},
      \"timestamp\": {\"S\": \"$timestamp\"},
      \"details\": {\"M\": {\"trigger\": {\"S\": \"$trigger\"}}},
      \"expiresAt\": {\"N\": \"$expires_at\"}
    }" 2>/dev/null || echo "  Warning: failed to write audit event."
}

# ── Status mode (default) ────────────────────────────────────────────────────
if [[ "$ACTIVATE" == "false" && "$RESET" == "false" ]]; then
  _show_status
  exit 0
fi

# ── Activate mode ─────────────────────────────────────────────────────────────
if [[ "$ACTIVATE" == "true" ]]; then
  # Determine SNS topic
  if [[ "$ENV" == "beta" ]]; then
    TOPIC_ARN=$(_cfn_output KillSwitchTopicArn 2>/dev/null || echo "")
  else
    TOPIC_ARN=$(_cfn_output AlertTopicArn 2>/dev/null || echo "")
  fi
  [[ "$TOPIC_ARN" == "None" ]] && TOPIC_ARN=""

  if [[ -z "$TOPIC_ARN" ]]; then
    echo "Error: could not read SNS topic ARN from stack $STACK." >&2
    exit 1
  fi

  echo "  This will BLOCK ALL API TRAFFIC for $ENV."
  echo "  SNS topic: $TOPIC_ARN"
  echo ""

  if [[ "$YES" != "true" ]]; then
    read -rp "  Type 'yes' to confirm: " confirm
    if [[ "$confirm" != "yes" ]]; then
      echo "  Aborted."
      exit 0
    fi
  fi

  echo ""
  echo "  Publishing ALARM to SNS..."
  aws sns publish \
    --region "$REGION" \
    --topic-arn "$TOPIC_ARN" \
    --message '{"NewStateValue":"ALARM","AlarmName":"manual-killswitch"}' \
    --output text > /dev/null

  echo "  Published. Waiting 5 seconds for kill switch Lambda..."
  sleep 5
  echo ""

  _show_status
  exit 0
fi

# ── Reset mode ────────────────────────────────────────────────────────────────
if [[ "$RESET" == "true" ]]; then
  echo "  This will RESTORE Lambda concurrency for $ENV."
  echo ""

  if [[ "$YES" != "true" ]]; then
    read -rp "  Type 'yes' to confirm: " confirm
    if [[ "$confirm" != "yes" ]]; then
      echo "  Aborted."
      exit 0
    fi
  fi

  echo ""
  echo "  Restoring concurrency..."

  for i in "${!FN_NAMES[@]}"; do
    local_fn="${FN_NAMES[$i]}"
    local_exp="${EXPECTED[$i]}"

    if [[ "$local_exp" == "0" ]]; then
      echo "    $local_fn → delete reservation (unreserved pool)"
      aws lambda delete-function-concurrency \
        --function-name "$local_fn" \
        --region "$REGION" 2>/dev/null || echo "      Warning: delete-function-concurrency failed for $local_fn"
    else
      echo "    $local_fn → $local_exp"
      aws lambda put-function-concurrency \
        --function-name "$local_fn" \
        --region "$REGION" \
        --reserved-concurrent-executions "$local_exp" > /dev/null 2>&1 || echo "      Warning: put-function-concurrency failed for $local_fn"
    fi
  done

  echo ""
  echo "  Writing audit event..."
  _write_audit_event "kill_switch_deactivated" "manual"

  echo ""
  _show_status
  exit 0
fi
