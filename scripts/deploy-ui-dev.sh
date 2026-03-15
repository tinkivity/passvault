#!/usr/bin/env bash
# deploy-ui-dev.sh — Start the PassVault frontend dev server against a deployed dev stack.
# Use: ./scripts/deploy-ui.sh --env dev [options]
exec "$(dirname "$0")/deploy-ui.sh" --env dev "$@"
