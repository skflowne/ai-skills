# Legacy

Superseded work, kept for reference. Nothing here is maintained.

Workflows are written in Claude format from now on. The codex package consumes that format directly,
so there is one tree to maintain rather than a Claude track and a codex track in parallel.

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
| `workflows/fast-issue-to-pr.js` | `issue-to-pr` | Composed `fast-implement` + `review-fix-loop`. **Non-functional:** it resolves both children by registered name, and neither is registered any more. |
| `workflows/review-fix-loop.js` | `review-supervised` | Ran the fixed `council-review` panel alongside the tailored one. `council-review` itself is still current — `review-supervised` points at it as the read-only fallback for fork PRs. |
| `workflows/implement-issue-flow.js` | `issue-to-pr` | Unattended version of the `implement-issue` skill below. |
| `implement-issue/` | `supervised-implement` | Hand-orchestrated issue-to-PR skill, driven from the main conversation. |
| `codex-workflow/` | running the workflows directly | Skill wrapping `codex-workflow run <script> --config <ts>`. |
| `workflows-codex/` | — | The two provider configs that wrapper passed. |

## Why they were retired

They branch and commit in the user's own checkout. The current three do all their work in a git
worktree the run creates, leaving the checkout untouched — see the worktree isolation in
`workflows/supervised-implement.js`. They also predate the preflight in `run-workflow` (validated
args, pinned base branch, dirty-tree confirmation), so a run started from whatever happened to be
checked out branched from it.

## The codex track

Retired as a track, not as a capability. Workflows are written in Claude format from now on, and the
codex package consumes that format directly — so the wrapper that paired a script with a provider
config no longer earns its place.

`run.sh` still works if you need it: it launches scripts by path, so it never depended on skill
registration, and its paths were repointed when it moved here. Its `issue-to-pr` and
`review-supervised` modes still reach the current workflows at the repository root.

Its `fast-issue-to-pr` mode does not work, and won't be fixed. That script resolves its two children
through `workflow('skills:fast-implement')` and `workflow('skills:review-fix-loop')` — registered
names, which no longer exist — so it fails as soon as it reaches the first child. Use `issue-to-pr`.

Its `implement` mode maps to `implement-issue-flow`, not to the current `supervised-implement`; the
codex track never had a mode for the latter.

## Moving something back

These scripts are no longer discovered as `skills:` workflows, so `Workflow()` cannot launch them by
name — `git mv` the file back into `workflows/` first. Expect it to be behind: the invariant-first
planning and root-cause classification added for issue #11 landed across both trees, but nothing
after that point was applied here.
