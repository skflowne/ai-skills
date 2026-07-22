#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: run.sh <issue-to-pr|implement|fast-implement|fast-issue-to-pr|review|review-lite> <issue-or-pr-number> [openai|kimi] [repository-path]
EOF
  exit 2
}

[[ $# -ge 2 && $# -le 4 ]] || usage

mode=$1
number=$2
backend=${3:-openai}
repo_path=${4:-$PWD}

[[ $number =~ ^[1-9][0-9]*$ ]] || {
  echo "error: issue/PR number must be a positive integer" >&2
  exit 2
}

skills_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
workflow_dir="$skills_root/workflows-codex"

case "$mode" in
  issue-to-pr)
    workflow="$workflow_dir/issue-to-pr.js"
    args="{\"issueNumber\":$number}"
    ;;
  implement)
    workflow="$workflow_dir/implement-issue-flow.js"
    args="{\"issueNumber\":$number}"
    ;;
  fast-implement)
    workflow="$workflow_dir/fast-implement.js"
    args="{\"issueNumber\":$number}"
    ;;
  fast-issue-to-pr)
    workflow="$workflow_dir/fast-issue-to-pr.js"
    args="{\"issueNumber\":$number}"
    ;;
  review)
    workflow="$workflow_dir/review-fix-loop.js"
    args="{\"prNumber\":$number}"
    ;;
  review-lite)
    workflow="$workflow_dir/review-fix-loop-lite.js"
    args="{\"prNumber\":$number}"
    ;;
  *) usage ;;
esac

case "$backend" in
  openai|codex)
    config="$workflow_dir/codex-workflow.config.ts"
    ;;
  kimi)
    config="$workflow_dir/codex-workflow.config.kimi.ts"
    ;;
  *)
    echo "error: backend must be 'openai' or 'kimi'" >&2
    exit 2
    ;;
esac

repo_path=$(cd -- "$repo_path" && pwd)
git -C "$repo_path" rev-parse --is-inside-work-tree >/dev/null
command -v codex-workflow >/dev/null || {
  echo "error: codex-workflow is not on PATH" >&2
  exit 127
}

exec codex-workflow run "$workflow" \
  --config "$config" \
  --cwd "$repo_path" \
  --args "$args" \
  --no-web \
  --no-progress
