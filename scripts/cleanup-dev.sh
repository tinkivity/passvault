#!/usr/bin/env bash
# cleanup-dev.sh — Remove dev resources left behind after `cdk destroy`.
# Wrapper around cleanup.sh --env dev.
#
# Usage:
#   ./scripts/cleanup-dev.sh [--profile <aws-profile>] [--region <region>]

exec "$(dirname "$0")/cleanup.sh" --env dev "$@"
