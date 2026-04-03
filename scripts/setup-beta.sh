#!/usr/bin/env bash
# setup-beta.sh — Build and deploy the PassVault frontend to beta.
# Use: ./scripts/setup.sh --env beta [options]
exec "$(dirname "$0")/setup.sh" --env beta "$@"
