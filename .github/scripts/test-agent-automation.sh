#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMPDIR_ROOT="$(mktemp -d)"
if [ "${1:-}" = "--verify-stub" ]; then
  exit 0
fi

cleanup() {
  rm -rf "$TMPDIR_ROOT"
  rm -rf "$ROOT_DIR/ai/runs/42"
}
trap cleanup EXIT

TEST_TMPDIR="$TMPDIR_ROOT/run"
STUB_DIR="$TMPDIR_ROOT/bin"
mkdir -p "$TEST_TMPDIR" "$STUB_DIR"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_file() {
  [ -f "$1" ] || fail "Expected file to exist: $1"
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  grep -q "$pattern" "$file" || fail "Expected '$pattern' in $file"
}

cat > "$STUB_DIR/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$AGENT_TEST_TMPDIR/gh.log"

case "$1 $2" in
  "issue view")
    cat "$AGENT_TEST_TMPDIR/issue-view.json"
    ;;
  "issue comment")
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--body-file" ]; then
        shift
        cp "$1" "$AGENT_TEST_TMPDIR/last-issue-comment.md"
      fi
      shift
    done
    ;;
  "issue edit")
    ;;
  "pr view")
    if printf '%s' "$*" | grep -q -- '--json body'; then
      printf 'Closes #42\n'
    else
      cat "$AGENT_TEST_TMPDIR/pr-view.json"
    fi
    ;;
  "pr diff")
    printf 'diff --git a/a b/a\n'
    ;;
  "pr comment")
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--body-file" ]; then
        shift
        cp "$1" "$AGENT_TEST_TMPDIR/last-pr-comment.md"
      fi
      shift
    done
    ;;
  "pr create")
    printf 'https://github.com/example/repo/pull/99\n'
    ;;
  *)
    printf 'Unhandled gh invocation: %s\n' "$*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$STUB_DIR/gh"

cat > "$STUB_DIR/claude" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if printf '%s' "$*" | grep -q -- '--output-format json'; then
  cat <<'JSON'
{"spec_markdown":"# Spec\n","plan_json":{"summary":"summary","execution_brief":"Implement it","verification":["bash .github/scripts/test-agent-automation.sh --verify-stub"]},"summary_markdown":"Plan generated."}
JSON
else
  printf 'No findings.\n'
fi
EOF
chmod +x "$STUB_DIR/claude"

cat > "$STUB_DIR/codex" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$AGENT_TEST_TMPDIR/codex.log"
exit 0
EOF
chmod +x "$STUB_DIR/codex"

cat > "$STUB_DIR/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$AGENT_TEST_TMPDIR/git.log"
case "${1:-}" in
  status)
    ;;
  *)
    ;;
esac
EOF
chmod +x "$STUB_DIR/git"

cat > "$TEST_TMPDIR/issue-view.json" <<'JSON'
{"number":42,"title":"Test issue","body":"Do the thing","labels":[{"name":"agent:build-ready"}],"url":"https://github.com/example/repo/issues/42"}
JSON

cat > "$TEST_TMPDIR/pr-view.json" <<'JSON'
{"number":99,"title":"Agent build: issue #42","body":"Closes #42","files":[]}
JSON

export AGENT_TEST_TMPDIR="$TEST_TMPDIR"
export REPO="example/repo"
export ISSUE_NUMBER="42"
export PR_NUMBER="99"
export GH_TOKEN="test-token"
export PATH="$STUB_DIR:$PATH"

cd "$ROOT_DIR"

bash .github/scripts/agent-plan.sh
assert_file "$ROOT_DIR/ai/runs/42/Goal.md"
assert_file "$ROOT_DIR/ai/runs/42/Spec.md"
assert_file "$ROOT_DIR/ai/runs/42/Plan.json"
assert_contains "$TEST_TMPDIR/last-issue-comment.md" "Plan generated."

bash .github/scripts/agent-build.sh
assert_file "$ROOT_DIR/ai/runs/42/Build.md"
assert_contains "$TEST_TMPDIR/last-issue-comment.md" "Build complete."

bash .github/scripts/agent-review.sh
assert_file "$ROOT_DIR/ai/runs/42/Review.md"
assert_contains "$TEST_TMPDIR/last-pr-comment.md" "No findings."

echo "PASS"
