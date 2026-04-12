#!/usr/bin/env bash
# Shell counterpart to backend/sit/lib/test-emails.ts.
#
# Usage:
#   source "$REPO_ROOT/scripts/lib/test-emails.sh"
#   MY_EMAIL=$(make_test_email "sit-pro-$(date +%s)")
#
# When PASSVAULT_PLUS_ADDRESS is set to a valid local@domain email,
# returns local+<tag>@domain. Otherwise falls back to <tag>@passvault-test.local.

make_test_email() {
  local tag="$1"
  local plus="${PASSVAULT_PLUS_ADDRESS:-}"
  if [[ -n "$plus" && "$plus" =~ ^[^@[:space:]]+@[^@[:space:]]+$ ]]; then
    echo "${plus%@*}+${tag}@${plus#*@}"
  else
    echo "${tag}@passvault-test.local"
  fi
}
