#!/usr/bin/env bash
set -euo pipefail

source .github/scripts/agent-lib.sh

require_env REPO
require_env ISSUE_NUMBER
require_cmd gh
require_cmd jq
require_cmd codex
require_cmd git

RUN_DIR="$(ensure_run_dir "$ISSUE_NUMBER")"
PLAN_FILE="$RUN_DIR/Plan.json"
BUILD_FILE="$RUN_DIR/Build.md"
COMMENT_FILE="$RUN_DIR/build-comment.md"

issue_json > "$RUN_DIR/issue.json"

test -f "$PLAN_FILE" || {
  echo "::error::Missing plan file: $PLAN_FILE" >&2
  exit 1
}

has_label "agent:build-ready" || {
  echo "::error::Issue must carry agent:build-ready before build" >&2
  exit 1
}

SLUG="$(jq -r '.title // "task"' "$RUN_DIR/issue.json" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')"
BRANCH="agent/${ISSUE_NUMBER}-${SLUG}"

git checkout -B "$BRANCH"
write_status "build" "running" "Executing approved plan with Codex"

EXECUTION_BRIEF="$(jq -r '.execution_brief // .summary // "Implement the approved plan."' "$PLAN_FILE")"
codex exec "$EXECUTION_BRIEF"

VERIFY_CMDS="$(jq -r '.verification[]?' "$PLAN_FILE")"
if [ -z "$VERIFY_CMDS" ]; then
  echo "::error::Plan.json must provide at least one verification command" >&2
  exit 1
fi

printf '# Build\n\n' > "$BUILD_FILE"
while IFS= read -r cmd; do
  [ -n "$cmd" ] || continue
  printf -- '- `%s`\n' "$cmd" >> "$BUILD_FILE"
  bash -lc "$cmd"
done <<EOF
$VERIFY_CMDS
EOF

if [ -n "$(git status --short)" ]; then
  git add -A
  git commit -m "feat: implement issue #$ISSUE_NUMBER plan"
  git push -u origin "$BRANCH"
fi

PR_URL="$(
  gh pr view "$BRANCH" --repo "$REPO" --json url 2>/dev/null | jq -r '.url // empty' || true
)"
if [ -z "$PR_URL" ]; then
  PR_URL="$(gh pr create --repo "$REPO" --title "Agent build: issue #$ISSUE_NUMBER" --body "Closes #$ISSUE_NUMBER" --head "$BRANCH" --base main)"
fi

printf 'Build complete.\n\nPR: %s\n\nReview the PR on GitHub, then add the `agent:review` label to the PR when you want the bounded review pass to run.\n' "$PR_URL" > "$COMMENT_FILE"
post_issue_comment "$COMMENT_FILE"
gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --remove-label "agent:build" --remove-label "agent:build-ready"
write_status "build" "completed" "Build completed and PR created or updated"
