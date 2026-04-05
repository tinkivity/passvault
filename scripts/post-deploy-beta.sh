#!/usr/bin/env bash
# post-deploy-beta.sh — Build and deploy the PassVault frontend to beta.
# Use: ./scripts/post-deploy.sh --env beta [options]
exec "$(dirname "$0")/post-deploy.sh" --env beta "$@"
