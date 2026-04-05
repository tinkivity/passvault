#!/usr/bin/env bash
# post-destroy-beta.sh — Remove beta resources left behind after `cdk destroy`.
# Wrapper around post-destroy.sh --env beta.
#
# Usage:
#   ./scripts/post-destroy-beta.sh [--profile <aws-profile>] [--region <region>]

exec "$(dirname "$0")/post-destroy.sh" --env beta "$@"
