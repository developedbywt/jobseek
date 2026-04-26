# GitHub Feature Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up a local-brainstorm → GitHub Issues → cron-based Claude Code implementation pipeline for feature work.

**Architecture:** A local shell script pushes spec+plan files to GitHub as a parent tracking issue + child task issues. A cron Action (every 30 min) picks the oldest `implement-me` task, enforces a 3-task/3-hour budget, runs Claude Code to implement the task and open a PR, then a second Action handles cleanup on merge (labels + parent checklist update).

**Tech Stack:** GitHub Actions, `gh` CLI, bash, `claude` CLI (`@anthropic-ai/claude-code`), `CLAUDE_CODE_OAUTH_TOKEN` secret (already configured).

**Spec:** `docs/superpowers/specs/2026-04-26-github-feature-tracking-design.md`

---

### Task 1: Create GitHub Labels

**Files:**
- Create: `.github/scripts/setup-feature-labels.sh`

- [ ] **Step 1: Write the label setup script**

```bash
#!/usr/bin/env bash
# One-time script to create labels for feature tracking.
# Usage: GH_TOKEN=<token> REPO=<owner/repo> .github/scripts/setup-feature-labels.sh

set -euo pipefail

: "${REPO:?REPO is required}"

create_label() {
  local name="$1" color="$2" description="$3"
  gh label create "$name" \
    --repo "$REPO" \
    --color "$color" \
    --description "$description" \
    --force 2>/dev/null && echo "Created: $name" || echo "Skipped: $name"
}

create_label "feature-parent"   "0075ca" "Tracking issue; not implemented directly"
create_label "feature-task"     "e4e669" "A task ready to be worked"
create_label "implement-me"     "d93f0b" "Trigger: Claude Code will pick this up"
create_label "in-progress"      "fbca04" "Implementation running in CI"
create_label "awaiting-review"  "0e8a16" "PR opened, waiting for merge"
create_label "done"             "cfd3d7" "Merged, checked off in parent"
```

Save to `.github/scripts/setup-feature-labels.sh`.

- [ ] **Step 2: Make executable and run it**

```bash
chmod +x .github/scripts/setup-feature-labels.sh
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner) \
  .github/scripts/setup-feature-labels.sh
```

Expected output: 6 lines each starting with `Created:` (or `Skipped:` if label already exists).

- [ ] **Step 3: Commit**

```bash
git add .github/scripts/setup-feature-labels.sh
git commit -m "feat(feature-tracking): add label setup script"
```

---

### Task 2: Local Push Script

**Files:**
- Create: `.github/scripts/push-feature.sh`

The script reads tasks from the plan file by matching `### Task N:` header lines (the format written-plans skill produces), creates a parent issue with the full spec, then creates one child issue per task and back-fills the parent checklist with child issue numbers.

- [ ] **Step 1: Write the push script**

```bash
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
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

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
PARENT_NUM=$(gh issue create \
  --repo "$REPO" \
  --title "feat: $FEATURE_NAME" \
  --label "feature-parent" \
  --body "$PARENT_BODY" \
  --json number -q .number)
echo "Parent issue: #$PARENT_NUM"

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
  CHILD_NUM=$(gh issue create \
    --repo "$REPO" \
    --title "[$FEATURE_NAME] Task $i — $task" \
    --label "feature-task" \
    --body "$CHILD_BODY" \
    --json number -q .number)
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
```

Save to `.github/scripts/push-feature.sh`.

- [ ] **Step 2: Make executable**

```bash
chmod +x .github/scripts/push-feature.sh
```

- [ ] **Step 3: Smoke test with a dummy feature**

```bash
# Create minimal test files
echo -e "# Test Spec\n\nThis is a test." > /tmp/test-spec.md
echo -e "# Test Plan\n\n### Task 1: Do the first thing\n\n### Task 2: Do the second thing\n" > /tmp/test-plan.md

.github/scripts/push-feature.sh "Test Feature $(date +%s)" /tmp/test-spec.md /tmp/test-plan.md
```

Expected: parent issue and 2 child issues created, URLs printed. Verify on GitHub that parent checklist contains `- [ ] #N Do the first thing` and `- [ ] #N+1 Do the second thing`.

Close the test issues after verification:
```bash
# Replace N with the parent issue number printed above
gh issue close <parent-N> --comment "Test issue — closing"
gh issue close <child-N+1> --comment "Test issue — closing"
gh issue close <child-N+2> --comment "Test issue — closing"
```

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/push-feature.sh
git commit -m "feat(feature-tracking): add push-feature.sh to create GitHub issues from spec+plan"
```

---

### Task 3: Budget Check Script

**Files:**
- Create: `.github/scripts/check-feature-budget.sh`

Mirrors `.github/scripts/check-budget.sh` but scoped to `implement-feature.yml` with a 3-task/3-hour window.

- [ ] **Step 1: Write the script**

```bash
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
```

Save to `.github/scripts/check-feature-budget.sh`.

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x .github/scripts/check-feature-budget.sh
git add .github/scripts/check-feature-budget.sh
git commit -m "feat(feature-tracking): add check-feature-budget.sh"
```

---

### Task 4: Issue Selector Script

**Files:**
- Create: `.github/scripts/select-feature-issue.sh`

Picks the oldest open issue labeled `implement-me` + `feature-task`. Also detects stale `in-progress` issues (claim comment older than 2h with no open PR) and resets them back to `implement-me`.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Select the oldest open feature-task issue labeled "implement-me".
# Posts a claim comment to prevent concurrent agents from picking the same issue.
# Detects and recovers stale "in-progress" issues (claim > 2h, no open PR).
#
# Required env vars: GH_TOKEN, REPO, GITHUB_OUTPUT
# Optional env vars: STALE_HOURS (default 2)

set -euo pipefail

: "${REPO:?REPO is required}"
STALE_HOURS="${STALE_HOURS:-2}"

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

  echo "Selecting issue #$ISSUE_NUM."
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
```

Save to `.github/scripts/select-feature-issue.sh`.

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x .github/scripts/select-feature-issue.sh
git add .github/scripts/select-feature-issue.sh
git commit -m "feat(feature-tracking): add select-feature-issue.sh with stale detection"
```

---

### Task 5: Implement Feature Workflow

**Files:**
- Create: `.github/workflows/implement-feature.yml`

Cron every 30 min. Checks budget, selects issue, runs Claude Code, handles failure by resetting the issue label.

- [ ] **Step 1: Write the workflow**

```yaml
name: Implement feature task

on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:

concurrency:
  group: implement-feature
  cancel-in-progress: false

env:
  BUDGET_PER_3H: 3

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  implement:
    runs-on: ubuntu-latest
    if: ${{ vars.ENABLE_FEATURE_IMPLEMENTER != 'false' }}
    steps:
      - name: Check required secrets
        run: |
          if [ -z "$TOKEN" ]; then
            echo "::error::CLAUDE_CODE_OAUTH_TOKEN secret is not set — skipping."
            exit 1
          fi
        env:
          TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}

      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6

      - name: Select issue
        id: select
        run: .github/scripts/select-feature-issue.sh
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}

      - name: Check budget
        id: budget
        if: steps.select.outputs.selected != ''
        run: .github/scripts/check-feature-budget.sh
        env:
          GH_TOKEN: ${{ github.token }}
          BUDGET_PER_3H: ${{ env.BUDGET_PER_3H }}

      - name: Setup Node.js
        if: >
          steps.select.outputs.selected != '' &&
          steps.budget.outputs.remaining > 0
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: "22"

      - name: Install Claude Code
        if: >
          steps.select.outputs.selected != '' &&
          steps.budget.outputs.remaining > 0
        run: npm install -g @anthropic-ai/claude-code

      - name: Build implementation context
        id: context
        if: >
          steps.select.outputs.selected != '' &&
          steps.budget.outputs.remaining > 0
        run: |
          ISSUE_NUM="${{ steps.select.outputs.selected }}"
          REPO="${{ github.repository }}"

          ISSUE_BODY=$(gh api "repos/$REPO/issues/$ISSUE_NUM" --jq '.body')
          PARENT_NUM=$(echo "$ISSUE_BODY" | grep -oP '(?<=Parent: #)\d+' | head -1)
          ISSUE_TITLE=$(gh api "repos/$REPO/issues/$ISSUE_NUM" --jq '.title')

          if [ -n "$PARENT_NUM" ]; then
            PARENT_BODY=$(gh api "repos/$REPO/issues/$PARENT_NUM" --jq '.body')
          else
            PARENT_BODY="(no parent issue found)"
          fi

          # Derive a branch name from the issue title
          SLUG=$(echo "$ISSUE_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//g' | cut -c1-50)
          BRANCH="feat/${SLUG}-issue-${ISSUE_NUM}"

          echo "issue_num=$ISSUE_NUM" >> "$GITHUB_OUTPUT"
          echo "branch=$BRANCH" >> "$GITHUB_OUTPUT"

          # Write context files for Claude Code
          echo "$ISSUE_BODY" > /tmp/task_body.md
          echo "$PARENT_BODY" > /tmp/parent_spec.md
        env:
          GH_TOKEN: ${{ github.token }}

      - name: Implement task
        id: implement
        if: >
          steps.select.outputs.selected != '' &&
          steps.budget.outputs.remaining > 0
        env:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          GH_TOKEN: ${{ github.token }}
        run: |
          ISSUE_NUM="${{ steps.select.outputs.selected }}"
          BRANCH="${{ steps.context.outputs.branch }}"

          claude --print "You are implementing a feature task for the jobseek project.

          ## Parent Feature Spec

          $(cat /tmp/parent_spec.md)

          ## Task to Implement

          $(cat /tmp/task_body.md)

          ## Instructions

          1. Create branch: git checkout -b $BRANCH
          2. Implement the task described above. Follow existing code conventions in the repo.
          3. Write or update tests if the task involves logic changes.
          4. Open a PR with title matching the task title and body containing exactly: Closes #$ISSUE_NUM
          5. Do not modify anything outside the scope of this task."

      - name: Reset label on failure
        if: >
          failure() &&
          steps.select.outputs.selected != ''
        run: |
          ISSUE_NUM="${{ steps.select.outputs.selected }}"
          gh issue edit "$ISSUE_NUM" --repo "${{ github.repository }}" \
            --remove-label "in-progress" --add-label "implement-me" 2>/dev/null || true
          gh issue comment "$ISSUE_NUM" --repo "${{ github.repository }}" \
            --body ":x: Implementation run failed or timed out. Reset to \`implement-me\` for retry on next cron tick." 2>/dev/null || true
        env:
          GH_TOKEN: ${{ github.token }}
```

Save to `.github/workflows/implement-feature.yml`.

- [ ] **Step 2: Add repo variable to enable/disable the workflow**

```bash
gh variable set ENABLE_FEATURE_IMPLEMENTER --body "true" --repo $(gh repo view --json nameWithOwner -q .nameWithOwner)
```

Expected: `✓ Set variable ENABLE_FEATURE_IMPLEMENTER for <repo>`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/implement-feature.yml
git commit -m "feat(feature-tracking): add implement-feature.yml cron workflow"
```

---

### Task 6: Close Feature Task Workflow

**Files:**
- Create: `.github/workflows/close-feature-task.yml`

On PR merge, finds any linked `feature-task` issues, updates their labels, checks them off in the parent issue's checklist, and comments on the parent if all tasks are done.

- [ ] **Step 1: Write the workflow**

```yaml
name: Close feature task on merge

on:
  pull_request:
    types: [closed]

jobs:
  close-task:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: read

    steps:
      - name: Update feature task issues on merge
        run: |
          set -euo pipefail
          REPO="${{ github.repository }}"
          PR="${{ github.event.pull_request.number }}"

          # Get all issues closed by this PR
          ISSUES=$(gh pr view "$PR" --repo "$REPO" \
            --json closingIssuesReferences \
            --jq '.closingIssuesReferences[].number')

          if [ -z "$ISSUES" ]; then
            echo "No linked issues found."
            exit 0
          fi

          for ISSUE_NUM in $ISSUES; do
            LABELS=$(gh issue view "$ISSUE_NUM" --repo "$REPO" --json labels --jq '[.labels[].name]')
            IS_FEATURE_TASK=$(echo "$LABELS" | jq 'if index("feature-task") then true else false end' -r)

            if [ "$IS_FEATURE_TASK" != "true" ]; then
              echo "Issue #$ISSUE_NUM is not a feature-task — skipping."
              continue
            fi

            echo "Closing feature task #$ISSUE_NUM..."

            # Update labels
            gh issue edit "$ISSUE_NUM" --repo "$REPO" \
              --remove-label "awaiting-review" \
              --remove-label "in-progress" \
              --add-label "done" 2>/dev/null || true

            # Find parent issue number from issue body
            ISSUE_BODY=$(gh api "repos/$REPO/issues/$ISSUE_NUM" --jq '.body')
            PARENT_NUM=$(echo "$ISSUE_BODY" | grep -oP '(?<=Parent: #)\d+' | head -1)

            if [ -z "$PARENT_NUM" ]; then
              echo "Issue #$ISSUE_NUM has no parent — skipping checklist update."
              continue
            fi

            # Check off this task in the parent issue's checklist
            PARENT_BODY=$(gh api "repos/$REPO/issues/$PARENT_NUM" --jq '.body')
            UPDATED_BODY=$(echo "$PARENT_BODY" | sed "s/- \[ \] #$ISSUE_NUM /- [x] #$ISSUE_NUM /g")

            gh api --method PATCH "repos/$REPO/issues/$PARENT_NUM" \
              -f body="$UPDATED_BODY" > /dev/null
            echo "Checked off #$ISSUE_NUM in parent #$PARENT_NUM."

            # Check if all tasks in parent are done
            REMAINING=$(echo "$UPDATED_BODY" | grep -c '- \[ \] #' || true)
            if [ "$REMAINING" -eq 0 ]; then
              gh issue comment "$PARENT_NUM" --repo "$REPO" \
                --body ":white_check_mark: **All tasks complete!** This feature is fully implemented." 2>/dev/null || true
              echo "All tasks done — commented on parent #$PARENT_NUM."
            fi
          done
        env:
          GH_TOKEN: ${{ github.token }}
```

Save to `.github/workflows/close-feature-task.yml`.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/close-feature-task.yml
git commit -m "feat(feature-tracking): add close-feature-task.yml to update labels and parent checklist on merge"
```

---

## Verification

End-to-end test:

- [ ] **1. Verify labels exist**
```bash
gh label list --repo $(gh repo view --json nameWithOwner -q .nameWithOwner) | grep -E "feature-|implement-me|in-progress|awaiting-review|done"
```
Expected: 6 labels listed.

- [ ] **2. Push a test feature**
```bash
echo -e "# Test Spec\n\nA small test feature." > /tmp/vspec.md
printf "# Test Plan\n\n### Task 1: Add a test file\n\n### Task 2: Verify it exists\n" > /tmp/vplan.md
.github/scripts/push-feature.sh "Verification Test $(date +%s)" /tmp/vspec.md /tmp/vplan.md
```
Expected: parent + 2 child issues created, URLs printed.

- [ ] **3. Apply implement-me label to child issue #1**
```bash
gh issue edit <child-issue-1-number> --add-label "implement-me"
```

- [ ] **4. Wait for next cron tick (up to 30 min) OR trigger manually**
```bash
gh workflow run implement-feature.yml
```
Watch run: `gh run list --workflow implement-feature.yml --limit 3`

- [ ] **5. Verify the workflow picked up the issue**

Check that:
- Issue has `in-progress` label
- A `<!-- feat-claim -->` comment was posted
- Claude Code opened a PR linking `Closes #<child-issue-1>`

- [ ] **6. Merge the PR and verify cleanup**

After merging the PR:
- Child issue should have `done` label
- Parent checklist should show `- [x] #N` for that task
- If it was the last task, parent should have the "All tasks complete!" comment

- [ ] **7. Clean up test issues**
```bash
gh issue close <parent> <child-1> <child-2> --comment "Verification complete — closing test issues"
```
