---
name: portolan-forge
description: Run a repository-native, reviewer-gated Portolan implementation. Explicit invocation always activates it; auto-select it only for nontrivial implementation work. It coordinates architecture discovery and human validation, worktree setup, ownership-aware delegation, red-green milestones, independent review, integration, and PR handoff while deferring engineering policy to repository instructions.
---

# Portolan Forge

This skill orchestrates work; it does not define engineering policy. Read `AGENTS.md` and every document it selects for the task (collectively, **repository instructions**). They are the sole authority for implementation, setup, validation, and repository conventions: do not copy their checklists into the plan or replace them with generic forge conventions. This workflow still applies unless the user explicitly overrides it.

Do not invoke another forge skill from this workflow.

## Roles and review gates

Always use:

- one **primary agent and integrator** that owns the working branch, decomposition, integration, and acceptance evidence and remains accountable for the assembled result;
- one persistent, independent, read-only **correctness reviewer** for requirements, ownership, architecture, regressions, and repository compliance; and
- one persistent, independent, read-only **test reviewer** for test strategy, RED evidence, coverage, and validation completeness.

The primary may implement directly or, when useful, delegate complete concerns to optional writer-subagent **implementation workers**. Workers never replace reviewers. Reuse the same reviewers throughout; they advise, and the primary verifies their findings.

A reviewer finding must state a realistic trigger that a real user or caller actually reaches, the mechanism at `file:line`, concrete user impact, and frequency in normal use. For non-user-facing findings, state the realistic future edit and resulting user-visible defect. Drop findings whose only harm is unspecified “unexpected behavior” or whose trigger call sites, types, or validation exclude; the primary rejects them with that reason.

Never summarize intended fixes or steer reviewer conclusions at a review gate. To clear a milestone gate, verify every finding, resolve valid ones through the owner, rerun invalidated evidence, commit corrections cohesively, and request re-review until clear.

## Workflow

### 1. Establish the workspace and contract

1. Resolve the task, repository state, working and base refs, and whether this is issue work. Before editing, complete repository-required preflight and proportional ownership discovery.
2. Unless the user explicitly directs work in the current checkout, create a dedicated branch and worktree from the base and remain there for the run. Do not move or dirty the user's checkout. If worktree creation is unavailable, report the blocker and stop rather than silently falling back.
3. Before implementation planning, follow repository setup: initialize required submodules or toolchains, install dependencies with prescribed commands, run required bootstrap or generation, and perform the cheapest useful baseline check. Do not assume setup artifacts from another checkout are available.
4. Research how the task fits the repository's current and intended architecture. Read the governing engineering and architecture documents selected by repository instructions, then inspect the relevant implementation boundaries. Produce a concise **architecture plan** that states:
   - the problem and every affected invariant;
   - current and proposed owners for state, behavior, and relationships;
   - dependency direction and read, write, optimistic, failure, and refresh flows;
   - transaction, persistence, migration, compatibility, and external-system boundaries;
   - reasonable alternatives with evidence-backed trade-offs and a recommendation; and
   - the observable evidence that will prove the resulting boundaries.
5. Conduct a human architecture interview before milestone planning or production editing. Present the architecture plan, ask focused questions for unresolved choices, and stop until the human explicitly validates a direction. Reviewers and implementation workers cannot supply this approval. If an issue or prior interview already records an approved architecture, map the task to that decision and ask the human to confirm that it remains the governing direction rather than silently treating old text as approval. Do not edit governing architecture documents until the repository's human-approval policy is satisfied.
6. Whenever another repository-defined user decision arises, suspend work, surface it, and wait. The request must concisely state the relevant context, what the work is trying to solve, and the specific decision needed. Reviewers cannot decide it.
7. Before slicing milestones, name every introduced or changed invariant and cross-cutting concern and give each exactly one end-to-end implementation owner across files, layers, and milestones. Do not split ownership for parallelism; merge slices that must change or reason about the same invariant.
8. Plan cohesive, preferably vertical milestones. Give each a coordination label, authoritative owner, acceptance evidence, and review gate. Include conditional migration, documentation, and validation selected by repository instructions. Labels are communication handles, not commit-message prefixes.
9. Brief both reviewers with the original task, refs, approved architecture plan, ownership map, milestone plan, and evidence. Ask them to identify blocking plan gaps or deviations from the approved architecture, and resolve those gaps before implementation.

### 2. Run each milestone

1. Before production editing, have the test reviewer critique the proposed proof.
2. The named owner authors repository-required RED evidence, then implements the smallest complete change. Where RED is not required, use the applicable deterministic proof instead of inventing a failing test.
3. Run focused validation, have the primary inspect the diff, and create a cohesive commit under repository conventions.
4. Give both reviewers the milestone label, commit range, and raw evidence, then clear the milestone review gate.

Do not cross a high-risk seam while its milestone has substantive findings.

### 3. Delegate complete concerns

Delegation follows behavior and ownership, not file counts. Delegate only a complete concern whose single owner can implement and prove it end to end. Cross-cutting work is delegable, but never scatter a rule, migration, shared abstraction, or state invariant across agents.

Before a worker starts, give it the original task, repository instructions, complete plan and ownership map, relevant user decisions, base and working refs, surrounding code and interfaces, acceptance evidence, validation commands, and neighboring design constraints. Never delegate only a file list or one-line objective; require enough adjacent-code inspection to understand the concern before editing.

Sequential delegation needs no separate worktree: a worker may edit the primary worktree only as its sole writer, while the primary and other workers do not edit. Use separate worktrees only for genuinely parallel writers with non-overlapping invariant ownership and paths.

If implementation reveals a shared invariant, interface change, or cross-cutting concern across owners, stop the slice and replan it under one complete owner rather than allowing partial local fixes. The primary integrates and verifies delegated work. After integration, validate the assembled branch; owner-local proof is only milestone evidence.

### 4. Finish

1. Complete the repository-defined final inventory and documentation, inspect diff and status, and run the full local gate.
2. Ask both reviewers to inspect the complete branch against the base with raw final evidence. Resolve substantive findings and rerun every invalidated check before handoff.
3. By default, push the branch and open a PR with repository-required template and linkage. Deviate only when repository instructions or the user require another handoff. Report exact remote or credential blockers rather than claiming completion.
4. Report milestone evidence, final validation, reviewer outcomes, documentation effects, and residual risk.
5. Add a concise **Friction** section recording setup commands and unexpected failures, setup or configuration footguns, misleading guidance, environment surprises, and other wasted round-trips, time, or tokens. Keep intentional RED results with milestone evidence. State `None` when there was no friction.
