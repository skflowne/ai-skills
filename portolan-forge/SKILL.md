---
name: portolan-forge
description: "Implement nontrivial or large repository changes through ownership-based delegation. The main agent implements single-implementor plans and only supervises and integrates multi-implementor plans; every implementor runs its own three focused reviewers for repository-aligned testing, architecture, and maintainability. Use only when the user explicitly names and requests this skill."
---

# Portolan Forge

Follow `AGENTS.md` and the repository instructions it selects. They define the engineering, testing, validation, and handoff rules. Do not invoke another forge skill.

## Workflow

1. Read the task and repository instructions. If the task is an issue, first verify the issue state, discussion, linked issues and PRs, and all relevant existing work across the codebase, local/remote branches, worktrees, commits, and open/closed/draft PRs. A small read-only scout fleet is advised when the history or repository state is nontrivial, sized proportionally to the task. Give each scout one bounded concern (issue context, codebase status, or branch/PR state) and require a concise, evidence-backed summary with only key state, exact references, and remaining-work implications—not raw logs or full transcripts. Use fewer scouts for narrow work and none when one quick pass is enough. Synthesize the summaries before planning; never assume the issue is untouched or that a fresh implementation is required.
2. Before planning or editing, explore the current implementation end to end. Identify behavior and data flow, existing owners and boundaries, extension points, related shared concepts, repository-prescribed tests, and local conventions. For a large codebase, delegate bounded read-only exploration by concern and synthesize the findings with code references. Resolve material unknowns instead of inferring architecture from names.
3. From that evidence, define the smallest complete remaining change and the number of implementation owners it needs.
4. Choose the execution topology from the plan:
   - **One implementer:** The main agent implements directly and creates and manages its own three reviewer agents. Do not spawn an implementation subagent.
   - **Multiple implementers:** The main agent only plans, delegates, supervises, and integrates. It does not implement or run root reviewers. Each delegated implementer creates and manages its own three reviewer agents.
5. For multiple implementers, split work into complete, independently verifiable concerns along ownership boundaries. Give every invariant, shared concept, and cross-cutting change one owner. Assign foundational concerns before dependent work. Do not split by arbitrary file counts or layers.
6. Brief each delegated implementer with the original task, relevant repository instructions, explicit scope and non-goals, exploration findings, ownership and interfaces, dependencies, base ref, acceptance evidence, and validation commands. Concurrent writers must use isolated worktrees or equivalent isolated workspaces; otherwise serialize them.
7. Apply the same topology recursively when a delegated concern still needs multiple implementers. Every edit must have one explicit implementation owner; never create a coordinator with a single implementation child merely to reproduce this workflow.
8. Each implementer implements its concern and runs the focused validation required by the repository.
9. Each implementer has its own three independent, read-only reviewer agents inspect its completed diff. Reviewers must not edit the implementation:
   - **Test reviewer:** Apply only the repository's testing strategy. Check that required tests exist at the prescribed level and cover the changed behavior. Do not demand extra test types, frameworks, broad coverage, or test changes the repository does not require.
   - **Architecture reviewer:** Enforce single responsibility, clear ownership, and repository dependency direction. Ensure each invariant and domain concept has one source of truth, with genuinely shared behavior in the appropriate common core. Flag layer bypasses, dependency cycles, leaked internals, duplicated concepts, and parallel implementations that evade established extension points. Preserve boundary contracts unless the task requires changing them. Do not demand abstractions for superficial similarity or redesign outside the changed behavior.
   - **Maintainability reviewer:** Require the smallest necessary diff, no unwarranted scope expansion or incidental churn, and adherence to repository standards. Check local readability, hidden coupling, consistency with established patterns, unnecessary complexity or public API surface, obsolete code exposed by the change, and documentation made inaccurate. Reject speculative cleanup and unrelated refactoring.
10. Require each finding to identify the affected code, concrete impact, and repository evidence. Reject speculative, stylistic, or out-of-scope findings.
11. Have the implementer verify every finding, fix valid issues, rerun invalidated checks, and request re-review from the same reviewers until no substantive findings remain.
12. Have each delegated implementer return its commit or diff, validation evidence, reviewer outcomes, and integration notes. The main agent integrates cleared concerns in dependency order and validates the assembled change without repeating reviews. Route any required integration or conflict-resolution code changes to an explicit implementer, who runs its own reviewer trio; the main agent must not silently implement them.
13. Report the implemented change, validation run, reviewer outcomes, and any residual risk.
