#!/usr/bin/env bash
# setup-dev.sh — Start the PassVault frontend dev server against a deployed dev stack.
# Use: ./scripts/setup.sh --env dev [options]
exec "$(dirname "$0")/setup.sh" --env dev "$@"
