#!/usr/bin/env bash
# post-destroy-prod.sh — Remove prod resources left behind after `cdk destroy`.
# Wrapper around post-destroy.sh --env prod.
#
# Usage:
#   ./scripts/post-destroy-prod.sh [--profile <aws-profile>] [--region <region>]

exec "$(dirname "$0")/post-destroy.sh" --env prod "$@"
