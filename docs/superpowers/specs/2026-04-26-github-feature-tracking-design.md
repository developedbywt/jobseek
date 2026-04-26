# GitHub Feature Tracking Design

**Date:** 2026-04-26  
**Status:** Approved

## Context

The project has no infrastructure for tracking general feature work. All existing GitHub automation is scoped to the company-request pipeline. As a solo developer working through structured phases (Phase 1, 2, 3…), there is a need to capture feature ideas locally, plan them through brainstorming, and then hand off implementation to automated GitHub Actions — mirroring the proven company-request pattern.

## Goal

Enable a local-brainstorm → GitHub Issues → automated-implementation pipeline for feature work, where:
- Planning happens locally with Claude Code
- Implementation happens in the cloud via GitHub Actions + Claude Code
- The developer signals readiness by applying a label; a cron queue handles scheduling, budget, and recovery

## Pipeline Overview

```
Local (Claude Code session)
  1. /brainstorming → spec written to docs/superpowers/specs/
  2. /writing-plans → implementation plan created
  3. push-feature.sh → creates GitHub issues

GitHub Issues
  Parent #N: "feat: Feature Name" (spec + task checklist)
    ├── Child #N+1: Task 1
    ├── Child #N+2: Task 2
    └── Child #N+3: Task 3

GitHub Actions (cron every 30 min)
  implement-feature.yml wakes up
  → check-feature-budget.sh: ≤3 tasks per 3-hour window, else exit
  → select-feature-issue.sh: picks oldest implement-me issue, claims it
  → Claude Code reads issue + parent spec, implements task, opens PR
  → On PR merge: task checked off in parent, issue labeled "done"
  → Stale detection: if in-progress >2h with no PR → comment + reset to implement-me
```

## Issue Structure

### Parent Issue

- **Title:** `feat: <Feature Name>`
- **Labels:** `feature-parent`
- **Body:**
  - `## Spec` — full spec doc contents
  - `## Tasks` — checklist with child issue links (updated by push script after child creation)

### Child Issues

- **Title:** `[<Feature Name>] Task N — <task title>`
- **Labels:** `feature-task`
- **Body:**
  - `Parent: #N`
  - `## Task` — task description from plan
  - `## Context` — relevant spec sections

## Labels

| Label | Purpose |
|---|---|
| `feature-parent` | Tracking issue; not implemented directly |
| `feature-task` | A task ready to be worked |
| `implement-me` | Developer applies to trigger Claude Code |
| `in-progress` | Action is running |
| `awaiting-review` | PR opened, waiting for merge |
| `done` | Merged, checked off in parent |

## GitHub Actions

### `implement-feature.yml`

**Trigger:** `schedule` — every 30 minutes (`*/30 * * * *`)

**Steps:**
1. Run `check-feature-budget.sh` — exit if ≥3 tasks completed in the last 3 hours
2. Run `select-feature-issue.sh` — find oldest open issue labeled `implement-me` + `feature-task`; post claim comment; exit if none found
3. Add `in-progress`, remove `implement-me`
4. Fetch issue body + parent issue spec via `gh api`
5. Run Claude Code with structured prompt
6. On success: Claude opens PR with `Closes #<issue>` in body; add `awaiting-review`
7. On failure/timeout: remove `in-progress`, restore `implement-me`, comment with error

**Claude Code prompt structure:**
```
You are implementing a feature task for the jobseek project.

Parent spec:
<full spec from parent issue>

Task:
<child issue body>

Branch off main, implement the task, open a PR linking "Closes #<N>".
```

**Stale detection (inside `select-feature-issue.sh`):**
- If an issue has been `in-progress` for >2 hours with no open PR → remove `in-progress`, restore `implement-me`, post warning comment

### `close-feature-task.yml`

**Trigger:** `pull_request.closed` where `merged = true`

**Steps:**
1. Parse PR body for `Closes #N` referencing a `feature-task` issue
2. Add `done` label to linked issue, remove `awaiting-review`
3. Check off that task in the parent issue's checklist
4. If all tasks complete → comment "All tasks complete" on parent issue

### Supporting scripts

| Script | Purpose |
|---|---|
| `.github/scripts/check-feature-budget.sh` | 3-task / 3-hour rolling window rate limiter |
| `.github/scripts/select-feature-issue.sh` | Picks oldest `implement-me` issue, posts claim, detects stale `in-progress` |

## Local Push Script

**Location:** `.github/scripts/push-feature.sh`

**Usage:**
```bash
.github/scripts/push-feature.sh "Feature Name" \
  docs/superpowers/specs/YYYY-MM-DD-feature-design.md \
  docs/superpowers/plans/YYYY-MM-DD-feature-plan.md
```

**Behavior:**
1. Creates parent issue with spec contents and empty checklist
2. Reads `## Tasks` section from plan file, one child issue per task
3. Creates each child issue linked to parent
4. Updates parent checklist with child issue numbers
5. Prints summary of created issues

**Plan file task format** (already matches existing conventions):
```markdown
## Tasks
- [ ] Task 1 — Description
- [ ] Task 2 — Description
```

## Verification

1. Run `push-feature.sh` with a sample spec + plan → verify parent + child issues created correctly on GitHub
2. Apply `implement-me` label to a child issue → wait for next 30-min cron tick → verify `implement-feature.yml` picks it up, Claude Code runs, PR opened
3. Merge the PR → verify `close-feature-task.yml` checks off the task in the parent, labels issue `done`
4. Complete all tasks → verify parent issue receives "All tasks complete" comment
5. Apply `implement-me` to 4 issues within 3 hours → verify 4th is skipped by budget check, processed in next window
