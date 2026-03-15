#!/usr/bin/env bash
# deploy-ui-prod.sh — Build and deploy the PassVault frontend to prod.
# Use: ./scripts/deploy-ui.sh --env prod [options]
exec "$(dirname "$0")/deploy-ui.sh" --env prod "$@"
