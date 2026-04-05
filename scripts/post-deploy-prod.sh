#!/usr/bin/env bash
# post-deploy-prod.sh — Build and deploy the PassVault frontend to prod.
# Use: ./scripts/post-deploy.sh --env prod [options]
exec "$(dirname "$0")/post-deploy.sh" --env prod "$@"
