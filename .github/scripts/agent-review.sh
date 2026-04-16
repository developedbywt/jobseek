#!/usr/bin/env bash
set -euo pipefail

source .github/scripts/agent-lib.sh

require_env REPO
require_env PR_NUMBER
require_cmd gh
require_cmd claude

ISSUE_NUMBER="$(linked_issue_from_pr "$PR_NUMBER")"
[ -n "$ISSUE_NUMBER" ] || {
  echo "::error::Unable to resolve linked issue from PR body" >&2
  exit 1
}

RUN_DIR="$(ensure_run_dir "$ISSUE_NUMBER")"
REVIEW_FILE="$RUN_DIR/Review.md"

gh pr view "$PR_NUMBER" --repo "$REPO" --json number,title,body,files > "$RUN_DIR/pr.json"
gh pr diff "$PR_NUMBER" --repo "$REPO" > "$RUN_DIR/diff.patch"

write_status "review" "running" "Running bounded review"
claude -p "Review the diff in ai/runs/$ISSUE_NUMBER/diff.patch for bugs, regressions, missing verification, and overreach. Return concise markdown." > "$REVIEW_FILE"
post_pr_comment "$PR_NUMBER" "$REVIEW_FILE"

if grep -qi "no findings" "$REVIEW_FILE"; then
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --remove-label "agent:build" --remove-label "agent:blocked" --add-label "agent:done"
  write_status "review" "completed" "Review passed"
else
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --remove-label "agent:done" --add-label "agent:blocked"
  write_status "review" "blocked" "Review found issues"
fi
