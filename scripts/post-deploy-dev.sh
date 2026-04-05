#!/usr/bin/env bash
# post-deploy-dev.sh — Start the PassVault frontend dev server against a deployed dev stack.
# Use: ./scripts/post-deploy.sh --env dev [options]
exec "$(dirname "$0")/post-deploy.sh" --env dev "$@"
