#!/usr/bin/env bash
# qualify.sh — Full qualification pipeline for PassVault (dev | beta).
#
# Prod is not qualifiable by this script — the qualification pipeline creates
# and destroys ephemeral test users and is unsafe to run against production.
#
# Usage:
#   # Dev (self-contained; no operator input required)
#   ./scripts/qualify.sh [--profile <name>] [--region <region>]
#
#   # Beta — fresh deploy (no existing PassVault-Beta stack):
#   #   --domain and --plus-address are MANDATORY because cdk deploy needs them.
#   ./scripts/qualify.sh --env beta \
#     --domain example.com --plus-address you@example.com \
#     [--profile <name>] [--region <region>] [--yes]
#
#   # Beta — resume against an already-deployed stack:
#   #   --domain and --plus-address are read from the stack's Domain and
#   #   PlusAddress CfnOutputs, no CLI flags needed.
#   ./scripts/qualify.sh --env beta --resume [--profile <name>]
#
#   # Cleanup (dev or beta). For beta, values are discovered from the stack
#   # outputs if still present; otherwise --domain/--plus-address must be
#   # re-passed so cdk destroy can synth the same stack.
#   ./scripts/qualify.sh --cleanup [state-file] [--env <env>] [--profile <name>]
#
# Options:
#   --env <name>           Target environment: dev (default) | beta. prod is rejected.
#   --profile <name>       AWS named profile
#   --region <region>      AWS region (default: eu-central-1)
#   --domain <d>           Root domain. Required for beta fresh deploys (cdk needs
#                          --context domain=<d>). Ignored/discovered-from-stack when
#                          the target stack already exists. The domain must already
#                          be a Verified SES identity in the account/region.
#   --plus-address <addr>  Mailbox that receives all qualification test mail.
#                          Required for beta fresh deploys. Must be local@<domain>
#                          and its domain must equal --domain. Test users become
#                          local+<tag>@<domain>.
#   --yes                  Skip the beta "real mail will be sent" confirmation (CI bypass)
#   --resume               Skip build/test/deploy; run SIT/pentest/E2E/perf against existing stack
#   --cleanup [state-file] Skip tests; only tear down a previous qualification run.
#                          If no file given, auto-discovers .qualify-state-${env}-*.json.
#   -h, --help             Show usage
#
# Runs: build → unit tests → cdk deploy → SIT → pentest → E2E → perf → evaluate → cleanup/report.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV="dev"
STACK=""
PROFILE=""
REGION="eu-central-1"
DOMAIN=""
PLUS_ADDRESS=""
ASSUME_YES=false
CLEANUP=false
CLEANUP_FILE=""
RESUME=false
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

USAGE="Usage: $0 [--profile <name>] [--region <region>] [--resume] [--yes]                            # dev (default)
       $0 --env beta --domain <d> --plus-address <addr> [--profile <name>] [--yes]   # beta, fresh deploy
       $0 --env beta --resume [--profile <name>]                                     # beta, against existing stack
       $0 --cleanup [state-file] [--env <env>] [--profile <name>]"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)           ENV="$2";           shift 2 ;;
    --profile)       PROFILE="$2";       shift 2 ;;
    --region)        REGION="$2";        shift 2 ;;
    --domain)        DOMAIN="$2";        shift 2 ;;
    --plus-address)  PLUS_ADDRESS="$2";  shift 2 ;;
    --yes)           ASSUME_YES=true;    shift ;;
    --cleanup)
      CLEANUP=true
      if [[ $# -ge 2 && "$2" != --* ]]; then
        CLEANUP_FILE="$2"
        shift 2
      else
        shift
      fi
      ;;
    --resume)    RESUME=true;       shift ;;
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

case "$ENV" in
  dev|beta) ;;
  prod)
    cat >&2 <<'EOM'
Error: qualification against prod is not allowed.

qualify.sh creates and destroys ephemeral test users, admins, and vaults. Run
it against dev (safe, no real mail) or beta (real SES via test email routing)
only. Prod must never see qualification traffic.
EOM
    exit 1
    ;;
  *)
    echo "Error: unknown environment '$ENV'. Valid values: dev, beta." >&2
    exit 1
    ;;
esac

# Derive stack name from env (matches shared getEnvironmentConfig().stackName).
STACK_ENV_CAP="$(echo "$ENV" | tr '[:lower:]' '[:upper:]' | cut -c1)$(echo "$ENV" | cut -c2-)"
STACK="PassVault-${STACK_ENV_CAP}"

# Validate --plus-address shape (local@domain) and domain match when set.
if [[ -n "$PLUS_ADDRESS" ]]; then
  if [[ ! "$PLUS_ADDRESS" =~ ^[^@[:space:]]+@[^@[:space:]]+$ ]]; then
    echo "Error: --plus-address must be a valid email (local@domain), got: $PLUS_ADDRESS" >&2
    exit 1
  fi
  PLUS_LOCAL="${PLUS_ADDRESS%@*}"
  PLUS_DOMAIN="${PLUS_ADDRESS#*@}"
  if [[ -n "$DOMAIN" && "$PLUS_DOMAIN" != "$DOMAIN" ]]; then
    echo "Error: --plus-address domain ($PLUS_DOMAIN) must match --domain ($DOMAIN)." >&2
    exit 1
  fi
fi

# Derive the CDK adminEmail context value. When plus-addressing is on, route
# the bootstrap admin's mail into the same inbox under a distinct tag.
if [[ -n "$PLUS_ADDRESS" ]]; then
  ADMIN_EMAIL_CTX="${PLUS_LOCAL}+qualify-admin@${PLUS_DOMAIN}"
else
  ADMIN_EMAIL_CTX="qualify@passvault-test.local"
fi

# Common CDK context args, used by deploy and destroy. Extra --context flags
# are appended when domain/plus-address are provided (always, for beta/prod).
cdk_ctx_args() {
  local args="--context env=$ENV --context adminEmail=$ADMIN_EMAIL_CTX"
  [[ -n "$DOMAIN" ]]       && args="$args --context domain=$DOMAIN"
  [[ -n "$PLUS_ADDRESS" ]] && args="$args --context plusAddress=$PLUS_ADDRESS"
  echo "$args"
}

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

section() {
  echo ""
  echo -e "${CYAN}── $1 ${RESET}"
}

pass_mark() { echo -e "${GREEN}✓${RESET}"; }
fail_mark() { echo -e "${RED}✗${RESET}"; }
skip_mark() { echo -e "${YELLOW}—${RESET}"; }

fmt_duration() {
  local secs=$1
  if [[ $secs -ge 60 ]]; then
    echo "$((secs / 60))m $((secs % 60))s"
  else
    echo "${secs}s"
  fi
}

# ── Export AWS_PROFILE ────────────────────────────────────────────────────────
if [[ -n "$PROFILE" ]]; then
  export AWS_PROFILE="$PROFILE"
fi

# ── AWS helpers ──────────────────────────────────────────────────────────────
_cfn_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
    --output text
}

aws_args() {
  local args=""
  [[ -n "$PROFILE" ]] && args="--profile $PROFILE"
  args="$args --region $REGION"
  echo "$args"
}

# ── Resolve context: verify credentials, probe stack, fill/demand beta flags ─
#
# Runs once, up front, so the rest of the script (cleanup mode, normal mode,
# sub-script invocations, final destroy) has a single consistent view of
# DOMAIN, PLUS_ADDRESS, and STACK_EXISTS. Without this, beta cleanup and
# beta --resume would have no way to recover domain/plus-address and cdk
# destroy would synth a different stack graph than what was deployed.
#
# Dev is unaffected: domain/plus-address stay empty and all cdk invocations
# use the same minimal context they always did.

if ! aws sts get-caller-identity --region "$REGION" &>/dev/null; then
  echo "Error: no AWS access — aws sts get-caller-identity failed." >&2
  [[ -n "$PROFILE" ]] \
    && echo "  Your SSO session may have expired. Run: aws sso login --profile $PROFILE" >&2 \
    || echo "  Your SSO session may have expired. Run: aws sso login" >&2
  exit 1
fi

STACK_EXISTS=false
if aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" &>/dev/null; then
  STACK_EXISTS=true
fi

if [[ "$ENV" == "beta" && "$CLEANUP" == "true" && "$STACK_EXISTS" == "false" ]]; then
  # Cleanup mode with no remaining stack — nothing to destroy, so domain/
  # plus-address are not needed. Fall through; the sub-script cleanups and
  # state-file removal still run, cdk destroy is a no-op.
  echo "  $STACK already destroyed — cleanup will remove sub-script state only."
elif [[ "$ENV" == "beta" ]]; then
  if [[ "$STACK_EXISTS" == "true" ]]; then
    # Stack is already deployed. Read the Domain and PlusAddress outputs that
    # the CDK stack emits (cdk/lib/passvault-stack.ts) and use them as the
    # single source of truth for every downstream step. If the operator
    # *also* passed --domain or --plus-address, they must match exactly —
    # mismatched values would cause the final cdk destroy to synth against a
    # different context than was deployed and orphan resources.
    DISCOVERED_DOMAIN=$(_cfn_output Domain 2>/dev/null || echo "")
    DISCOVERED_PLUS=$(_cfn_output PlusAddress 2>/dev/null || echo "")
    [[ "$DISCOVERED_DOMAIN" == "None" ]] && DISCOVERED_DOMAIN=""
    [[ "$DISCOVERED_PLUS"   == "None" ]] && DISCOVERED_PLUS=""

    if [[ -z "$DISCOVERED_DOMAIN" || -z "$DISCOVERED_PLUS" ]]; then
      cat >&2 <<EOM
Error: $STACK exists but is missing the Domain and/or PlusAddress CfnOutputs.

  Discovered Domain       : '${DISCOVERED_DOMAIN:-<missing>}'
  Discovered PlusAddress  : '${DISCOVERED_PLUS:-<missing>}'

This means the stack was deployed before the test-email-routing feature
landed (or without --context domain=... and --context plusAddress=...). Redeploy
with both contexts set, then re-run qualify. See cdk/DEPLOYMENT.md §4b.
EOM
      exit 1
    fi

    if [[ -n "$DOMAIN" && "$DOMAIN" != "$DISCOVERED_DOMAIN" ]]; then
      echo "Error: --domain '$DOMAIN' does not match $STACK's Domain output '$DISCOVERED_DOMAIN'." >&2
      echo "       Omit --domain to use the deployed value, or redeploy the stack first." >&2
      exit 1
    fi
    if [[ -n "$PLUS_ADDRESS" && "$PLUS_ADDRESS" != "$DISCOVERED_PLUS" ]]; then
      echo "Error: --plus-address '$PLUS_ADDRESS' does not match $STACK's PlusAddress output '$DISCOVERED_PLUS'." >&2
      echo "       Omit --plus-address to use the deployed value, or redeploy the stack first." >&2
      exit 1
    fi

    DOMAIN="$DISCOVERED_DOMAIN"
    PLUS_ADDRESS="$DISCOVERED_PLUS"
    PLUS_LOCAL="${PLUS_ADDRESS%@*}"
    PLUS_DOMAIN="${PLUS_ADDRESS#*@}"
    echo "  Context source: $STACK outputs (Domain=$DOMAIN, PlusAddress=$PLUS_ADDRESS)"
  else
    # Stack does not exist — qualify.sh will run `cdk deploy` and needs the
    # values on the CLI. There is nowhere else to get them from.
    MISSING=""
    [[ -z "$DOMAIN" ]]       && MISSING="${MISSING} --domain"
    [[ -z "$PLUS_ADDRESS" ]] && MISSING="${MISSING} --plus-address"
    if [[ -n "$MISSING" ]]; then
      cat >&2 <<EOM
Error: beta qualification requires${MISSING}.

  $STACK is not yet deployed, so qualify.sh will run \`cdk deploy\` as part
  of Step 3. CDK needs these two pieces of information to synthesize a beta
  stack with SES wiring and test-mail routing:

    --domain <d>            root domain, must be a Verified SES identity in
                            this account/region (see cdk/DEPLOYMENT.md §4a)
    --plus-address <addr>   local@<d>, the single mailbox that receives all
                            qualification test-user mail

  Once $STACK has been deployed with these contexts, subsequent runs
  (--resume, --cleanup) read them from the stack's Domain and PlusAddress
  CfnOutputs and the flags become optional.

Example:
  $0 --env beta --domain example.com --plus-address you@example.com --profile <p>
EOM
      exit 1
    fi
  fi
fi

# ── Cleanup-only mode ────────────────────────────────────────────────────────
if [[ "$CLEANUP" == "true" ]]; then

  # Auto-discover state file if not given
  if [[ -z "$CLEANUP_FILE" ]]; then
    shopt -s nullglob
    MATCHES=( "$REPO_ROOT"/.qualify-state-${ENV}-*.json )
    shopt -u nullglob

    if [[ ${#MATCHES[@]} -eq 0 ]]; then
      echo "No qualification state files found. Nothing to clean up."
      exit 0
    elif [[ ${#MATCHES[@]} -gt 1 ]]; then
      echo "Multiple qualification state files found:" >&2
      for f in "${MATCHES[@]}"; do
        echo "  $(basename "$f")" >&2
      done
      echo "" >&2
      echo "Specify which one to clean up:" >&2
      echo "  $0 --cleanup <state-file>" >&2
      exit 1
    fi

    CLEANUP_FILE="${MATCHES[0]}"
    echo "Auto-discovered state file: $(basename "$CLEANUP_FILE")"
  fi

  if [[ ! -f "$CLEANUP_FILE" ]]; then
    echo "Error: state file not found: $CLEANUP_FILE" >&2
    exit 1
  fi

  STATE_REGION=$(jq -r '.region // empty' "$CLEANUP_FILE")
  [[ -n "$STATE_REGION" ]] && REGION="$STATE_REGION"

  SIT_STATE=$(jq -r '.sitStateFile // empty' "$CLEANUP_FILE")
  PENTEST_STATE=$(jq -r '.pentestStateFile // empty' "$CLEANUP_FILE")
  E2E_STATE=$(jq -r '.e2eStateFile // empty' "$CLEANUP_FILE")
  PERF_STATE=$(jq -r '.perfStateFile // empty' "$CLEANUP_FILE")

  echo ""
  echo "PassVault ${STACK_ENV_CAP} Qualification — Cleanup"
  echo "  State file  : $(basename "$CLEANUP_FILE")"
  echo "  Region      : $REGION"
  [[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
  [[ -n "$DOMAIN" ]] && echo "  Domain      : $DOMAIN"
  [[ -n "$PLUS_ADDRESS" ]] && echo "  Plus address: $PLUS_ADDRESS"
  echo ""
  # AWS credentials already verified above in the resolve-context phase.

  # SIT cleanup
  if [[ -n "$SIT_STATE" && -f "$REPO_ROOT/$SIT_STATE" ]]; then
    section "SIT cleanup"
    "$REPO_ROOT/scripts/sitest.sh" --cleanup "$REPO_ROOT/$SIT_STATE" --env "$ENV" \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: SIT cleanup failed."
  fi

  # Pentest cleanup
  if [[ -n "$PENTEST_STATE" && -f "$REPO_ROOT/$PENTEST_STATE" ]]; then
    section "Pentest cleanup"
    "$REPO_ROOT/scripts/pentest.sh" --cleanup "$REPO_ROOT/$PENTEST_STATE" --env "$ENV" \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: Pentest cleanup failed."
  fi

  # E2E cleanup
  if [[ -n "$E2E_STATE" && -f "$REPO_ROOT/$E2E_STATE" ]]; then
    section "E2E cleanup"
    "$REPO_ROOT/scripts/e2etest.sh" --cleanup "$REPO_ROOT/$E2E_STATE" --env "$ENV" \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: E2E cleanup failed."
  fi

  # Perf cleanup
  if [[ -n "$PERF_STATE" && -f "$REPO_ROOT/$PERF_STATE" ]]; then
    section "Perf cleanup"
    "$REPO_ROOT/scripts/perftest.sh" --cleanup "$REPO_ROOT/$PERF_STATE" --env "$ENV" \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: Perf cleanup failed."
  fi

  # CDK destroy
  section "CDK destroy"
  (cd "$REPO_ROOT/cdk" && npx cdk destroy "$STACK" $(cdk_ctx_args) --force \
    ${PROFILE:+--profile "$PROFILE"}) || echo "  Warning: CDK destroy failed."

  # Post-destroy
  section "Post-destroy"
  "$REPO_ROOT/scripts/post-destroy.sh" --env "$ENV" \
    ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: post-destroy failed."

  # Remove state files
  rm -f "$CLEANUP_FILE"
  [[ -n "$SIT_STATE" ]] && rm -f "$REPO_ROOT/$SIT_STATE"
  [[ -n "$PENTEST_STATE" ]] && rm -f "$REPO_ROOT/$PENTEST_STATE"
  [[ -n "$E2E_STATE" ]] && rm -f "$REPO_ROOT/$E2E_STATE"
  [[ -n "$PERF_STATE" ]] && rm -f "$REPO_ROOT/$PERF_STATE"
  echo ""
  echo "  State files removed. Cleanup complete."
  echo ""
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# Normal qualification mode
# ══════════════════════════════════════════════════════════════════════════════

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
STATE_FILE="$REPO_ROOT/.qualify-state-${ENV}-${TIMESTAMP}.json"
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PIPELINE_START=$SECONDS

# Step results — plain variables (bash 3 compatible)
STEP_STATUS_build="skip";  STEP_EXIT_build=0;   STEP_DURATION_build=0
STEP_STATUS_test="skip";   STEP_EXIT_test=0;    STEP_DURATION_test=0
STEP_STATUS_deploy="skip"; STEP_EXIT_deploy=0;  STEP_DURATION_deploy=0
STEP_STATUS_sit="skip";    STEP_EXIT_sit=0;     STEP_DURATION_sit=0
STEP_STATUS_pentest="skip"; STEP_EXIT_pentest=0; STEP_DURATION_pentest=0
STEP_STATUS_e2e="skip";    STEP_EXIT_e2e=0;     STEP_DURATION_e2e=0
STEP_STATUS_perf="skip";   STEP_EXIT_perf=0;    STEP_DURATION_perf=0

# Helpers to get/set step fields via indirection
get_step() { eval echo "\$STEP_${1}_${2}"; }
set_step() { eval "STEP_${1}_${2}=\"${3}\""; }

API_URL=""
SIT_STATE_FILE=""
PENTEST_STATE_FILE=""
E2E_STATE_FILE=""
PERF_STATE_FILE=""

# ── Step 0: Preflight ────────────────────────────────────────────────────────
section "Step 0 — Preflight"

# AWS credentials and stack existence were already resolved up front (see
# "Resolve context" phase near the top of this script). $STACK_EXISTS is set
# there. Here we only interpret that result against --resume.
echo "  AWS credentials: OK (verified up front)."

if [[ "$STACK_EXISTS" == "true" ]]; then
  if [[ "$RESUME" == "true" ]]; then
    echo "  Stack $STACK exists — resuming (skipping build/test/deploy)."
  else
    echo "  Error: Stack $STACK already exists." >&2
    echo "  Use --resume to skip build/test/deploy and run SIT/pentest/E2E/perf against it." >&2
    echo "  Use --cleanup to tear down a previous run." >&2
    exit 1
  fi
else
  if [[ "$RESUME" == "true" ]]; then
    echo "  Warning: --resume specified but no stack found. Running full pipeline."
    RESUME=false
  fi
  echo "  No existing stack — clear to deploy."
fi

echo "  State file: .qualify-state-${ENV}-${TIMESTAMP}.json"
echo ""
echo -e "${BOLD}PassVault ${STACK_ENV_CAP} Qualification${RESET}"
echo "  Environment : $ENV"
echo "  Region      : $REGION"
[[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
[[ -n "$DOMAIN" ]] && echo "  Domain      : $DOMAIN"
[[ -n "$PLUS_ADDRESS" ]] && echo "  Plus address: $PLUS_ADDRESS"
[[ "$RESUME" == "true" ]] && echo "  Mode        : resume (steps 1-3 skipped)"
echo "  Started     : $STARTED_AT"
echo ""

# Beta with real-mail routing: require explicit confirmation before proceeding.
# Dev is never prompted; --yes bypasses for CI.
if [[ "$ENV" == "beta" && -n "$PLUS_ADDRESS" && "$ASSUME_YES" != "true" ]]; then
  echo ""
  echo -e "${YELLOW}⚠  ${ENV} qualification will send real emails to ${PLUS_LOCAL}+*@${PLUS_DOMAIN}${RESET}"
  echo "   (~15 messages: one invitation per test user, plus vault-export and digest)"
  echo ""
  read -rp "   Proceed? [y/N] " _confirm
  if [[ "$_confirm" != "y" && "$_confirm" != "Y" ]]; then
    echo "  Aborted."
    exit 0
  fi
  echo ""
fi

# Export PASSVAULT_PLUS_ADDRESS into the child-script environment so test-user
# construction flows through testUserEmail() and uses the plus-addressed mailbox.
if [[ -n "$PLUS_ADDRESS" ]]; then
  export PASSVAULT_PLUS_ADDRESS="$PLUS_ADDRESS"
  echo "  Email routing: on → ${PLUS_LOCAL}+<tag>@${PLUS_DOMAIN}"
else
  echo "  Email routing: off (test users use @passvault-test.local)"
fi
echo ""

if [[ "$RESUME" == "true" ]]; then
  # Skip build, test, deploy — mark as skipped
  set_step STATUS build "skip"; set_step EXIT build "0"; set_step DURATION build "0"
  set_step STATUS test "skip";  set_step EXIT test "0";  set_step DURATION test "0"
  set_step STATUS deploy "skip"; set_step EXIT deploy "0"; set_step DURATION deploy "0"
  echo "  Steps 1-3 skipped (--resume)."
else

# ── Step 1: Build ─────────────────────────────────────────────────────────────
section "Step 1 — Build"
STEP_START=$SECONDS

echo "  Running npm ci …"
if ! (cd "$REPO_ROOT" && npm ci); then
  set_step STATUS build "fail"
  set_step EXIT build "$?"
  set_step DURATION build "$(( SECONDS - STEP_START ))"
  echo "  npm ci failed — aborting qualification."
  exit 1
fi

if (cd "$REPO_ROOT" && npm run build); then
  set_step STATUS build "pass"
  set_step EXIT build "0"
else
  set_step STATUS build "fail"
  set_step EXIT build "$?"
fi

set_step DURATION build "$(( SECONDS - STEP_START ))"
echo "  Build: $(get_step STATUS build) ($(fmt_duration $(get_step DURATION build)))"

if [[ "$(get_step STATUS build)" == "fail" ]]; then
  echo "  Build failed — aborting qualification."
  exit 1
fi

# ── Step 2: Unit tests ───────────────────────────────────────────────────────
section "Step 2 — Unit tests"
STEP_START=$SECONDS
TEST_FAILED=false

for pkg in backend frontend cdk; do
  PKG_DIR="$REPO_ROOT/$pkg"
  if [[ ! -d "$PKG_DIR" ]]; then
    echo "  Warning: $pkg/ not found, skipping."
    continue
  fi
  # Skip packages without a vitest config or test script
  if [[ ! -f "$PKG_DIR/vitest.config.ts" && ! -f "$PKG_DIR/vitest.config.js" ]]; then
    echo "  $pkg/ — no vitest config, skipping."
    continue
  fi
  echo "  Running tests in $pkg/..."
  if ! (cd "$PKG_DIR" && npx vitest run); then
    TEST_FAILED=true
    break
  fi
done

if [[ "$TEST_FAILED" == "true" ]]; then
  set_step STATUS test "fail"
  set_step EXIT test "1"
else
  set_step STATUS test "pass"
  set_step EXIT test "0"
fi

set_step DURATION test "$(( SECONDS - STEP_START ))"
echo "  Tests: $(get_step STATUS test) ($(fmt_duration $(get_step DURATION test)))"

if [[ "$(get_step STATUS test)" == "fail" ]]; then
  echo "  Unit tests failed — aborting qualification."
  exit 1
fi

# ── Step 3: CDK deploy ───────────────────────────────────────────────────────
section "Step 3 — CDK deploy"
STEP_START=$SECONDS

CDK_ARGS="$STACK $(cdk_ctx_args) --require-approval never"
[[ -n "$PROFILE" ]] && CDK_ARGS="$CDK_ARGS --profile $PROFILE"

if (cd "$REPO_ROOT/cdk" && npx cdk deploy $CDK_ARGS); then
  set_step STATUS deploy "pass"
  set_step EXIT deploy "0"
else
  set_step STATUS deploy "fail"
  set_step EXIT deploy "$?"

  set_step DURATION deploy "$(( SECONDS - STEP_START ))"
  echo "  Deploy failed — attempting destroy + cleanup."

  (cd "$REPO_ROOT/cdk" && npx cdk destroy "$STACK" $(cdk_ctx_args) --force \
    ${PROFILE:+--profile "$PROFILE"}) 2>/dev/null || true
  "$REPO_ROOT/scripts/post-destroy.sh" --env "$ENV" \
    ${PROFILE:+--profile "$PROFILE"} --region "$REGION" 2>/dev/null || true

  echo "  Aborting qualification."
  exit 1
fi

set_step DURATION deploy "$(( SECONDS - STEP_START ))"
echo "  Deploy: $(get_step STATUS deploy) ($(fmt_duration $(get_step DURATION deploy)))"

fi  # end of non-resume block (steps 1-3)

# Fetch API URL from deployed stack
API_URL=$(_cfn_output ApiUrl) || {
  echo "  Error: could not read ApiUrl from $STACK." >&2
  exit 1
}
API_URL="${API_URL%/}"
echo "  API URL: $API_URL"

# Write initial state file (stack is now deployed)
write_state() {
  local result="${1:-running}"
  local completed="${2:-}"
  cat > "$STATE_FILE" <<EOJSON
{
  "startedAt": "$STARTED_AT",
  "env": "$ENV",
  "region": "$REGION",
  "profile": "$PROFILE",
  "stack": "$STACK",
  "apiUrl": "$API_URL",
  "steps": {
    "build":   { "status": "$(get_step STATUS build)",   "exitCode": $(get_step EXIT build),   "duration": "$(fmt_duration $(get_step DURATION build))" },
    "test":    { "status": "$(get_step STATUS test)",    "exitCode": $(get_step EXIT test),    "duration": "$(fmt_duration $(get_step DURATION test))" },
    "deploy":  { "status": "$(get_step STATUS deploy)",  "exitCode": $(get_step EXIT deploy),  "duration": "$(fmt_duration $(get_step DURATION deploy))" },
    "sit":     { "status": "$(get_step STATUS sit)",     "exitCode": $(get_step EXIT sit),     "duration": "$(fmt_duration $(get_step DURATION sit))" },
    "pentest": { "status": "$(get_step STATUS pentest)", "exitCode": $(get_step EXIT pentest), "duration": "$(fmt_duration $(get_step DURATION pentest))" },
    "e2e":     { "status": "$(get_step STATUS e2e)",     "exitCode": $(get_step EXIT e2e),     "duration": "$(fmt_duration $(get_step DURATION e2e))" },
    "perf":    { "status": "$(get_step STATUS perf)",    "exitCode": $(get_step EXIT perf),    "duration": "$(fmt_duration $(get_step DURATION perf))" }
  },
  "sitStateFile": "$SIT_STATE_FILE",
  "pentestStateFile": "$PENTEST_STATE_FILE",
  "e2eStateFile": "$E2E_STATE_FILE",
  "perfStateFile": "$PERF_STATE_FILE",
  "result": "$result",
  "completedAt": "$completed"
}
EOJSON
}

write_state "running"

# ── Steps 4-7: SIT, Pentest, E2E, Perf (always run all four) ─────────────────

# Build --profile/--region args for sub-scripts
SUB_ARGS=""
[[ -n "$PROFILE" ]] && SUB_ARGS="$SUB_ARGS --profile $PROFILE"
SUB_ARGS="$SUB_ARGS --region $REGION"

# Step 4: SIT
section "Step 4 — System Integration Tests"
STEP_START=$SECONDS

if "$REPO_ROOT/scripts/sitest.sh" --env "$ENV" --keep $SUB_ARGS; then
  set_step STATUS sit "pass"
  set_step EXIT sit "0"
else
  set_step STATUS sit "fail"
  set_step EXIT sit "$?"
fi

set_step DURATION sit "$(( SECONDS - STEP_START ))"

# Discover SIT state file
shopt -s nullglob
SIT_FILES=( "$REPO_ROOT"/.sit-state-${ENV}-*.json )
shopt -u nullglob
if [[ ${#SIT_FILES[@]} -gt 0 ]]; then
  SIT_STATE_FILE="$(basename "${SIT_FILES[${#SIT_FILES[@]}-1]}")"
fi

echo "  SIT: $(get_step STATUS sit) ($(fmt_duration $(get_step DURATION sit)))"

# Step 5: Pentest
section "Step 5 — Penetration Tests"
STEP_START=$SECONDS

if "$REPO_ROOT/scripts/pentest.sh" --env "$ENV" --keep $SUB_ARGS; then
  set_step STATUS pentest "pass"
  set_step EXIT pentest "0"
else
  set_step STATUS pentest "fail"
  set_step EXIT pentest "$?"
fi

set_step DURATION pentest "$(( SECONDS - STEP_START ))"

# Discover pentest state file
shopt -s nullglob
PENTEST_FILES=( "$REPO_ROOT"/.pentest-state-${ENV}-*.json )
shopt -u nullglob
if [[ ${#PENTEST_FILES[@]} -gt 0 ]]; then
  PENTEST_STATE_FILE="$(basename "${PENTEST_FILES[${#PENTEST_FILES[@]}-1]}")"
fi

echo "  Pentest: $(get_step STATUS pentest) ($(fmt_duration $(get_step DURATION pentest)))"

# Step 6: E2E (delegates to e2etest.sh which handles admin setup, build, preview, and cleanup)
section "Step 6 — E2E Tests"
STEP_START=$SECONDS

if [[ ! -f "$REPO_ROOT/frontend/playwright.config.ts" && ! -f "$REPO_ROOT/frontend/playwright.config.js" ]]; then
  echo "  Warning: No Playwright config found — skipping E2E tests."
  set_step STATUS e2e "skip"
  set_step EXIT e2e "0"
elif ! (cd "$REPO_ROOT/frontend" && npx playwright --version &>/dev/null); then
  echo "  Warning: Playwright not installed — skipping E2E tests."
  set_step STATUS e2e "skip"
  set_step EXIT e2e "0"
else
  if "$REPO_ROOT/scripts/e2etest.sh" --env "$ENV" --keep --base-url "$API_URL" $SUB_ARGS; then
    set_step STATUS e2e "pass"
    set_step EXIT e2e "0"
  else
    set_step STATUS e2e "fail"
    set_step EXIT e2e "$?"
  fi

  # Discover E2E state file
  shopt -s nullglob
  E2E_FILES=( "$REPO_ROOT"/.e2e-state-${ENV}-*.json )
  shopt -u nullglob
  if [[ ${#E2E_FILES[@]} -gt 0 ]]; then
    E2E_STATE_FILE="$(basename "${E2E_FILES[${#E2E_FILES[@]}-1]}")"
  fi
fi

set_step DURATION e2e "$(( SECONDS - STEP_START ))"
echo "  E2E: $(get_step STATUS e2e) ($(fmt_duration $(get_step DURATION e2e)))"

# Step 7: Perf (delegates to perftest.sh which handles admin/user setup, scenarios, and cleanup)
section "Step 7 — Performance Tests"
STEP_START=$SECONDS

if [[ ! -f "$REPO_ROOT/backend/perf/vitest.config.ts" ]]; then
  echo "  Warning: No perf config found (backend/perf/vitest.config.ts) — skipping."
  set_step STATUS perf "skip"
  set_step EXIT perf "0"
else
  if "$REPO_ROOT/scripts/perftest.sh" --env "$ENV" --keep --base-url "$API_URL" $SUB_ARGS; then
    set_step STATUS perf "pass"
    set_step EXIT perf "0"
  else
    set_step STATUS perf "fail"
    set_step EXIT perf "$?"
  fi

  # Discover perf state file
  shopt -s nullglob
  PERF_FILES=( "$REPO_ROOT"/.perf-state-${ENV}-*.json )
  shopt -u nullglob
  if [[ ${#PERF_FILES[@]} -gt 0 ]]; then
    PERF_STATE_FILE="$(basename "${PERF_FILES[${#PERF_FILES[@]}-1]}")"
  fi
fi

set_step DURATION perf "$(( SECONDS - STEP_START ))"
echo "  Perf: $(get_step STATUS perf) ($(fmt_duration $(get_step DURATION perf)))"

# ── Step 8: Evaluate ─────────────────────────────────────────────────────────
section "Step 8 — Evaluate"

TOTAL_SECS=$(( SECONDS - PIPELINE_START ))
COMPLETED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ANY_FAIL=false

for step in build test deploy sit pentest e2e perf; do
  if [[ $(get_step STATUS $step) == "fail" ]]; then
    ANY_FAIL=true
    break
  fi
done

# Helper to print a step line in the banner
banner_line() {
  local label="$1"
  local step="$2"
  local status=$(get_step STATUS $step)
  local dur=$(get_step DURATION $step)

  printf "  %-8s " "$label"
  if [[ "$status" == "pass" ]]; then
    echo -e "$(pass_mark)  $(fmt_duration $dur)"
  elif [[ "$status" == "skip" ]]; then
    echo -e "$(skip_mark)  $(fmt_duration $dur)    — skip"
  else
    echo -e "$(fail_mark)  $(fmt_duration $dur)    ← FAILED"
  fi
}

if [[ "$ANY_FAIL" == "false" ]]; then
  # All pass/skip — auto-destroy
  write_state "PASS" "$COMPLETED_AT"

  section "Cleanup (all passed)"

  # SIT cleanup
  if [[ -n "$SIT_STATE_FILE" && -f "$REPO_ROOT/$SIT_STATE_FILE" ]]; then
    "$REPO_ROOT/scripts/sitest.sh" --cleanup "$REPO_ROOT/$SIT_STATE_FILE" --env "$ENV" \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: SIT cleanup failed."
  fi

  # Pentest cleanup
  if [[ -n "$PENTEST_STATE_FILE" && -f "$REPO_ROOT/$PENTEST_STATE_FILE" ]]; then
    "$REPO_ROOT/scripts/pentest.sh" --cleanup "$REPO_ROOT/$PENTEST_STATE_FILE" --env "$ENV" \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: Pentest cleanup failed."
  fi

  # E2E cleanup
  if [[ -n "$E2E_STATE_FILE" && -f "$REPO_ROOT/$E2E_STATE_FILE" ]]; then
    "$REPO_ROOT/scripts/e2etest.sh" --cleanup "$REPO_ROOT/$E2E_STATE_FILE" --env "$ENV" \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: E2E cleanup failed."
  fi

  # Perf cleanup
  if [[ -n "$PERF_STATE_FILE" && -f "$REPO_ROOT/$PERF_STATE_FILE" ]]; then
    "$REPO_ROOT/scripts/perftest.sh" --cleanup "$REPO_ROOT/$PERF_STATE_FILE" --env "$ENV" \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: Perf cleanup failed."
  fi

  # CDK destroy
  (cd "$REPO_ROOT/cdk" && npx cdk destroy "$STACK" $(cdk_ctx_args) --force \
    ${PROFILE:+--profile "$PROFILE"}) || echo "  Warning: CDK destroy failed."

  # Post-destroy
  "$REPO_ROOT/scripts/post-destroy.sh" --env "$ENV" \
    ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: post-destroy failed."

  # Remove state files
  rm -f "$STATE_FILE"
  [[ -n "$SIT_STATE_FILE" ]] && rm -f "$REPO_ROOT/$SIT_STATE_FILE"
  [[ -n "$PENTEST_STATE_FILE" ]] && rm -f "$REPO_ROOT/$PENTEST_STATE_FILE"
  [[ -n "$E2E_STATE_FILE" ]] && rm -f "$REPO_ROOT/$E2E_STATE_FILE"
  [[ -n "$PERF_STATE_FILE" ]] && rm -f "$REPO_ROOT/$PERF_STATE_FILE"

  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  PassVault ${STACK_ENV_CAP} Qualification — ${GREEN}PASS ✓${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
  banner_line "Build"   build
  banner_line "Tests"   test
  banner_line "Deploy"  deploy
  banner_line "SIT"     sit
  banner_line "Pentest" pentest
  banner_line "E2E"     e2e
  banner_line "Perf"    perf
  echo "─────────────────────────────────────────────"
  echo "  Total: $(fmt_duration $TOTAL_SECS)"
  echo "  Stack destroyed and cleaned up."
  echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
  echo ""
  exit 0

else
  # Some step(s) failed — save state, print FAIL banner
  write_state "FAIL" "$COMPLETED_AT"

  REL_STATE="${STATE_FILE#"$REPO_ROOT"/}"

  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  PassVault ${STACK_ENV_CAP} Qualification — ${RED}FAIL ✗${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
  banner_line "Build"   build
  banner_line "Tests"   test
  banner_line "Deploy"  deploy
  banner_line "SIT"     sit
  banner_line "Pentest" pentest
  banner_line "E2E"     e2e
  banner_line "Perf"    perf
  echo "─────────────────────────────────────────────"
  echo "  Stack $STACK left deployed for debugging."
  echo "  State: $REL_STATE"
  [[ -n "$SIT_STATE_FILE" ]] && echo "  SIT state: $SIT_STATE_FILE"
  [[ -n "$PENTEST_STATE_FILE" ]] && echo "  Pentest state: $PENTEST_STATE_FILE"
  [[ -n "$E2E_STATE_FILE" ]] && echo "  E2E state: $E2E_STATE_FILE"
  [[ -n "$PERF_STATE_FILE" ]] && echo "  Perf state: $PERF_STATE_FILE"
  echo ""
  echo "  To clean up after fixing:"
  echo "    ./scripts/qualify.sh --cleanup"
  echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
  echo ""
  exit 1
fi
