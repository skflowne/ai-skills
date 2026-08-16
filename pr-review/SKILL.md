---
name: pr-review
description: "Canonical code-review contract and PR review skill. Use only when the user explicitly names and requests this skill."
---

# PR Review — canonical contract

This is the canonical contract for every review skill in this repository. Wrappers may add topology, specialist lenses, classifications, or publication mechanics, but every reviewer and fix verifier must apply this contract and no wrapper may weaken it.

When this skill is invoked directly, review the specified PR. If no PR is specified, stop and ask for it. Wrapper skills may apply this contract to an explicit branch, commit range, diff, or file target.

## Goals
- Validate correctness and ensure shipped code actually works as intended.
- Ensure tests are meaningful in preventing regressions and ensuring core software features are stable.
- Keep the codebase maintainable and avoid unnecessary complexity from piling up.

Every rule exists to serve these goals, do not blindly follow the rules if in the specific situation it would contradict the goals.

## Establish the review boundary

1. Fetch the target, linked issue and discussion, repository instructions, base and head refs, and relevant code and tests.
2. Treat the original task, acceptance criteria, and repository policy as authoritative and defining the full scope of the task and eventual fixes.
3. Review whether the change is a complete and correct implementation inside that boundary. Do not invent adjacent requirements, product behavior, compatibility work, abstractions, dependencies, cleanup, or test infrastructure.
4. A reviewer may require credible evidence for behavior the task actually requires. That does not authorize adding production APIs, environment branches, lifecycle hooks, dependencies, or other application code solely to make the review easier.
5. If a concern cannot be verified, report the verification limitation. Uncertainty is not a finding and must not be converted into speculative work.

## Reviewer isolation

Each reviewer must investigate independently.

- Start from fresh context containing only the target refs, original intent and acceptance criteria, repository profile, and the reviewer's bounded focus.
- Do not give a reviewer the author's rationale, intended fix, prior reviewer reports, candidate findings, expected verdict, or another reviewer's analysis.
- Parallel reviewers must not see one another's output before they finish. Only the synthesizer receives completed reports.
- Raw validation output may be supplied as evidence, but green output is not proof that assertions are useful or that the implementation is at the correct seam.
- A synthesizer adjudicates completed reports; it does not echo consensus or preserve a finding merely because another reviewer already stated it.

A fix re-review is not finding-closure bookkeeping. Inspect the fix diff against the pre-fix revision and the original requirement. Re-evaluate whether the finding was valid, whether the implementation is correct, whether the invariant now has the right owner, whether the change stayed in scope, and whether the tests prove behavior rather than the chosen implementation. Retract an invalid finding. Reclassify a symptom patch as wrong-seam work. A finding is resolved only by a correct implementation, not by code that satisfies the wording of the comment.

## Test usefulness standard

Review every added or modified test for regression-prevention value, not for the presence of test files or passing output. A useful test must satisfy all of these:

1. **Required behavior:** It protects behavior, a user/caller path, or core logic that the task or repository actually requires.
2. **Real path:** It exercises the real interface at the lowest level that still proves the invariant. Mocks and fixtures must not bypass the behavior being claimed.
3. **Regression sensitivity:** Name a realistic implementation regression that breaks the protected behavior and would make this test fail for the relevant reason. When practical, prove sensitivity with RED evidence or a focused mutation. If no plausible behavioral regression makes the test fail, the test is not useful.
4. **Independent oracle:** Expected values must be independent of the implementation value under test. A fixture populated from an imported constant and then compared with that same constant is tautological. Recomputing the result with the production algorithm is equally invalid.
5. **Observable assertion:** Assertions verify externally observable behavior or the owning core-logic contract, not private structure, incidental calls, snapshots without semantic assertions, or the test's own setup.
6. **Production purity:** Test support stays in test harnesses. Reject test-only branches, environment flags, magic log tokens, forced lifecycle changes, DOM probes, or exported internals added to production code merely so a test can inspect or terminate the application. An existing explicit test seam may be reused only when it is already part of the repository design and does not alter the behavior under test.
7. **Proportionality:** The test adds no framework, broad harness, public API, compatibility layer, or unrelated coverage beyond what is needed to protect the required behavior.

Do not ask for tests merely because code, types, constants, configuration, or files were added. Static type declarations are normally validated by typechecking; constants do not need runtime tests unless they participate in a real runtime contract such as parsing, serialization, migration, or externally visible behavior. Do not create a fake runtime assertion for compile-time structure.

A missing-test finding is valid only when the reviewer identifies the required behavior or core invariant, the realistic regression that would escape the current suite, the appropriate test level, and the user/caller impact. “Add tests,” “increase coverage,” and “this is untested” are not findings.

## Finding evidence standard

For every finding, provide:

- a concise description;
- exact evidence such as `file:line`, a focused test result, a verified call path, repository history, or authoritative documentation; and
- a realistic failure scenario meeting the standard below.

Try to disprove the concern by checking call sites, types, validation, tests, and repository conventions. Do not report style preferences, hypothetical misuse, or behavior outside the review boundary.

### Failure scenario standard

A finding without a realistic failure scenario is not a finding. Write each scenario in four parts:

1. **Trigger** — concrete conditions a real user or caller reaches, with inputs and state.
2. **Mechanism** — what the code does wrong at the cited location.
3. **Real-world impact** — what someone loses, sees wrong, cannot complete, or is exposed to.
4. **Plausibility** — how the state occurs in normal use and how often.

Reject and drop scenarios that reduce to “could cause unexpected behavior,” “is not ideal,” “may break in the future,” or “a caller might misuse this.” Reject triggers excluded by call sites, types, or validation and impacts that cannot be stated concretely.

For non-user-facing findings, the affected party is the next developer changing the code: name the realistic edit, what silently breaks or is missed, and the user-visible defect that ships. Test findings additionally use the test usefulness standard: a tautology or production test hook is evidenced by showing why the test cannot detect the claimed regression or why the proof lives at the wrong seam; do not invent extra product behavior to justify removing it.

## Review output contract

Report decisions, not the review process. Do not include reviewer-by-reviewer summaries, clean-area walkthroughs, rejected-candidate analysis, or repeated statements that the target is clear.

When no findings survive, the complete result is:

```markdown
No findings.

Validation: <only material checks, if useful>
Limitations: <only material unverified behavior, if any>
```

Omit lines that add no useful information. Summarize routine passing checks rather than dumping command inventories. Do not add headings, empty sections, `None` placeholders, a fix plan, follow-up section, per-expert verdicts, or prose describing what worked.

When findings survive:

1. Include one **Findings** section, ordered by severity. State each finding once with its evidence and realistic failure scenario. Add lens or classification as compact metadata only when a wrapper requires it; do not section by reviewer.
2. Include **Resolution chunks** only for current-target work. Reference finding IDs instead of repeating evidence or scenarios. Each chunk states outcome, owned scope, dependencies, acceptance criteria, and focused validation.
3. Include **Follow-up work** only when non-current work actually exists.
4. End with compact `Validation` and `Limitations` lines only when material.

Use **Blocker**, **Major**, **Minor**, and **Nit** consistently from highest to lowest impact. `Resolution chunks` is the only fix plan; never repeat it as categorized lists or `Fix plan`. Omit empty categories. Internal adjudication, disagreements, and dropped candidates stay out of the report unless a verified deferred risk materially affects the user's next action.

Each resolution chunk must be independently actionable by one agent in one focused run. Keep one coherent responsibility and a reviewable diff; split unrelated ownership or broad context and merge fragments that cannot be implemented or validated independently. A finding may cite unchanged code when the reviewed change exposes it, but resolve locations against the reviewed head and explain the connection.

## Execution

- Inspect the implementation and tests directly; do not infer quality from summaries or green commands.
- Run focused validation when it can confirm or reject a material concern.
- Separate a valid requirement from a proposed implementation. Do not prescribe production machinery when an external test harness, existing seam, typecheck, or no additional test is the proportional answer.
- Report verified findings only. If none survive, say so and state material verification limitations.
- When publishing findings to GitHub, follow [github-pr-review](../github-pr-review/SKILL.md).
