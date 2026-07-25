#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: run.sh <issue-to-pr|implement|fast-implement|fast-issue-to-pr|review|review-supervised> <issue-or-pr-number> [openai|kimi] [repository-path] [options]

Review-supervised options:
  --no-pr-reporting           Disable the persistent PR workflow report and progress scout
EOF
  exit 2
}

[[ $# -ge 2 ]] || usage

mode=$1
number=$2
shift 2
backend=openai
repo_path=$PWD
pr_reporting=true
pr_reporting_option_seen=false

if [[ $# -gt 0 && $1 != --* ]]; then
  backend=$1
  shift
fi
if [[ $# -gt 0 && $1 != --* ]]; then
  repo_path=$1
  shift
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pr-reporting)
      pr_reporting=false
      pr_reporting_option_seen=true
      shift
      ;;
    *)
      echo "error: unknown option '$1'" >&2
      usage
      ;;
  esac
done

[[ $number =~ ^[1-9][0-9]*$ ]] || {
  echo "error: issue/PR number must be a positive integer" >&2
  exit 2
}

if [[ $mode != review-supervised && $mode != review-lite && $pr_reporting_option_seen == true ]]; then
  echo "error: PR reporting options are only valid with review-supervised" >&2
  exit 2
fi

skills_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
workflow_dir="$skills_root/workflows"
# The retired workflows still run here — this track launches scripts by path, so it never depended on
# them being registered as skills: entry points. They are unmaintained; prefer the modes above them.
legacy_workflow_dir="$skills_root/legacy/workflows"
config_dir="$skills_root/workflows-codex"

case "$mode" in
  issue-to-pr)
    workflow="$workflow_dir/issue-to-pr.js"
    args="{\"issueNumber\":$number}"
    ;;
  implement)
    workflow="$legacy_workflow_dir/implement-issue-flow.js"
    args="{\"issueNumber\":$number}"
    ;;
  fast-implement)
    workflow="$legacy_workflow_dir/fast-implement.js"
    args="{\"issueNumber\":$number}"
    ;;
  fast-issue-to-pr)
    workflow="$legacy_workflow_dir/fast-issue-to-pr.js"
    args="{\"issueNumber\":$number}"
    ;;
  review)
    workflow="$legacy_workflow_dir/review-fix-loop.js"
    args="{\"prNumber\":$number}"
    ;;
  review-supervised|review-lite) # review-lite: pre-rename alias
    workflow="$workflow_dir/review-supervised.js"
    args="{\"prNumber\":$number,\"prReporting\":$pr_reporting}"
    ;;
  *) usage ;;
esac

case "$backend" in
  openai|codex)
    config="$config_dir/codex-workflow.config.ts"
    ;;
  kimi)
    config="$config_dir/codex-workflow.config.kimi.ts"
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
  --no-web
