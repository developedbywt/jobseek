#!/usr/bin/env bash
# Check the 3h rolling-window budget for feature task implementations.
# Counts actual implementation attempts (issues labeled in-progress), not workflow runs.
#
# Required env vars: GH_TOKEN, BUDGET_PER_3H, GITHUB_OUTPUT, GITHUB_REPOSITORY

set -euo pipefail

: "${BUDGET_PER_3H:?BUDGET_PER_3H is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

SINCE=$(date -u -d '3 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
  || date -u -v-3H +%Y-%m-%dT%H:%M:%SZ)

PROCESSED=$(gh api --paginate "repos/$GITHUB_REPOSITORY/issues/events" \
  --jq "[.[] | select(.event == \"labeled\" and .label.name == \"in-progress\" and .created_at >= \"$SINCE\")] | length" \
  2>/dev/null || echo 0)

REMAINING=$(( BUDGET_PER_3H - PROCESSED ))

echo "processed=$PROCESSED" >> "$GITHUB_OUTPUT"
echo "remaining=$REMAINING" >> "$GITHUB_OUTPUT"
echo "Budget: $PROCESSED/$BUDGET_PER_3H used in last 3h ($REMAINING remaining)"
