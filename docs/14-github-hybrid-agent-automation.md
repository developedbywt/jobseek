# GitHub Hybrid Agent Automation

## Setup

1. Install a self-hosted macOS GitHub runner with label `codex`.
2. Ensure `git`, `gh`, `jq`, `claude`, and `codex` are installed and authenticated on the runner.
3. Ensure `pnpm` is available as an actual executable on `PATH`, not only through `corepack pnpm`, so `turbo` can discover the package manager binary during lint/build tasks.
4. Create these issue labels:
   - `agent:plan`
   - `agent:build-ready`
   - `agent:build`
   - `agent:blocked`
   - `agent:done`
5. Create this PR label:
   - `agent:review`

## Operating loop

1. Open an issue with the `Agent task` template.
2. Add `agent:plan` to the issue.
3. Review `ai/runs/<issue>/Spec.md` and `ai/runs/<issue>/Plan.json`.
4. Add `agent:build` to the issue.
5. Review the PR that the build stage creates or updates.
6. Add `agent:review` to the PR when you want the bounded review pass to run.

## Artifacts

Each issue stores durable run state in `ai/runs/<issue-number>/`:

- `Goal.md`
- `Spec.md`
- `Plan.json`
- `Build.md`
- `Review.md`
- `Status.json`

## Current limitations

- Private repos only.
- The self-hosted runner must be online.
- Build runs only after explicit user relabeling.
- No auto-merge in v1.
- No slash-command or comment-command support in v1.
