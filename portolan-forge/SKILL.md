---
name: portolan-forge
description: Run a Portolan implementation as a repository-native, reviewer-gated workflow. Explicit invocation always activates it; auto-select it only for nontrivial implementation work. It defers engineering policy to Portolan's canonical instructions while coordinating worktree setup, ownership-aware delegation, red-green milestones, persistent independent review, integration, and PR handoff.
---

# Portolan Forge

This skill orchestrates work; it does not define Portolan engineering policy. Read `AGENTS.md` and every document it selects for the task, and treat their current contents as the sole authority for implementation, setup, validation, and repository conventions. Do not copy their checklists into the plan or replace them with generic forge conventions. The workflow requirements in this skill still apply unless the user explicitly overrides them.

Do not invoke another forge skill from this workflow.

## Roles

Always use these core roles:

- one **primary agent and integrator** that owns the working branch, decomposition, integration, and acceptance evidence;
- one persistent, independent, read-only **correctness reviewer** for requirements, ownership, architecture, regressions, and repository compliance; and
- one persistent, independent, read-only **test reviewer** for test strategy, RED evidence, coverage, and validation completeness.

The primary may additionally delegate complete implementation concerns to **implementation workers** when useful. Workers are writer subagents, not reviewers, and do not replace either required reviewer. The primary may also implement concerns itself. Reuse the same two reviewers throughout; they advise, while the primary verifies findings and remains accountable for the assembled result.

Every reviewer finding must carry a realistic failure scenario: the trigger a real user or caller actually reaches, the mechanism at the cited `file:line`, and the real-world impact on the user (what they lose, see wrong, cannot do, or are exposed to), plus how often that state occurs in normal use. Findings that are not user-facing name instead the realistic edit that will go wrong and the user-visible defect that ships as a result. A finding whose harm is only "could cause unexpected behavior," or whose trigger the call sites, types, or validation already exclude, is dropped rather than downgraded — and the primary rejects it with that reason if it arrives anyway.

## Workflow

### 1. Establish the workspace and contract

1. Resolve the task, repository state, working/base refs, and whether this is issue work. Complete the preflight and proportional ownership discovery required by the repository before editing.
2. Unless the user explicitly directs work in the current checkout, create a dedicated branch and worktree from the resolved base and continue the entire run there. Do not move or dirty the user's checkout. If worktree creation is unavailable, stop and surface the blocker rather than silently falling back to the current checkout.
3. Set up the working tree from its repository instructions before planning implementation: initialize required submodules or toolchains, install dependencies with the repository-prescribed commands, run any required bootstrap or generation step, and perform the cheapest useful baseline check. Do not assume setup artifacts from another checkout are available. Record setup commands and unexpected failures for the final friction report.
4. Surface any repository-defined user decision and wait for the user's answer. Reviewers cannot decide it on the user's behalf.
5. Name every invariant and cross-cutting concern the task introduces or changes before slicing milestones. Assign each exactly one implementation owner end to end. Ownership follows the concern across files, layers, and milestones; never split it merely to create parallel work. If two proposed slices must change or reason about the same invariant, merge them under one owner.
6. Plan cohesive, preferably vertical milestones. Give each a coordination label, authoritative owner, acceptance evidence, and review gate. Include conditional migration, documentation, and validation work selected by the repository instructions.
7. Brief both reviewers with the original task, refs, plan, invariant and cross-cutting ownership, and ownership evidence. Ask them to identify blocking plan gaps before implementation.

Milestone labels are communication handles only, never commit-message prefixes.

### 2. Run each milestone

1. Have the test reviewer critique the proposed proof before production editing.
2. The named implementation owner authors the repository-required RED evidence, then implements the smallest complete change. For work where the repository does not require RED, use the applicable deterministic proof instead of inventing a failing test.
3. Run focused validation, have the primary inspect the milestone diff, and create a cohesive commit under repository commit conventions.
4. Give both reviewers the milestone label, commit range, and raw evidence. Do not summarize intended fixes or steer their conclusions.
5. Verify every finding. Resolve valid findings through the owner, repeat invalidated evidence, commit cohesively, and request re-review until the milestone is clear.

Do not advance across a high-risk seam while its milestone has substantive findings. A newly discovered user decision suspends the workflow until the user responds.

### 3. Delegate with complete ownership and context

Implementation workers are optional. Use them when they improve the work and a cohesive invariant or concern has a clear single owner who can receive enough context to complete and prove it end to end. Delegation boundaries follow behavior and ownership, not file counts. Cross-cutting work is delegable, but one agent must own the whole concern wherever it reaches; do not scatter one rule, migration, shared abstraction, or state invariant across agents.

Before a worker starts, give it the original task, canonical repository instructions, the complete plan and ownership map, relevant user decisions, base and working refs, surrounding code and interfaces, acceptance evidence, and validation commands. Include neighboring concerns that constrain its design even when it does not own them. Never delegate with only a file list or a one-line objective, and require the worker to inspect enough adjacent code to understand the full concern before editing.

Worktree isolation is not required for sequential delegation. A worker may edit the primary worktree when it is the only writer; the primary and other workers must not edit concurrently. Use separate worktrees only for genuinely parallel writers, and only when their invariant ownership and paths do not overlap. The primary integrates and verifies all delegated work.

If implementation reveals that a slice shares an invariant, interface change, or cross-cutting concern with another owner's work, stop that slice and replan. Give the expanded concern to one owner in full rather than letting either agent make a partial local fix.

Validate the assembled branch after integration; owner-local evidence is only milestone evidence.

### 4. Finish

1. Complete the repository-defined final inventory, documentation, diff/status inspection, and full local gate.
2. Ask both persistent reviewers to inspect the complete branch against the base with the raw final evidence.
3. Resolve substantive findings and rerun every invalidated check before handoff.
4. Push the completed branch and open a PR using the repository's required template and linkage. Treat use of this implementation workflow as authorization for that handoff unless the user explicitly says not to publish. If the remote, credentials, or repository policy prevents a PR, report the exact blocker rather than claiming completion.
5. Report milestone evidence, final validation, reviewer outcomes, documentation effects, and residual risk.
6. Add a concise **Friction** section listing unexpected failed commands, setup or configuration footguns, misleading repository guidance, environment surprises, and anything else that caused round-trips, wasted time, or wasted tokens. Keep intentional RED results with the milestone evidence rather than repeating them as friction. State `None` when nothing tripped up the run.
