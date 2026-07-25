# Legacy

Superseded work, kept for reference. Nothing here is maintained, and nothing here is wired up.

The current workflow tree is `issue-to-pr` and its two children:

```
workflows/issue-to-pr.js
├── workflows/supervised-implement.js   (supervised-forge skill)
└── workflows/review-supervised.js      (yolo-council-review, pr-review, github-pr-review skills)
```

Launch them through the `run-workflow` skill, never `Workflow()` directly.

## What is here

| Path | Superseded by | Notes |
| --- | --- | --- |
| `workflows/fast-implement.js` | `supervised-implement` | Wrapped the `tdd-forge` skill, which is still current and directly invocable. |
| `workflows/fast-issue-to-pr.js` | `issue-to-pr` | Composed `fast-implement` + `review-fix-loop`. **Broken by the move** — see below. |
| `workflows/review-fix-loop.js` | `review-supervised` | Ran the fixed `council-review` panel alongside the tailored one. `council-review` itself is still current — `review-supervised` points at it as the read-only fallback for fork PRs. |
| `workflows/implement-issue-flow.js` | `issue-to-pr` | Unattended version of the `implement-issue` skill below. |
| `implement-issue/` | `supervised-implement` | Hand-orchestrated issue-to-PR skill, driven from the main conversation. |

## Why they were retired

They branch and commit in the user's own checkout. The current three do all their work in a git
worktree the run creates, leaving the checkout untouched — see the worktree isolation in
`workflows/supervised-implement.js`. They also predate the preflight in `run-workflow` (validated
args, pinned base branch, dirty-tree confirmation), so a run started from whatever happened to be
checked out branched from it.

## The codex track still runs these

`codex-workflow/run.sh` launches workflow scripts **by path**, so it never depended on skill
registration. Its `implement`, `fast-implement`, and `review` modes now point here and still work.

Its `fast-issue-to-pr` mode does not. That script resolves its two children through
`workflow('skills:fast-implement')` and `workflow('skills:review-fix-loop')` — registered names, which
no longer exist — so it fails as soon as it reaches the first child. Fixing it would mean inlining
both children or restoring the names; neither is worth doing for a retired composite. Use
`issue-to-pr` instead.

## Moving something back

These scripts are no longer discovered as `skills:` workflows, so `Workflow()` cannot launch them by
name — `git mv` the file back into `workflows/` first. Expect it to be behind: the invariant-first
planning and root-cause classification added for issue #11 landed across both trees, but nothing
after that point was applied here.
