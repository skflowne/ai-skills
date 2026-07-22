---
name: code-quality-review
description: Review a PR, diff, commit, or selected files for maintainability and code quality. Use to find unnecessary complexity, duplication, weak abstractions, poor naming, hidden coupling, inconsistent patterns, and testability problems while avoiding speculative or purely stylistic feedback.
---

# Code Quality Review

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
- **Testability:** designs that make meaningful behavior difficult to isolate or verify
- **Changeability:** scattered policy, hard-coded assumptions, and extension points that require unrelated edits
- **Dead weight:** unreachable code, obsolete compatibility paths, redundant comments, unused parameters, or needless dependencies

Treat correctness, performance, and security findings as in scope only when they arise directly from a quality defect. Use a dedicated reviewer for comprehensive coverage of those domains.

## Evidence standard

Every finding must:

- Point to specific file and line locations.
- Explain the concrete maintenance cost or likely failure mode.
- Show why the current repository context makes it a problem.
- Propose the smallest reasonable improvement.

Do not report:

- Personal style preferences already handled by formatters or linters
- Hypothetical future needs without present evidence
- Large rewrites when a local simplification is sufficient
- Generic requests to add comments, tests, or abstractions
- Findings based only on a code snippet when call sites or nearby patterns could resolve the concern
- Praise or summaries of what works unless explicitly requested

Before reporting, try to disprove each finding by checking call sites, tests, types, and repository conventions. Drop weak or speculative concerns.

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

Explain the evidence, maintenance impact, and smallest practical fix.
```

If there are no actionable findings, say so plainly and mention any verification limitations. Keep the report focused; do not produce a general code walkthrough.
