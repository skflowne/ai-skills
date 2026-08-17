---
name: paseo-issue-to-pr-lite
description: "Implement a GitHub issue through Paseo with Supervised Forge, then run up to four fresh drift-review-duo rounds whose bounded resolution chunks are handled by steered Supervised Chunk agents. Use only when the user explicitly names and requests this skill."
---

# Paseo Issue to PR Lite

Read and apply [Paseo](../paseo/SKILL.md) and the canonical [issue-to-PR loop](../paseo/references/issue-to-pr-loop.md). Do not preload the leaf skills named below; dispatch them through the path-only prompt transport defined in this profile.

## Workflow profile

- **Implementation skill:** `/skill:supervised-forge`.
- **Fix skill:** `/skill:supervised-chunk`.
- **Review and publication:** `/skill:drift-review-duo` and `github-pr-review`.
- **Issue implementation mutation authority:** push the issue branch and open or update its single discovered PR.
- **Fix mutation authority:** push the cleared temporary branch only; do not open or edit a PR, merge, or integrate other chunks.
- **Required implementation handoff additions:** PR URL and current head SHA, or a concise failure report.
- **Required fixer handoff additions:** explicit scope-control outcome.

## Path-only shared task artifact

This profile uses path-only shared-artifact transport. This section overrides Paseo's default task-envelope requirements and every canonical-loop instruction to pass a synthesis or task brief.

The GitHub issue is the complete semantic task. The controller must not restate, summarize, reinterpret, qualify, expand, or weaken it in any child prompt. It must not add inferred acceptance criteria, implementation choices, validation requirements, repository recommendations, discovery conclusions, or "helpful" caveats. Repository instructions remain directly readable by each agent; a genuine conflict is escalated instead of rewritten into the task.

Before discovery, allocate one absolute shared Markdown path outside every Git worktree and record it in the workflow ledger. Copy [the shared-task artifact template](./references/shared-task-artifact.md) exactly, replace only its placeholders, and add no prose. The template carries the immutable agent protocol, repository identity and root, issue URL, original user request verbatim, and discovery's mechanical dispatch record.

Launch discovery with exactly:

```text
/skill:explore <absolute-shared-artifact-path>
```

Discovery writes its complete evidence to that file: the issue body verbatim, discussion and linked work, relevant code/docs/tests, repository-policy locations, and related branches, worktrees, commits, and PRs. It must not return that evidence inline, synthesize a replacement task, or recommend requirements beyond the issue. Its response is exactly the absolute artifact path.

Before every later launch, append an immutable dispatch record keyed by canonical workspace path and branch. Store all role inputs there, including exact refs, verbatim issue or posted-review content, durable handoffs, mutation authority, and mechanical workspace instructions. Parallel agents receive distinct keyed records. The controller may inspect the artifact for orchestration decisions, but it must never transform artifact content into a child prompt.

Every skilled child prompt is exactly:

```text
/skill:<name> <absolute-shared-artifact-path>
```

An unskilled integrator prompt is exactly the absolute artifact path. Every `paseo send` follow-up is also exactly that path after the controller appends a control record containing only the exact runtime event and a mechanical recovery action, never new task guidance. **Nothing else may appear in any child prompt or follow-up.** All agents append their handoff to the shared file and return only its path, keeping discovery and workflow state available to every later agent without supervisor-authored restatement.

The user preauthorizes implementation, review, fix, and publication decisions. Escalate only a genuine product or repository-policy decision that evidence cannot resolve, or a significant scope increase.

When `supervised-forge` or `supervised-chunk` reports that required work exceeds the canonical boundary, launch one judge to identify the correct solution with the smallest justified expansion. Report the expansion and rationale immediately through Paseo notification; do not let the active writer absorb it silently.

After each `paseo wait` completion and every runtime progress or control event, inspect for stalls, loops, scope growth, or drift and send a concise progress notification when state materially changes. Do not add polling, sleeps, or timeouts. If work clearly drifts from the issue, stop the workflow and notify the human.

## Review and recovery deltas

Run each duo read-only against the exact assembled range. Publishing its canonical consolidated `COMMENT` review is preauthorized. Keep dropped candidates and intermediate analysis internal; use the canonical concise output (`No findings.` when clear).

Resume a failed review agent rather than replacing it. Read the uniquely posted review directly and never publish or request a second copy. If the same reviewer cannot produce one verifiable posted review after Paseo recovery, preserve its logs and stop as an infrastructure blocker.

Do not add a solo review after fix chunks; their persistent supervision is internal evidence, while the next branch-wide gate is the fresh assembled duo. Repeated findings against one invariant in rounds 1–3 go to one reconciliation owner rather than another local patch.

## Profile-specific final report

The canonical final report includes duo permalinks. Add a scope-control outcome only when it changed the accepted implementation boundary; normal scope compliance is not reportable.
