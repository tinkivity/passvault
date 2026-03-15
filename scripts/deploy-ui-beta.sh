#!/usr/bin/env bash
# deploy-ui-beta.sh — Build and deploy the PassVault frontend to beta.
# Use: ./scripts/deploy-ui.sh --env beta [options]
exec "$(dirname "$0")/deploy-ui.sh" --env beta "$@"
