#!/usr/bin/env bash
# Check the 3h rolling-window budget for feature task implementations.
#
# Required env vars: GH_TOKEN, BUDGET_PER_3H, GITHUB_OUTPUT

set -euo pipefail

: "${BUDGET_PER_3H:?BUDGET_PER_3H is required}"

SINCE=$(date -u -d '3 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
  || date -u -v-3H +%Y-%m-%dT%H:%M:%SZ)

PROCESSED=$(gh run list \
  --workflow implement-feature.yml \
  --status success \
  --created ">$SINCE" \
  --json conclusion -q 'length')

REMAINING=$(( BUDGET_PER_3H - PROCESSED ))

echo "processed=$PROCESSED" >> "$GITHUB_OUTPUT"
echo "remaining=$REMAINING" >> "$GITHUB_OUTPUT"
echo "Budget: $PROCESSED/$BUDGET_PER_3H used in last 3h ($REMAINING remaining)"
