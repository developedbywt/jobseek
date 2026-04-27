#!/usr/bin/env bash
# One-time script to create labels for feature tracking.
# Usage: GH_TOKEN=<token> REPO=<owner/repo> .github/scripts/setup-feature-labels.sh

set -euo pipefail

# Default to upstream (org repo). Override with REPO= env var if needed.
REPO="${REPO:-$(git remote get-url upstream 2>/dev/null | sed 's|https://github.com/||;s|\.git$||' || git remote get-url origin | sed 's|https://github.com/||;s|\.git$||')}"

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
