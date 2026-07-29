---
name: paseo-issue-to-pr-lite
description: Implement a GitHub issue through Paseo with Supervised Forge, then repeat fresh drift-review-duo rounds whose worthwhile agent-sized chunks are each handled by one steered Supervised Chunk agent until a duo finds nothing valuable left.
---

# Paseo Issue to PR Lite

Own an issue through a verified open PR with bounded agent contexts. Use [paseo](../paseo/SKILL.md) for every workspace, [supervised-forge](../supervised-forge/SKILL.md) for the initial implementation, [supervised-chunk](../supervised-chunk/SKILL.md) for every fix chunk, [drift-review-duo](../drift-review-duo/SKILL.md) for assembled-branch reviews, and [github-pr-review](../github-pr-review/SKILL.md) to publish each review round.

The user preauthorizes this workflow to make implementation, review, and fix decisions. Do not request approval unless work reaches a genuine product or repository-policy decision that repository evidence cannot resolve. Stop only for a hard external blocker, unsafe irreversible action outside the requested issue/PR lifecycle, or ambiguous live-writer state that remains after Paseo recovery.

Keep contexts bounded:

- retire the initial implementer after it opens the PR and returns a compact handoff;
- use a fresh duo-review agent for every assembled review round;
- give each worthwhile resolution chunk to exactly one fresh supervised fixer;
- use a fresh integrator for each review round rather than reviving the initial implementer; and
- pass compact structured handoffs and artifact paths, never accumulated transcripts or repeated raw logs.

Never allow more than one active writer in a workspace or more than one owner for an invariant.

## 1. Preflight

Require an issue number. Resolve the repository, authenticated GitHub identity, default or explicitly stacked base, clean-tree state, active Paseo agents, existing worktrees, repository instructions, and current `paseo run --help`. Inspect facts rather than asking for information that can be retrieved.

Follow Paseo's ambiguous-state recovery before reusing a workspace, replacing an agent, or retrying a failed command. A Paseo status label alone does not prove that a provider or child process stopped. Never queue a follow-up and launch a replacement for the same work.

Maintain a workflow ledger outside committed source containing every workflow-created agent and workspace, including failed launches, with its ID, canonical path, branch, role, base/head SHA, and lifecycle state.

## 2. Initial supervised implementation

Create one Paseo worktree and issue branch from the selected committed base. Launch one agent whose prompt begins with `/skill:supervised-forge` and explicitly requires it to:

- implement the complete issue;
- use the Paseo-created worktree without creating a nested worktree;
- resolve repository-defined decisions as required by repository instructions;
- validate, push the issue branch, and open its single PR; and
- return a compact handoff containing the issue, PR URL and number, base and head SHAs, commits, changed invariants, validation, decisions, residual risks, and artifact paths.

Wait for completion and verify the PR, branch, validation, and handoff. Then definitively retire the implementation agent. Before assigning another writer to its workspace, prove that no provider or child process remains, the tree is clean, and local and remote issue-branch tips match.

## 3. Fresh assembled duo review

For every review round, fetch the latest PR head and create a fresh, isolated, clean Paseo review worktree at that exact commit. Verify its canonical path differs from every writer workspace before launching anything in it.

Launch one foreground review agent with a supported output schema. Its prompt invokes `/skill:drift-review-duo`, forbids editing or posting to GitHub, and includes the PR number, base and head SHAs, original issue, acceptance criteria, repository profile, and assembled validation as the explicit target and review intent. Require structured findings. Every verified finding must include:

- identifier, severity, and classification;
- realistic trigger, mechanism, impact, and evidence;
- affected invariant and paths;
- dependencies or overlap with other findings; and
- a cohesive resolution chunk sized for one agent, with acceptance evidence and explicit neighboring scope it must not absorb.

The duo may combine findings only when one agent can own the combined invariant end to end. It must not combine unrelated findings merely to reduce agent count.

Adjudicate the output rather than accepting it mechanically. For this workflow, worthwhile wrong-seam findings become current-PR resolution chunks; this explicitly overrides `drift-review-duo`'s default follow-up-issue handoff because the workflow is responsible for fixing worthwhile work before completion.

- verified user-facing bugs are worthwhile;
- wrong-seam fixes or refactors with concrete evidence that they prevent likely defects are worthwhile;
- speculative, duplicate, disproven, unrelated, or already-recorded findings are not work; and
- other findings require a concrete fix-versus-defer trade-off, recorded concisely.

A round is clear only when no verified worthwhile findings remain.

Publish the round through `github-pr-review` as one `COMMENT` review before starting its fixers. Include the final agent-sized chunk plan and concise reasons for dropped candidates, not raw reviewer output. For a clear round, post `Fix plan: None`.

## 4. Run one steered fixer per chunk

For every worthwhile resolution chunk, create exactly one fresh Paseo worktree, branch, and fixer agent. Each prompt begins with `/skill:supervised-chunk` and includes:

- the original issue and PR;
- review permalink and round number;
- exact chunk identifier, finding evidence, owned invariant, affected paths, and acceptance evidence;
- its base SHA and intended relationship to the issue branch;
- dependencies and neighboring chunks it must not absorb; and
- relevant repository decisions and constraints.

Require the fixer to:

- use the Paseo-created worktree without creating a nested worktree;
- implement this chunk continuously rather than pre-slicing it into milestones;
- use one persistent read-only reviewer for event-driven in-progress checks, evidence-backed steering, and final clearance;
- keep every checkpoint and correction inside the exact chunk contract;
- commit and push the cleared chunk branch;
- avoid opening another PR, editing the existing PR, merging, or integrating other chunks; and
- return a compact handoff with base/head SHAs, commits, invariant, validation, checkpoint steering and decisions, final reviewer outcome, and artifact paths.

Do not run another solo review after all chunks finish. Independent solo supervision happens inside each `supervised-chunk` run; the next branch-wide review is the assembled duo.

### Scheduling

Validate the duo's proposed chunk boundaries before launch.

- Chunks may run in parallel only when they share neither invariant, dependency, likely paths, nor integration decision, and all start from the same current issue-branch tip.
- Dependent or overlapping chunks run in waves. Integrate and validate prerequisites before creating downstream branches from the updated issue-branch tip.
- If a chunk discovers shared ownership or scope overlap, stop it and regroup the affected work under one supervised owner rather than letting multiple agents patch the same invariant.

## 5. Integrate the cleared chunks

After the initial implementer is retired, launch one fresh integrator for the current review round in the original issue workspace. Give it only the current issue-branch SHA, cleared chunk handoffs, merge order, repository constraints, and required assembled validation.

The integrator is the issue workspace's sole writer. It must:

- verify every chunk was independently cleared and still descends from its declared base;
- integrate only the approved commits in dependency order;
- run focused checks after each dependency wave and assembled validation after all selected chunks are in;
- push the updated issue branch; and
- return a compact integration handoff and decision log.

The integrator must not invent a large conflict resolution. A conflict that reveals shared invariant ownership or invalid independence returns the affected work to one fresh `supervised-chunk` reconciliation agent. Once all chunks and dependency waves are integrated and validated, retire the integrator using Paseo's process-level checks.

## 6. Repeat until nothing valuable remains

Run a fresh full `drift-review-duo` against the assembled PR after all selected chunks are integrated. Never substitute per-chunk reviews for this assembled check.

- If the duo finds worthwhile work, publish its chunk plan and repeat `supervised-chunk` dispatch, integration, assembled validation, and a fresh duo.
- If the duo finds nothing worthwhile, verify required CI and leave the PR open for human review.

Do not impose an arbitrary review-round limit. Repeated findings against the same invariant are evidence of a wrong seam: assign one `supervised-chunk` reconciliation agent to the invariant rather than stacking another local guard. Stop only when the PR is clear by the worthwhile-work standard or a hard blocker prevents safe progress.

## 7. Final handoff and cleanup

Post or update one concise final PR comment containing:

- validation and CI results;
- duo rounds and review permalinks;
- integrated chunk IDs and commits;
- deferred findings and reasons;
- material decisions; and
- residual risks.

Never merge, enable auto-merge, or replace the PR body.

Reconcile every workflow-owned agent and workspace, including failed launches. Verify no obsolete provider or child process remains active, no workspace has multiple writers, retained paths are unique, the issue branch is clean, and local and remote tips match. Preserve branches and evidence for any hard blocker instead of hiding or deleting ambiguous state.
