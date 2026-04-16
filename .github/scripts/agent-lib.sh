#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "::error::Missing required command: $1" >&2
    exit 1
  }
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "::error::Missing required environment variable: $name" >&2
    exit 1
  fi
}

issue_run_dir() {
  local issue="$1"
  printf 'ai/runs/%s\n' "$issue"
}

ensure_run_dir() {
  local dir
  dir="$(issue_run_dir "$1")"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

status_file() {
  printf '%s/Status.json\n' "$(issue_run_dir "$1")"
}

issue_json() {
  gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json number,title,body,labels,url
}

has_label() {
  local label="$1"
  issue_json | jq -e --arg label "$label" '.labels | map(.name) | index($label) != null' >/dev/null
}

replace_label() {
  local remove_label="$1"
  local add_label="$2"
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --remove-label "$remove_label" --add-label "$add_label"
}

post_issue_comment() {
  local body_file="$1"
  gh issue comment "$ISSUE_NUMBER" --repo "$REPO" --body-file "$body_file"
}

post_pr_comment() {
  local pr_number="$1"
  local body_file="$2"
  gh pr comment "$pr_number" --repo "$REPO" --body-file "$body_file"
}

linked_issue_from_pr() {
  local pr_number="$1"
  gh pr view "$pr_number" --repo "$REPO" --json body --jq '.body' \
    | sed -nE 's/.*Closes #([0-9]+).*/\1/p' \
    | head -n1
}

write_status() {
  local phase="$1"
  local state="$2"
  local message="$3"

  jq -n \
    --arg issue "$ISSUE_NUMBER" \
    --arg phase "$phase" \
    --arg state "$state" \
    --arg message "$message" \
    --arg updated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      issue: $issue,
      phase: $phase,
      state: $state,
      message: $message,
      updated_at: $updated_at
    }' > "$(status_file "$ISSUE_NUMBER")"
}
