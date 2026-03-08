#!/usr/bin/env bash
# cleanup-beta.sh — Remove beta resources left behind after `cdk destroy`.
# Wrapper around cleanup.sh --env beta.
#
# Usage:
#   ./scripts/cleanup-beta.sh [--profile <aws-profile>] [--region <region>]

exec "$(dirname "$0")/cleanup.sh" --env beta "$@"
