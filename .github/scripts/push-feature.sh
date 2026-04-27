#!/usr/bin/env bash
# Push a brainstormed feature to GitHub Issues.
# Usage: .github/scripts/push-feature.sh "Feature Name" <spec.md> <plan.md>
#
# Creates:
#   - 1 parent issue (feature-parent label) containing the full spec
#   - 1 child issue per task in the plan (feature-task label)
#   - Updates parent checklist with child issue numbers

set -euo pipefail

FEATURE_NAME="${1:?Usage: push-feature.sh <name> <spec.md> <plan.md>}"
SPEC_FILE="${2:?spec file required}"
PLAN_FILE="${3:?plan file required}"

# Default to upstream remote (org repo where issues are tracked).
# If you get a permission error, run: gh auth refresh -s repo
REPO="${REPO:-$(git remote get-url upstream 2>/dev/null | sed 's|https://github.com/||;s|\.git$||' || git remote get-url origin | sed 's|https://github.com/||;s|\.git$||')}"

[[ -f "$SPEC_FILE" ]] || { echo "Spec file not found: $SPEC_FILE"; exit 1; }
[[ -f "$PLAN_FILE" ]] || { echo "Plan file not found: $PLAN_FILE"; exit 1; }

SPEC_BODY=$(cat "$SPEC_FILE")

# Extract task titles from plan: lines matching "### Task N: Title"
TASKS=$(grep -E '^### Task [0-9]+:' "$PLAN_FILE" | sed 's/^### Task [0-9]*: //')

if [ -z "$TASKS" ]; then
  echo "No tasks found in plan file (expected '### Task N: Title' lines)"
  exit 1
fi

TASK_COUNT=$(echo "$TASKS" | wc -l | tr -d ' ')
echo "Found $TASK_COUNT tasks in plan."

# Build empty checklist placeholder for parent body
CHECKLIST_PLACEHOLDER=""
i=1
while IFS= read -r task; do
  CHECKLIST_PLACEHOLDER+="- [ ] Task $i — $task (issue # TBD)
"
  i=$((i + 1))
done <<< "$TASKS"

PARENT_BODY="## Spec

$SPEC_BODY

## Tasks

$CHECKLIST_PLACEHOLDER"

# Create parent issue
echo "Creating parent issue: feat: $FEATURE_NAME"
PARENT_URL=$(gh issue create \
  --repo "$REPO" \
  --title "feat: $FEATURE_NAME" \
  --body "$PARENT_BODY")
PARENT_NUM=$(echo "$PARENT_URL" | grep -oE '[0-9]+$')
echo "Parent issue: #$PARENT_NUM"
gh issue edit "$PARENT_NUM" --repo "$REPO" --add-label "feature-parent" 2>/dev/null \
  || echo "  (note: apply 'feature-parent' label manually if not auto-applied)"

# Create child issues and collect numbers
CHILD_NUMS=()
i=1
while IFS= read -r task; do
  CHILD_BODY="Parent: #$PARENT_NUM

## Task

$task

## Context

See parent issue #$PARENT_NUM for the full spec."

  echo "Creating child issue: Task $i — $task"
  CHILD_URL=$(gh issue create \
    --repo "$REPO" \
    --title "[$FEATURE_NAME] Task $i — $task" \
    --body "$CHILD_BODY")
  CHILD_NUM=$(echo "$CHILD_URL" | grep -oE '[0-9]+$')
  gh issue edit "$CHILD_NUM" --repo "$REPO" --add-label "feature-task" 2>/dev/null \
    || echo "  (note: apply 'feature-task' label manually if not auto-applied)"
  echo "  → #$CHILD_NUM"
  CHILD_NUMS+=("$CHILD_NUM")
  i=$((i + 1))
done <<< "$TASKS"

# Update parent checklist with real child issue numbers
NEW_CHECKLIST=""
i=0
while IFS= read -r task; do
  CHILD_NUM="${CHILD_NUMS[$i]}"
  NEW_CHECKLIST+="- [ ] #$CHILD_NUM $task
"
  i=$((i + 1))
done <<< "$TASKS"

NEW_PARENT_BODY="## Spec

$SPEC_BODY

## Tasks

$NEW_CHECKLIST"

gh api --method PATCH "repos/$REPO/issues/$PARENT_NUM" \
  -f body="$NEW_PARENT_BODY" > /dev/null

echo ""
echo "Done! Feature pushed to GitHub:"
echo "  Parent: https://github.com/$REPO/issues/$PARENT_NUM"
for num in "${CHILD_NUMS[@]}"; do
  echo "  Task:   https://github.com/$REPO/issues/$num"
done
echo ""
echo "To start implementation, apply the 'implement-me' label to any child issue."
