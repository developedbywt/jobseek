#!/usr/bin/env bash
set -euo pipefail

source .github/scripts/agent-lib.sh

require_env REPO
require_env ISSUE_NUMBER
require_cmd gh
require_cmd jq
require_cmd claude

RUN_DIR="$(ensure_run_dir "$ISSUE_NUMBER")"
GOAL_FILE="$RUN_DIR/Goal.md"
SPEC_FILE="$RUN_DIR/Spec.md"
PLAN_FILE="$RUN_DIR/Plan.json"
COMMENT_FILE="$RUN_DIR/plan-comment.md"
PROMPT_FILE="$RUN_DIR/plan-prompt.md"

issue_json > "$RUN_DIR/issue.json"

jq -r '"# Goal\n\n## Issue #\(.number): \(.title)\n\n\(.body)\n"' "$RUN_DIR/issue.json" > "$GOAL_FILE"

cat > "$PROMPT_FILE" <<'EOF'
Read the goal and return JSON with exactly these top-level keys:
- `spec_markdown`: markdown design/spec text
- `plan_json`: object with `summary`, `execution_brief`, and `verification` array
- `summary_markdown`: short issue comment summary
EOF
cat "$GOAL_FILE" >> "$PROMPT_FILE"

write_status "plan" "running" "Generating plan artifacts with Claude"
claude -p "$(cat "$PROMPT_FILE")" --output-format json > "$RUN_DIR/claude-plan.json"

jq -r '.spec_markdown // .result.spec_markdown' "$RUN_DIR/claude-plan.json" > "$SPEC_FILE"
jq '.plan_json // .result.plan_json' "$RUN_DIR/claude-plan.json" > "$PLAN_FILE"
jq -r '.summary_markdown // .result.summary_markdown // "Plan generated."' "$RUN_DIR/claude-plan.json" > "$COMMENT_FILE"

cat >> "$COMMENT_FILE" <<EOF

- Spec: \`ai/runs/$ISSUE_NUMBER/Spec.md\`
- Plan: \`ai/runs/$ISSUE_NUMBER/Plan.json\`
- Next step: review the plan, then add the \`agent:build\` label to execute it.
EOF

post_issue_comment "$COMMENT_FILE"
replace_label "agent:plan" "agent:build-ready"
write_status "plan" "completed" "Plan artifacts generated"
