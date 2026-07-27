---
name: portolan-forge
description: Run a Portolan implementation as a repository-native, reviewer-gated workflow. Explicit invocation always activates it; auto-select it only for nontrivial implementation work. It defers engineering policy to Portolan's canonical instructions while coordinating planning, red-green milestones, persistent independent review, integration, and conditional PR handoff.
---

# Portolan Forge

This skill orchestrates work; it does not define Portolan policy. Read `AGENTS.md` and every document it selects for the task, and treat their current contents as the sole authority. Do not copy their checklists into the plan or replace them with generic forge conventions. If this skill differs from the repository, follow the repository.

Do not invoke another forge skill from this workflow.

## Roles

Use one primary author and integrator plus two persistent, independent, read-only reviewers:

- a **correctness reviewer** for requirements, ownership, architecture, regressions, and repository compliance;
- a **test reviewer** for test strategy, RED evidence, coverage, and validation completeness.

Reuse the same reviewers throughout. They advise; the primary verifies findings and owns the branch and acceptance evidence.

Every reviewer finding must carry a realistic failure scenario: the trigger a real user or caller actually reaches, the mechanism at the cited `file:line`, and the real-world impact on the user (what they lose, see wrong, cannot do, or are exposed to), plus how often that state occurs in normal use. Findings that are not user-facing name instead the realistic edit that will go wrong and the user-visible defect that ships as a result. A finding whose harm is only "could cause unexpected behavior," or whose trigger the call sites, types, or validation already exclude, is dropped rather than downgraded — and the primary rejects it with that reason if it arrives anyway.

## Workflow

### 1. Establish the contract

1. Resolve the task, repository state, working/base refs, and whether this is issue work. Complete the preflight and proportional ownership discovery required by the repository before editing.
2. Surface any repository-defined user decision and wait for the user's answer. Reviewers cannot decide it on the user's behalf.
3. Plan cohesive, preferably vertical milestones. Give each a coordination label, authoritative owner, acceptance evidence, and review gate. Include conditional migration, documentation, and validation work selected by the repository instructions.
4. Brief both reviewers with the original task, refs, plan, and ownership evidence. Ask them to identify blocking plan gaps before implementation.

Milestone labels are communication handles only, never commit-message prefixes.

### 2. Run each milestone

1. Have the test reviewer critique the proposed proof before production editing.
2. The primary authors the repository-required RED evidence, then implements the smallest complete change through the named owner. For work where the repository does not require RED, use the applicable deterministic proof instead of inventing a failing test.
3. Run focused validation, inspect the milestone diff, and create a cohesive commit under repository commit conventions.
4. Give both reviewers the milestone label, commit range, and raw evidence. Do not summarize intended fixes or steer their conclusions.
5. Verify every finding. Resolve valid findings through the owner, repeat invalidated evidence, commit cohesively, and request re-review until the milestone is clear.

Do not advance across a high-risk seam while its milestone has substantive findings. A newly discovered user decision suspends the workflow until the user responds.

### 3. Delegate only proven-independent slices

Default to one writer and use subagents for read-only discovery and review. Delegate implementation only when the plan and repository rules establish non-overlapping ownership and safe worktree isolation. The primary retains cross-cutting work, integration, and end-to-end acceptance. Shared work discovered inside a slice returns to the primary rather than expanding the slice.

Validate the assembled branch after integration; slice-local evidence is only milestone evidence.

### 4. Finish

1. Complete the repository-defined final inventory, documentation, diff/status inspection, and full local gate.
2. Ask both persistent reviewers to inspect the complete branch against the base with the raw final evidence.
3. Resolve substantive findings and rerun every invalidated check before handoff.
4. If this is issue work, complete the repository-required branch and PR handoff. Otherwise, do not publish or create external state unless the user requested or authorized it.
5. Report milestone evidence, final validation, reviewer outcomes, documentation effects, and residual risk.
