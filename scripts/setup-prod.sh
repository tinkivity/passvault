#!/usr/bin/env bash
# setup-prod.sh — Build and deploy the PassVault frontend to prod.
# Use: ./scripts/setup.sh --env prod [options]
exec "$(dirname "$0")/setup.sh" --env prod "$@"
