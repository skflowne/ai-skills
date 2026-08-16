---
name: code-quality-review
description: "Review a PR, diff, commit, or selected files for maintainability and code quality, finding unnecessary complexity, duplication, weak abstractions, poor naming, hidden coupling, inconsistent patterns, and testability problems while avoiding speculative or purely stylistic feedback. Use only when the user explicitly names and requests this skill."
---

# Code Quality Review

Read and apply the canonical review contract in [pr-review](../pr-review/SKILL.md). This skill adds a maintainability lens but does not weaken its scope, evidence, fix-verification, isolation, or test-usefulness standards.

Review code for long-term maintainability. Report only actionable problems supported by concrete evidence.

## Scope

Accept any of:

- A pull request number or URL
- A commit or revision range
- A local working-tree diff
- Explicit files or directories

If the target is ambiguous, stop and ask what to review. For a PR, read the PR description, linked issue, repository guidance, and full diff before judging design choices.

## Review process

1. Establish the intended behavior and constraints.
2. Read repository instructions and nearby code to learn existing conventions.
3. Inspect the complete change, including tests and call sites.
4. Trace important data and control flow far enough to verify each concern.
5. Run focused tests, linters, or static checks when they can confirm or reject a finding.
6. Check whether the concern already exists outside the change. Do not attribute pre-existing debt to the author unless the change materially worsens it.

## Quality lenses

Prioritize these areas:

- **Simplicity:** unnecessary indirection, branching, configuration, state, or abstractions
- **Duplication:** repeated business rules or logic that can drift; do not demand abstraction for incidental similarity
- **Cohesion:** modules and functions with mixed responsibilities or changes for unrelated reasons
- **Coupling:** hidden dependencies, leaky boundaries, global state, fragile ordering, or knowledge of internals
- **Abstractions:** abstractions that are premature, misleading, overly generic, or missing where a stable concept is repeated
- **Clarity:** names, types, control flow, and APIs that obscure intent or permit invalid states
- **Consistency:** unjustified divergence from established repository patterns
- **Testability:** designs that make meaningful required behavior difficult to isolate or verify; tautological tests, implementation-derived oracles, mocks that bypass the claimed path, and production hooks added solely for tests
- **Changeability:** scattered policy, hard-coded assumptions, and extension points that require unrelated edits
- **Dead weight:** unreachable code, obsolete compatibility paths, redundant comments, unused parameters, or needless dependencies

Treat correctness, performance, and security findings as in scope only when they arise directly from a quality defect. Use a dedicated reviewer for comprehensive coverage of those domains.

## Evidence standard

Every finding must:

- Point to specific file and line locations.
- Carry a **realistic failure scenario**, per the standard in [pr-review](../pr-review/SKILL.md). Quality findings are rarely user-facing, and that is not an exemption — the affected party is the next person to change this code. Name the realistic edit they will make, what silently breaks or is missed when they make it, and the user-visible defect that reaches production as a result. "This is duplicated," "this is hard to follow," or "this couples two modules" without that chain is a style opinion, not a finding.
- State plausibility: is this edit one someone will make in the normal course of work on this area, or one that requires an unlikely turn? Say which.
- Show why the current repository context makes it a problem.
- Propose the smallest reasonable improvement.

Do not report:

- Personal style preferences already handled by formatters or linters
- Hypothetical future needs without present evidence
- Findings whose only stated harm is "could cause unexpected behavior," "is not ideal," or "may break in the future" — if you cannot name what breaks and for whom, drop the finding rather than hedging it or filing it as Low
- Large rewrites when a local simplification is sufficient
- Generic requests to add comments, tests, or abstractions
- Findings based only on a code snippet when call sites or nearby patterns could resolve the concern
- Praise or summaries of what works unless explicitly requested

Before reporting, try to disprove each finding by checking call sites, tests, types, and repository conventions. Apply the canonical test-usefulness standard to every test concern: name the protected user/caller behavior or core invariant and the realistic regression the test should catch. Drop weak, generic, or speculative concerns; do not replace a useless test with more infrastructure unless required behavior actually needs it.

## Severity

- **High:** structural flaw likely to cause repeated defects, dangerous coupling, or major maintenance cost
- **Medium:** concrete complexity, duplication, or design issue that will impede foreseeable changes
- **Low:** localized clarity or maintainability issue worth fixing in this change

Avoid severity inflation. Most code-quality findings are Medium or Low.

## Output

List verified findings in severity order:

```markdown
## Findings

### [Medium] Concise problem title
`path/to/file.ts:42-58`

Explain the evidence, then the realistic failure scenario: the edit someone will make, what breaks
or is silently missed when they make it, the user-visible defect that results, and how likely that
edit is. Close with the smallest practical fix.
```

Follow the canonical concise output contract. If there are no actionable findings, return `No findings.` plus only material validation or limitations. Do not add a code walkthrough, clean-area summary, rejected concerns, or empty plan sections.

When posting findings to a GitHub PR, follow [github-pr-review](../github-pr-review/SKILL.md): use one consolidated review body rather than inline comments, and group the resolution work into chunks sized for one agent. Always post the review as a normal comment (`COMMENT`), never as a request for changes (`REQUEST_CHANGES`).
