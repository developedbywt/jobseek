#!/usr/bin/env bash
# Select the oldest open feature-task issue labeled "implement-me".
# Posts a claim comment to prevent concurrent agents from picking the same issue.
# Detects and recovers stale "in-progress" issues (claim > 2h, no open PR).
#
# Required env vars: GH_TOKEN, REPO, GITHUB_OUTPUT
# Optional env vars: STALE_HOURS (default 2), MAX_ATTEMPTS (default 3)

set -euo pipefail

: "${REPO:?REPO is required}"
STALE_HOURS="${STALE_HOURS:-2}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"

# --- Stale in-progress recovery ---
echo "=== Checking for stale in-progress issues ==="
IN_PROGRESS=$(gh issue list --repo "$REPO" \
  --label "in-progress" --label "feature-task" --state open \
  --json number --jq '.[].number' | sort -n)

for ISSUE_NUM in $IN_PROGRESS; do
  # Check for existing claim comment
  CLAIM_INFO=$(gh api "repos/$REPO/issues/$ISSUE_NUM/comments" \
    --jq '[.[] | select(.body | startswith("<!-- feat-claim -->")) | {id: .id, created_at: .created_at}] | first // empty' 2>/dev/null || echo "")

  if [ -z "$CLAIM_INFO" ]; then
    echo "Issue #$ISSUE_NUM: in-progress but no claim comment — skipping."
    continue
  fi

  CLAIM_DATE=$(echo "$CLAIM_INFO" | jq -r '.created_at')
  CLAIM_TS=$(date -d "$CLAIM_DATE" +%s 2>/dev/null \
    || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$CLAIM_DATE" +%s 2>/dev/null)
  NOW_TS=$(date +%s)
  CLAIM_AGE_HOURS=$(( (NOW_TS - CLAIM_TS) / 3600 ))

  if [ "$CLAIM_AGE_HOURS" -lt "$STALE_HOURS" ]; then
    echo "Issue #$ISSUE_NUM: claim is ${CLAIM_AGE_HOURS}h old — still active, skipping."
    continue
  fi

  # Check if an open PR exists for this issue
  OPEN_PR=$(gh pr list --repo "$REPO" --state open \
    --search "Closes #$ISSUE_NUM" --json number --jq '.[0].number // empty')

  if [ -n "$OPEN_PR" ]; then
    echo "Issue #$ISSUE_NUM: stale claim but PR #$OPEN_PR is open — not resetting."
    continue
  fi

  echo "Issue #$ISSUE_NUM: stale (${CLAIM_AGE_HOURS}h, no PR) — resetting to implement-me."
  gh issue edit "$ISSUE_NUM" --repo "$REPO" \
    --remove-label "in-progress" --add-label "implement-me" 2>/dev/null || true
  gh issue comment "$ISSUE_NUM" --repo "$REPO" \
    --body "<!-- feat-stale-reset -->
:warning: **Implementation timed out**

This task was picked up ${CLAIM_AGE_HOURS}h ago but no PR was opened. It has been reset to \`implement-me\` and will be retried on the next cron tick." 2>/dev/null || true
done

# --- Select next issue ---
echo "=== Selecting next implement-me issue ==="
ISSUES=$(gh issue list --repo "$REPO" \
  --label "implement-me" --label "feature-task" --state open \
  --json number --jq '.[].number' | sort -n)

if [ -z "$ISSUES" ]; then
  echo "No open feature-task issues labeled implement-me."
  echo "selected=" >> "$GITHUB_OUTPUT"
  exit 0
fi

SELECTED=""
for ISSUE_NUM in $ISSUES; do
  echo "--- Checking issue #$ISSUE_NUM ---"

  # Skip if already claimed by a concurrent agent (fresh claim)
  CLAIM_INFO=$(gh api "repos/$REPO/issues/$ISSUE_NUM/comments" \
    --jq '[.[] | select(.body | startswith("<!-- feat-claim -->")) | {created_at: .created_at}] | first // empty' 2>/dev/null || echo "")

  if [ -n "$CLAIM_INFO" ]; then
    CLAIM_DATE=$(echo "$CLAIM_INFO" | jq -r '.created_at')
    CLAIM_TS=$(date -d "$CLAIM_DATE" +%s 2>/dev/null \
      || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$CLAIM_DATE" +%s 2>/dev/null)
    NOW_TS=$(date +%s)
    CLAIM_AGE_HOURS=$(( (NOW_TS - CLAIM_TS) / 3600 ))

    if [ "$CLAIM_AGE_HOURS" -lt "$STALE_HOURS" ]; then
      echo "Issue #$ISSUE_NUM claimed ${CLAIM_AGE_HOURS}h ago — skipping."
      continue
    fi
  fi

  # Skip if this issue has exhausted its auto-implementation attempts
  FAIL_COUNT=$(gh api "repos/$REPO/issues/$ISSUE_NUM/comments" \
    --jq '[.[] | select(.body | startswith("<!-- feat-failed -->") or startswith("<!-- feat-stale-reset -->"))] | length' \
    2>/dev/null || echo 0)

  if [ "$FAIL_COUNT" -ge "$MAX_ATTEMPTS" ]; then
    echo "Issue #$ISSUE_NUM has failed $FAIL_COUNT time(s) — escalating to needs-human."
    gh issue edit "$ISSUE_NUM" --repo "$REPO" \
      --remove-label "implement-me" --add-label "needs-human" 2>/dev/null || true
    gh issue comment "$ISSUE_NUM" --repo "$REPO" \
      --body "<!-- feat-exhausted -->
:stop_sign: **Max attempts reached** ($FAIL_COUNT failures). Removed from auto-implementation queue. Please review and fix the task spec manually, then re-add the \`implement-me\` label to retry." 2>/dev/null || true
    continue
  fi

  echo "Selecting issue #$ISSUE_NUM (fail count: $FAIL_COUNT)."
  SELECTED="$ISSUE_NUM"
  break
done

if [ -n "$SELECTED" ]; then
  gh issue comment "$SELECTED" --repo "$REPO" \
    --body "<!-- feat-claim -->
:robot: Picked up by feature implementation workflow. Working on it..." 2>/dev/null || true
  gh issue edit "$SELECTED" --repo "$REPO" \
    --remove-label "implement-me" --add-label "in-progress" 2>/dev/null || true
fi

echo "selected=$SELECTED" >> "$GITHUB_OUTPUT"
