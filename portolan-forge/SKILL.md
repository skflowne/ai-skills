---
name: portolan-forge
description: "Implement nontrivial or large repository changes through ownership-based delegation, with every root or delegated scope using one primary implementer and three focused, independent reviewers for repository-aligned testing, architecture, and maintainability. Use only when the user explicitly names and requests this skill."
---

# Portolan Forge

Follow `AGENTS.md` and the repository instructions it selects. They define the engineering, testing, validation, and handoff rules. Do not invoke another forge skill.

## Workflow

1. Read the task and repository instructions.
2. Before planning or editing, explore the current implementation end to end. Identify behavior and data flow, existing owners and boundaries, extension points, related shared concepts, repository-prescribed tests, and local conventions. For a large codebase, delegate bounded read-only exploration by concern and synthesize the findings with code references. Resolve material unknowns instead of inferring architecture from names.
3. From that evidence, define the smallest complete change.
4. For a large task, split work into complete, independently verifiable concerns along ownership boundaries. Give every invariant, shared concept, and cross-cutting change one owner. Keep integration work with the root primary or assign it as a foundational concern before dependent work. Do not split by arbitrary file counts or layers.
5. Brief each delegated primary with the original task, relevant repository instructions, explicit scope and non-goals, exploration findings, ownership and interfaces, dependencies, base ref, acceptance evidence, and validation commands. Concurrent writers must use isolated worktrees or equivalent isolated workspaces; otherwise serialize them.
6. Apply this entire workflow recursively to every implementation scope. The root and each delegated scope must use one primary implementer and three independent, read-only reviewer agents. A delegated primary may subdivide a still-large concern under the same rules. Reviewers must not edit the implementation.
7. Implement the concern and run the focused validation required by the repository.
8. Have all three reviewers inspect the scope's complete diff against its base:
   - **Test reviewer:** Apply only the repository's testing strategy. Check that required tests exist at the prescribed level and cover the changed behavior. Do not demand extra test types, frameworks, broad coverage, or test changes the repository does not require.
   - **Architecture reviewer:** Enforce single responsibility, clear ownership, and repository dependency direction. Ensure each invariant and domain concept has one source of truth, with genuinely shared behavior in the appropriate common core. Flag layer bypasses, dependency cycles, leaked internals, duplicated concepts, and parallel implementations that evade established extension points. Preserve boundary contracts unless the task requires changing them. Do not demand abstractions for superficial similarity or redesign outside the changed behavior.
   - **Maintainability reviewer:** Require the smallest necessary diff, no unwarranted scope expansion or incidental churn, and adherence to repository standards. Check local readability, hidden coupling, consistency with established patterns, unnecessary complexity or public API surface, obsolete code exposed by the change, and documentation made inaccurate. Reject speculative cleanup and unrelated refactoring.
9. Require each finding to identify the affected code, concrete impact, and repository evidence. Reject speculative, stylistic, or out-of-scope findings.
10. Have the scope's primary implementer verify every finding, fix valid issues, rerun invalidated checks, and request re-review until no substantive findings remain.
11. Have each delegated primary return its commit or diff, validation evidence, reviewer outcomes, and integration notes. The root primary integrates in dependency order, validates the assembled change, and runs the same three reviews on the complete diff. Delegated reviews do not replace the root review gate.
12. Report the implemented change, validation run, reviewer outcomes, and any residual risk.
