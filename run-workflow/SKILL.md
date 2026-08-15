---
name: run-workflow
description: "Launch a native dynamic workflow (issue-to-pr, supervised-implement, review-supervised) with preflighted, validated arguments. Use only when the user explicitly names and requests this skill."
---

# Run Workflow

This skill is the only supported way to start a native `Workflow()` run. These runs create branches,
edit and commit code, push, comment on issues, and open or review pull requests.

Use it whenever the user asks for one of these runs, however they phrase it — "implement issue 5"
routes here exactly like `/run-workflow implement 5` does. Never start one the user did not ask for.

This skill deliberately does **not** carry `disable-model-invocation`. It once did, which was
backwards: the workflow entry points themselves stay model-invocable, so the flag gated the
preflighted path while leaving the unpreflighted one open — it prevented the safe launch, not the
unsafe one. What actually guards these runs is the two human gates in the procedure below: the
dirty-tree confirmation (step 3) and the ambiguous-base confirmation (step 4). Those are real
approval points. Do not remove them, and do not answer them on the user's behalf.

Do not call `Workflow({name: 'skills:...'})` directly for the entry points below. Everything the run
needs settled before it starts — a validated args object, an explicit repo, a pinned base branch, a
decision about uncommitted work — has no other place to live. A run that starts without it branches
from whatever happens to be checked out and reviews whatever that happens to contain.

## Arguments

Interpret the arguments following the skill invocation as:

```text
<mode> <issue-or-pr-number> [--base <branch>] [--repo <path>] [options]
```

| Mode | Workflow | Args object |
| --- | --- | --- |
| `issue-to-pr` | `skills:issue-to-pr` | `{issueNumber, repoSlug, repoPath, baseBranch, allowDirtyTree}` |
| `implement` | `skills:supervised-implement` | `{issueNumber, repoSlug, repoPath, baseBranch, allowDirtyTree}` |
| `review` | `skills:review-supervised` | `{prNumber, repoSlug, repoPath, allowDirtyTree, prReporting}` |

These three are the only entry points. `issue-to-pr` is the composite; the other two are its children,
runnable on their own. All support `baseBranch`/`allowDirtyTree` and worktree isolation.

**`skills:split-chunks` is the one workflow this skill does not launch.** It takes a decomposition —
chunk contracts with scope allowlists and file budgets, plus the trunk-owned path denylist — which
cannot be parsed from a slash-command invocation and has to be authored against the actual repo.
[split-forge](../split-forge/SKILL.md) owns that entry point: it names the invariants, sorts trunk
work from chunk work, runs the same preflight this skill does (steps 1–4 below), launches the run,
and then authors the cross-cutting commit itself. Route "split this up", "implement it in parallel
chunks", or `$split-forge` there. Never call `Workflow({name: 'skills:split-chunks'})` without going
through it — an unpreflighted run branches from whatever is checked out, and a hand-written args
object with no `crossCuttingPaths` leaves every doc and shared module writable by every chunk.

The former `fast-implement`, `fast-issue-to-pr`, `review-full`, and `implement-flow` modes are gone.
Their scripts moved to `legacy/workflows/` and are no longer registered as `skills:` workflows, so
`Workflow()` cannot launch them. If a user asks for one by name, say it was retired and offer the
current equivalent: `issue-to-pr` for `fast-issue-to-pr` or `implement-flow`, `implement` for
`fast-implement`, `review` for `review-full`. Do not try to run a legacy script by path.

Options: `--no-pr-reporting` maps to `prReporting: false` (`review` only).

`review` and `issue-to-pr` push fix commits to the PR's head branch, so they refuse a PR opened from
a fork (`gh pr view <n> --json isCrossRepository`). The workflow fails fast on this, but check it
here when the PR may be external and say so before launching — point the user at a read-only review
(`council-review`, `pr-review`) instead.

## Procedure

Run these in order. The context check comes before branch or implementation planning: never infer
from an issue number that nobody has started or completed the work. Steps 3 and 4 are ordered
deliberately: a dirty tree is a reason to stop entirely, so settle it before spending the user's
attention on a branch question.

### 1. Establish the target and explore its current context

Require a mode and a number. Ask for whichever is missing rather than guessing. Accept `5`, `#5`,
`issue 5`, `pr 5`, or a GitHub issue/PR URL, normalize it to an **integer**, and hard-validate that it
is positive.

Resolve `repoPath` (default: the current working directory; verify it with `git -C <path> rev-parse
--git-dir`) and `repoSlug` (`gh repo view --json nameWithOwner`). Check `gh auth status`; if
authentication is unavailable, stop before launching.

For an issue mode, make the first substantive action a read-only context pass. Verify rather than
assume:

- the issue's current state, body, acceptance criteria, discussion, linked issues, and linked PRs;
- open, closed, and draft PRs that reference or implement the issue;
- local and remote branches, worktrees, and commits that appear related; and
- the relevant code and tests as they exist now, including whether some or all requested behavior is
  already present.

A small fleet of read-only scouts is advised when the issue has nontrivial history or repository
state: one for issue/discussion context, one for codebase status, and one for branches, commits,
worktrees, and PRs. Keep the fleet proportional—use fewer scouts for a narrow issue and do not fan
out when one quick pass is enough. Give each scout a bounded concern and require a concise,
evidence-backed summary containing only key state, exact references, and remaining-work implications;
do not carry raw logs or full transcripts into the implementation context. Synthesize those summaries
before deciding what action remains. Do not create a branch, delete a branch, or launch an
implementation workflow during discovery.

If the issue is already completed, has an active implementation PR, or has partial work on a branch,
report that state and choose the next action from evidence. Reuse or review existing work when that
is the requested outcome; do not silently start a duplicate implementation. If continuing existing
work versus starting over is a genuine direction choice, present the verified options and ask once.
Do not launch this workflow until the discovered state is reconciled with its new-worktree behavior.

For `review`, perform the equivalent PR context check: verify the PR state, head/base, linked issue,
and current review or fix activity rather than assuming it is ready for another writer.

Pass both `repoPath` and `repoSlug` in every args object. Without them, each agent re-resolves the
repo from cwd's default remote, and implementing in one checkout while reviewing another is the
worst possible split.

`args` must be an **object**, never a string. `Workflow({args: "5"})` parses to the number `5`, so
`ARGS.issueNumber` is `undefined` and `#undefined` gets interpolated into prompts — where an agent
improvises instead of failing. Always pass `args: {issueNumber: 5, ...}`.

### 2. Check whether the workflow can proceed

Use the discovery result to verify that this run will not overwrite, duplicate, or ignore existing
work. Stop and explain when the issue state makes implementation inappropriate or when relevant work
cannot be safely reconciled. This is a state check, not an assumption that every open issue needs a
fresh branch.

### 3. Preflight the working tree — ask, never stash

Run `git -C <repoPath> status --porcelain`. If clean, continue.

If dirty, show what is uncommitted and get explicit confirmation before launching. State plainly
that the uncommitted work **stays untouched in their checkout and will not be part of the branch** —
so the PR will not contain changes they may believe are included.

Never stash. Never `checkout`, `reset`, or move HEAD in the user's checkout. If the user approves,
pass `allowDirtyTree: true`; otherwise stop and let them commit or stash themselves first.

`allowDirtyTree` is an acknowledgement, not a preference — only ever set it because a human said yes
in this conversation. The workflows hard-refuse a dirty tree without it, which is what keeps the
guarantee when a run is started by cron, by another agent, or on resume, where nobody was asked.

### 4. Determine the target branch — confirm only when ambiguous

**Skip this entire step for `review`.** A review works from a PR number alone: the
PR determines its own head branch, base ref, and head repo. There is nothing to resolve and nothing
to ask, and `baseBranch` is not a meaningful arg for those workflows. Asking would be pure friction.

For implement modes, run `git -C <repoPath> fetch origin`, then decide.

**Do not ask when the answer is clear.** Proceed with no prompt when either holds:

- The user named a target branch in the invocation (`--base <branch>`). Use it as given.
- The work is independent — it does not build on anything unmerged — and the checkout is on a clean,
  up-to-date default branch. Target the default branch from `gh repo view --json defaultBranchRef`.

**Confirm only when the intended base is genuinely ambiguous:**

- The issue depends on, or is stacked on, work in an open unmerged PR or another feature branch.
- The checkout is on a non-default branch, so it is unclear whether the user means to stack on it or
  start fresh from default.
- The local default branch is ahead of its remote — the user may believe unpushed work is included.
  Check with `git -C <repoPath> rev-list --count origin/<default>..<default>`.

When you confirm, **state the base you propose and why**, so the user approves a specific choice
rather than answering an open question. Ask once; do not re-ask downstream.

Pass the outcome as an explicit `baseBranch`. The workflow creates its worktree from
`origin/<baseBranch>` — never a local ref — which is what keeps unpushed local commits out of the
PR's diff.

### 5. Launch and report

Call `Workflow({name: <workflow>, args: <object>})`. Do not pass a `timeout`.

The workflow creates its own git worktree and does all its work there; the user's checkout is left
untouched. Do not create a worktree yourself, and do not `cd` anywhere before launching.

For the composite `issue-to-pr`, preflight **once** here. The composite forwards the resolved args to
both children itself.

When the run returns, report: status, run ID, PR URL, test status, review-loop status, the resolved
base branch, and any failures. On failure, also report the worktree path from the log — the run's
work is still there, and only there.

## Examples

```text
/run-workflow issue-to-pr 123
/run-workflow implement 123 --base release/2.0
/run-workflow implement 123 --repo /home/me/projects/example
/run-workflow review 456
/run-workflow review 456 --no-pr-reporting
```
