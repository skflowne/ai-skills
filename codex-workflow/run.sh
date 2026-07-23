#!/usr/bin/env bash
set -euo pipefail

json_string() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '"%s"' "$value"
}

usage() {
  cat >&2 <<'EOF'
Usage: run.sh <issue-to-pr|implement|fast-implement|fast-issue-to-pr|review|review-lite> <issue-or-pr-number> [openai|kimi] [repository-path] [options]

Review-lite options:
  --no-pr-reporting           Disable the persistent PR workflow report and progress scout
  --pr-report-interval <Nm>   Set the phase-anchored scout interval (default: 8m)
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
pr_report_interval_minutes=8
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
    --pr-report-interval)
      [[ $# -ge 2 ]] || usage
      interval=${2%m}
      [[ $interval =~ ^[1-9][0-9]*$ ]] || {
        echo "error: --pr-report-interval must be a positive number of minutes, such as 8m" >&2
        exit 2
      }
      pr_report_interval_minutes=$interval
      pr_reporting_option_seen=true
      shift 2
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

if [[ $mode != review-lite && $pr_reporting_option_seen == true ]]; then
  echo "error: PR reporting options are only valid with review-lite" >&2
  exit 2
fi

skills_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
workflow_dir="$skills_root/workflows-codex"
workflow_dir_json=$(json_string "$workflow_dir")

case "$mode" in
  issue-to-pr)
    workflow="$workflow_dir/issue-to-pr.js"
    args="{\"issueNumber\":$number,\"workflowDir\":$workflow_dir_json}"
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
    args="{\"issueNumber\":$number,\"workflowDir\":$workflow_dir_json}"
    ;;
  review)
    workflow="$workflow_dir/review-fix-loop.js"
    args="{\"prNumber\":$number}"
    ;;
  review-lite)
    workflow="$workflow_dir/review-fix-loop-lite.js"
    args="{\"prNumber\":$number,\"prReporting\":$pr_reporting,\"prReportIntervalMinutes\":$pr_report_interval_minutes}"
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
  --no-web
