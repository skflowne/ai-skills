---
name: portolan-forge
description: "Implement nontrivial or large repository changes through ownership-based delegation. The main agent implements single-implementor plans and only supervises and integrates multi-implementor plans; every implementor runs its own three focused reviewers for repository-aligned testing, architecture, and maintainability. Use only when the user explicitly names and requests this skill."
---

# Portolan Forge

Follow repository instructions. They own engineering, testing, validation, and handoff rules. Do not invoke another forge skill.

## Plan ownership before delegation

Inspect issue state and discussion, linked work, relevant implementation and tests, repository boundaries and extension points, and related branches, worktrees, commits, and PRs. Use proportional read-only scouts for distinct evidence gaps, but synthesize their concise findings before planning.

Define the smallest complete remaining change and assign every invariant, shared concept, cross-cutting decision, and edit one end-to-end owner. Split by independently verifiable concerns, never arbitrary files or layers. Foundational owners precede dependents.

Choose the topology:

- **One implementer:** implement directly; do not create an implementation child.
- **Multiple implementers:** only plan, delegate, supervise, and integrate. Each child receives the original boundary, repository constraints, scope and non-goals, ownership and interfaces, dependencies, base ref, acceptance evidence, and validation. Isolate concurrent writers; serialize overlapping invariants.

Apply the same rule recursively only when a delegated concern genuinely needs multiple owners. Never create a coordinator with one implementation child merely to reproduce this workflow.

## Implementer contract

Each implementer owns all code and test edits for its concern, reuses established mechanisms, validates proportionally, and then launches exactly three independent fresh read-only reviewers. Every reviewer prompt begins `/skill:pr-review` and contains only the original task boundary, target refs, repository profile, raw validation, one lens below, and no implementation rationale or other report:

- **Tests:** repository testing strategy and whether changed evidence proves required behavior through a useful real path.
- **Architecture:** invariant ownership, dependency direction, extension points, shared concepts, duplication, bypass, and leaked internals.
- **Maintainability:** smallest necessary diff, local clarity, established patterns, hidden coupling, obsolete code, and documentation accuracy.

The canonical review skill owns scope, isolation, evidence, test usefulness, failure scenarios, and fix verification. Lens prompts add focus only and must not restate or weaken it. Run reviewers in parallel and keep reports isolated until all finish.

The implementer verifies every finding against the task, fixes valid issues at the owning seam, reruns invalidated checks, and reuses the same reviewers until clear. It returns its commits or diff, invariant and scope outcome, validation, surviving findings, residual risks, and integration notes. Collapse an all-clear reviewer trio to `Review: clear`; do not repeat three empty reports.

## Integration and handoff

Integrate independently cleared concerns in dependency order and validate the assembled result without repeating implementer reviews. Route behavior-bearing conflict or integration edits to one explicit implementer with its own reviewer trio; the coordinator must not silently author them. Return implemented concerns, base/head and commits, assembled validation, surviving findings, material decisions, and residual risks; omit empty sections and repeated clear verdicts.
