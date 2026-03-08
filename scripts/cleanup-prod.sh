#!/usr/bin/env bash
# cleanup-prod.sh — Remove prod resources left behind after `cdk destroy`.
# Wrapper around cleanup.sh --env prod.
#
# Usage:
#   ./scripts/cleanup-prod.sh [--profile <aws-profile>] [--region <region>]

exec "$(dirname "$0")/cleanup.sh" --env prod "$@"
