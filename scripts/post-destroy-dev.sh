#!/usr/bin/env bash
# post-destroy-dev.sh — Remove dev resources left behind after `cdk destroy`.
# Wrapper around post-destroy.sh --env dev.
#
# Usage:
#   ./scripts/post-destroy-dev.sh [--profile <aws-profile>] [--region <region>]

exec "$(dirname "$0")/post-destroy.sh" --env dev "$@"
