#!/usr/bin/env bash
# qualify.sh — Full qualification pipeline for PassVault dev environment.
#
# Usage:
#   ./scripts/qualify.sh [--profile <name>] [--region <region>]
#   ./scripts/qualify.sh --resume [--profile <name>] [--region <region>]
#   ./scripts/qualify.sh --cleanup [state-file] [--profile <name>] [--region <region>]
#
# Options:
#   --profile <name>       AWS named profile
#   --region <region>      AWS region (default: eu-central-1)
#   --resume               Skip build/test/deploy; run SIT/pentest/E2E/perf against existing stack
#   --cleanup [state-file] Skip tests; only tear down a previous qualification run.
#                          If no file given, auto-discovers .qualify-state-dev-*.json.
#   -h, --help             Show usage
#
# Hardcoded to dev environment. Runs: build → unit tests → cdk deploy →
# SIT → pentest → E2E → perf → evaluate → cleanup/report.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV="dev"
STACK="PassVault-Dev"
PROFILE=""
REGION="eu-central-1"
CLEANUP=false
CLEANUP_FILE=""
RESUME=false
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

USAGE="Usage: $0 [--profile <name>] [--region <region>] [--resume]
       $0 --cleanup [state-file] [--profile <name>] [--region <region>]"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)  PROFILE="$2";      shift 2 ;;
    --region)   REGION="$2";       shift 2 ;;
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

# ── Cleanup-only mode ────────────────────────────────────────────────────────
if [[ "$CLEANUP" == "true" ]]; then

  # Auto-discover state file if not given
  if [[ -z "$CLEANUP_FILE" ]]; then
    shopt -s nullglob
    MATCHES=( "$REPO_ROOT"/.qualify-state-dev-*.json )
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
  echo "PassVault Dev Qualification — Cleanup"
  echo "  State file  : $(basename "$CLEANUP_FILE")"
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

  # SIT cleanup
  if [[ -n "$SIT_STATE" && -f "$REPO_ROOT/$SIT_STATE" ]]; then
    section "SIT cleanup"
    "$REPO_ROOT/scripts/sitest.sh" --cleanup "$REPO_ROOT/$SIT_STATE" --env dev \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: SIT cleanup failed."
  fi

  # Pentest cleanup
  if [[ -n "$PENTEST_STATE" && -f "$REPO_ROOT/$PENTEST_STATE" ]]; then
    section "Pentest cleanup"
    "$REPO_ROOT/scripts/pentest.sh" --cleanup "$REPO_ROOT/$PENTEST_STATE" --env dev \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: Pentest cleanup failed."
  fi

  # E2E cleanup
  if [[ -n "$E2E_STATE" && -f "$REPO_ROOT/$E2E_STATE" ]]; then
    section "E2E cleanup"
    "$REPO_ROOT/scripts/e2etest.sh" --cleanup "$REPO_ROOT/$E2E_STATE" --env dev \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: E2E cleanup failed."
  fi

  # Perf cleanup
  if [[ -n "$PERF_STATE" && -f "$REPO_ROOT/$PERF_STATE" ]]; then
    section "Perf cleanup"
    "$REPO_ROOT/scripts/perftest.sh" --cleanup "$REPO_ROOT/$PERF_STATE" --env dev \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: Perf cleanup failed."
  fi

  # CDK destroy
  section "CDK destroy"
  (cd "$REPO_ROOT/cdk" && npx cdk destroy "$STACK" --context env=dev --force \
    ${PROFILE:+--profile "$PROFILE"}) || echo "  Warning: CDK destroy failed."

  # Post-destroy
  section "Post-destroy"
  "$REPO_ROOT/scripts/post-destroy.sh" --env dev \
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
STATE_FILE="$REPO_ROOT/.qualify-state-dev-${TIMESTAMP}.json"
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

echo "  Checking AWS access..."
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

STACK_EXISTS=false
echo "  Checking for existing $STACK stack..."
if aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" &>/dev/null; then
  STACK_EXISTS=true
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

echo "  State file: .qualify-state-dev-${TIMESTAMP}.json"
echo ""
echo -e "${BOLD}PassVault Dev Qualification${RESET}"
echo "  Environment : $ENV"
echo "  Region      : $REGION"
[[ -n "$PROFILE" ]] && echo "  AWS profile : $PROFILE"
[[ "$RESUME" == "true" ]] && echo "  Mode        : resume (steps 1-3 skipped)"
echo "  Started     : $STARTED_AT"
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

CDK_ARGS="$STACK --context env=dev --context adminEmail=qualify@passvault-test.local --require-approval never"
[[ -n "$PROFILE" ]] && CDK_ARGS="$CDK_ARGS --profile $PROFILE"

if (cd "$REPO_ROOT/cdk" && npx cdk deploy $CDK_ARGS); then
  set_step STATUS deploy "pass"
  set_step EXIT deploy "0"
else
  set_step STATUS deploy "fail"
  set_step EXIT deploy "$?"

  set_step DURATION deploy "$(( SECONDS - STEP_START ))"
  echo "  Deploy failed — attempting destroy + cleanup."

  (cd "$REPO_ROOT/cdk" && npx cdk destroy "$STACK" --context env=dev --force \
    ${PROFILE:+--profile "$PROFILE"}) 2>/dev/null || true
  "$REPO_ROOT/scripts/post-destroy.sh" --env dev \
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

if "$REPO_ROOT/scripts/sitest.sh" --env dev --keep $SUB_ARGS; then
  set_step STATUS sit "pass"
  set_step EXIT sit "0"
else
  set_step STATUS sit "fail"
  set_step EXIT sit "$?"
fi

set_step DURATION sit "$(( SECONDS - STEP_START ))"

# Discover SIT state file
shopt -s nullglob
SIT_FILES=( "$REPO_ROOT"/.sit-state-dev-*.json )
shopt -u nullglob
if [[ ${#SIT_FILES[@]} -gt 0 ]]; then
  SIT_STATE_FILE="$(basename "${SIT_FILES[${#SIT_FILES[@]}-1]}")"
fi

echo "  SIT: $(get_step STATUS sit) ($(fmt_duration $(get_step DURATION sit)))"

# Step 5: Pentest
section "Step 5 — Penetration Tests"
STEP_START=$SECONDS

if "$REPO_ROOT/scripts/pentest.sh" --env dev --keep $SUB_ARGS; then
  set_step STATUS pentest "pass"
  set_step EXIT pentest "0"
else
  set_step STATUS pentest "fail"
  set_step EXIT pentest "$?"
fi

set_step DURATION pentest "$(( SECONDS - STEP_START ))"

# Discover pentest state file
shopt -s nullglob
PENTEST_FILES=( "$REPO_ROOT"/.pentest-state-dev-*.json )
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
  if "$REPO_ROOT/scripts/e2etest.sh" --env dev --keep --base-url "$API_URL" $SUB_ARGS; then
    set_step STATUS e2e "pass"
    set_step EXIT e2e "0"
  else
    set_step STATUS e2e "fail"
    set_step EXIT e2e "$?"
  fi

  # Discover E2E state file
  shopt -s nullglob
  E2E_FILES=( "$REPO_ROOT"/.e2e-state-dev-*.json )
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
  if "$REPO_ROOT/scripts/perftest.sh" --env dev --keep --base-url "$API_URL" $SUB_ARGS; then
    set_step STATUS perf "pass"
    set_step EXIT perf "0"
  else
    set_step STATUS perf "fail"
    set_step EXIT perf "$?"
  fi

  # Discover perf state file
  shopt -s nullglob
  PERF_FILES=( "$REPO_ROOT"/.perf-state-dev-*.json )
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
    "$REPO_ROOT/scripts/sitest.sh" --cleanup "$REPO_ROOT/$SIT_STATE_FILE" --env dev \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: SIT cleanup failed."
  fi

  # Pentest cleanup
  if [[ -n "$PENTEST_STATE_FILE" && -f "$REPO_ROOT/$PENTEST_STATE_FILE" ]]; then
    "$REPO_ROOT/scripts/pentest.sh" --cleanup "$REPO_ROOT/$PENTEST_STATE_FILE" --env dev \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: Pentest cleanup failed."
  fi

  # E2E cleanup
  if [[ -n "$E2E_STATE_FILE" && -f "$REPO_ROOT/$E2E_STATE_FILE" ]]; then
    "$REPO_ROOT/scripts/e2etest.sh" --cleanup "$REPO_ROOT/$E2E_STATE_FILE" --env dev \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: E2E cleanup failed."
  fi

  # Perf cleanup
  if [[ -n "$PERF_STATE_FILE" && -f "$REPO_ROOT/$PERF_STATE_FILE" ]]; then
    "$REPO_ROOT/scripts/perftest.sh" --cleanup "$REPO_ROOT/$PERF_STATE_FILE" --env dev \
      ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: Perf cleanup failed."
  fi

  # CDK destroy
  (cd "$REPO_ROOT/cdk" && npx cdk destroy "$STACK" --context env=dev --force \
    ${PROFILE:+--profile "$PROFILE"}) || echo "  Warning: CDK destroy failed."

  # Post-destroy
  "$REPO_ROOT/scripts/post-destroy.sh" --env dev \
    ${PROFILE:+--profile "$PROFILE"} --region "$REGION" || echo "  Warning: post-destroy failed."

  # Remove state files
  rm -f "$STATE_FILE"
  [[ -n "$SIT_STATE_FILE" ]] && rm -f "$REPO_ROOT/$SIT_STATE_FILE"
  [[ -n "$PENTEST_STATE_FILE" ]] && rm -f "$REPO_ROOT/$PENTEST_STATE_FILE"
  [[ -n "$E2E_STATE_FILE" ]] && rm -f "$REPO_ROOT/$E2E_STATE_FILE"
  [[ -n "$PERF_STATE_FILE" ]] && rm -f "$REPO_ROOT/$PERF_STATE_FILE"

  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  PassVault Dev Qualification — ${GREEN}PASS ✓${RESET}"
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
  echo -e "${BOLD}  PassVault Dev Qualification — ${RED}FAIL ✗${RESET}"
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
