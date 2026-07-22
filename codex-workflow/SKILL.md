---
name: codex-workflow
description: Run the role-routed issue-to-PR, issue implementation, or PR review/fix dynamic workflows from Pi. Use only when the user explicitly asks to launch one of these workflows.
disable-model-invocation: true
---

# Codex Workflow

Launch the requested `codex-workflow` pipeline in the current repository through the bundled helper.
These workflows can create branches, edit and commit code, comment on issues, push branches, and open
or review pull requests. Never launch one implicitly.

## Arguments

Interpret the arguments following `/skill:codex-workflow` as:

```text
<mode> <issue-or-pr-number> [openai|kimi] [repository-path] [options]
```

Modes:

- `issue-to-pr` — complete implementation, open a PR, then run the review/fix loop
- `implement` — implement the issue and open a PR, without the subsequent review/fix loop
- `fast-implement` — implement the issue with the dual-forge process and open a PR
- `fast-issue-to-pr` — run `fast-implement`, then run the review/fix loop
- `review` — run the full council + YOLO review/fix loop on an existing PR
- `review-lite` — run the lightweight YOLO-only review/fix loop, using an orchestrator with the `orchestrate` skill for fixes

The backend defaults to `openai`. The repository defaults to Pi's current working directory.

Review-lite maintains one persistent PR workflow-report comment and uses a read-only progress scout every eight minutes, anchored independently to each review and fix start. Meaningful milestones update the comment immediately. Options:

- `--no-pr-reporting` — disable the PR report and progress scout
- `--pr-report-interval <Nm>` — override the scout interval, for example `--pr-report-interval 12m`

## Operating rules

- Do not assume this skill is installed through `~/.agents/skills` or linked to `~/projects/ai-skills`. Use the actual installed skill directory. A shared `~/.agents/skills` symlink is supported but optional.
- Before launching or reporting on a workflow, inspect the running `codex-workflow` processes.
- Never pass a `timeout` field when launching a workflow. These are long-running tasks, and the harness rejects an invalid timeout before the helper can run.
- Never terminate a workflow without a workflow ID. If no ID is provided, list the workflows instead of terminating any of them.

## Procedure

1. Require a mode and numeric issue/PR number. Ask for missing arguments.
2. Resolve the repository path and verify it is a Git worktree.
3. Run `gh auth status`. If authentication is unavailable, stop and explain.
4. Inspect `git status --short`. If unrelated uncommitted changes exist, show them and obtain explicit
   confirmation before proceeding; the implementation workflow may stash them.
5. Run the helper and wait for completion. Do not add a timeout field:

```bash
<installed-skill-directory>/codex-workflow/run.sh <mode> <number> [openai|kimi] [repository-path] [options]
```

6. Report the workflow status, run ID, PR URL when present, test status, review-loop status, and any
failures. If interrupted, report the run ID and the corresponding `codex-workflow resume <runId>` command.

## Examples

```text
/skill:codex-workflow issue-to-pr 123
/skill:codex-workflow issue-to-pr 123 kimi
/skill:codex-workflow implement 123 openai /home/me/projects/example
/skill:codex-workflow fast-implement 123
/skill:codex-workflow fast-issue-to-pr 123
/skill:codex-workflow review 456 openai
/skill:codex-workflow review-lite 456 kimi
/skill:codex-workflow review-lite 456 openai --pr-report-interval 12m
/skill:codex-workflow review-lite 456 kimi --no-pr-reporting
```
