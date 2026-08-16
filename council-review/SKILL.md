---
name: council-review
description: "Use independent sub-agents as a panel of expert reviewers (correctness, UI/UX, architecture, security) in parallel, then aggregate and verify findings. Use only when the user explicitly names and requests this skill."
---

# Council Review

Run a fixed panel of five expert reviewers in parallel, then synthesize their reports.

## Setup

Read and apply the canonical review contract in [pr-review](../pr-review/SKILL.md). Every panelist must invoke it independently; this skill adds specialist focus but does not replace or weaken its scope, isolation, fix-verification, or test-usefulness rules.

1. Ensure environment is ready for review.
2. Fetch details about the PR you were asked to review.
3. Fetch the corresponding issue(s).

## Expert panel

Spawn **five** sub-agents in parallel — one per expert. Each reviewer uses the same base prompt with a different focus:

```
/skill:pr-review PR #{number}, but don't post inline comments — report your findings to your parent agent instead.

Provide actual evidence for every claim. Do not rely on hypotheticals that are unlikely to materialize. If unsure, search the codebase or fetch relevant docs. For every finding, provide a concise description, a realistic failure scenario, and evidence (for example file/line references, a test result, or authoritative documentation).

A realistic failure scenario has three parts, per the Failure scenario standard in pr-review: the concrete trigger (who does what, with which inputs and state, on a path a real user or caller actually takes), the mechanism (what the code then does wrong, at the cited file:line), and the real-world impact (what the person on the other end loses, sees wrong, cannot do, or is exposed to). Also say how a user reaches that state in normal use and how often. Discard — do not hedge and report — any finding whose scenario reduces to "could cause unexpected behavior," "is not ideal," or "a caller might misuse this," and any whose trigger the call sites, types, or validation already exclude. For findings that are not user-facing, the affected party is the next person to change this code: name the realistic edit, what silently breaks when they make it, and the user-visible defect that ships as a result.

Your expert role: {role}
Your focus areas: {focus}
```

| Expert | Role | Focus areas |
|--------|------|-------------|
| **Correctness** | Correctness & behavior reviewer | Logic bugs, edge cases, incorrect behavior, regressions, whether the implementation matches the issue intent and acceptance criteria |
| **UI/UX** | UI & UX reviewer | Run the required flow in a real browser as a user would. Verify interaction, accessibility, loading/error/empty states, copy, and visual behavior against issue intent and established repository patterns. Report only concrete failures or regressions with realistic user impact; do not convert subjective polish, unspecified alternatives, or behavior that is merely “not ideal” into findings. |
| **Architecture** | Code architecture reviewer | Module boundaries, abstractions, duplication, coupling, naming, testability, whether patterns match the codebase, maintainability |
| **Security** | Security reviewer | Auth/authz gaps, input validation, injection risks, secrets exposure, unsafe dependencies, data handling, OWASP-style concerns |
| **Design soundness** | Root-cause & design-soundness reviewer | Whether the seams are right, not whether the behavior is right. For each defect you see, name the invariant it is really protecting and ask who owns that invariant — one mechanism, or scattered guards and duplicate machines? Is each touched component still coherent at its current size and responsibility count? Run `git log --name-only` over the touched files and report any that recur across consecutive `fix:` commits, plus any abstraction a later commit deleted in favor of inline guards. |

Pass each sub-agent only the PR number, original issue context, target refs, repository profile, and its row from the table above. Do not pass author rationale, prior reviews, candidate findings, or another panelist's output. Spawn all panelists from fresh context and keep their outputs isolated until synthesis.

For UI/UX reviews, use the browser automation tool available in the host environment, such as `agent-browser`; use the equivalent tool in Codex, Claude Code, or another host when the tool differs. A real browser engine is required, but headless execution is acceptable. Capture screenshots of key states and test the flow as a user would. Do not substitute source inspection for running the flow.

## Synthesis

Your job is to analyze all five reports with a critical mindset — do not accept findings at face value.

- Cross-check overlapping findings; deduplicate and reconcile severity.
- Anything in a reviewer report shaped like "may not accept," "documented separately," "not guaranteed to," "assumes the endpoint," or issue-cited external docs → **WebFetch** the doc before assigning severity.
- Drop findings that lack evidence or are speculative.
- **Audit every failure scenario against the standard in [pr-review](../pr-review/SKILL.md).** Drop any finding whose trigger no real user or caller reaches, or whose impact you cannot state as a concrete real-world consequence — do not rescue it by downgrading it to a nit. Where a reviewer asserted a scenario without checking call sites, types, or validation, check them yourself before keeping it.
- Note where experts disagree and resolve with code/issue evidence.
- Preserve each finding's concise description, realistic failure scenario (trigger, mechanism, real-world impact, plausibility), and evidence through deduplication; a finding missing any of these is invalid.
- Apply the canonical test-usefulness standard to every test finding and to test code introduced by a proposed fix. Green output or a closed comment does not prove that a test prevents a regression or that its implementation is at the correct seam.

## Root-cause classification

Mandatory, after dedupe, before you write the fix plan. Group the surviving findings into **clusters** that share a root cause — same invariant, same state, same seam. A cluster may hold one finding.

Answer, per cluster:

1. Is this a local bug, or a symptom of a wrong seam / wrong state model?
2. Is this component's design still correct at its current size and responsibility count?
3. Is the architecture of the feature/module sound, judged against the invariants it must maintain?

Then classify every cluster. There is no default and no "unclear" — an unclassified cluster is an incomplete review.

| Class | Meaning | Resolution |
|-------|---------|------------|
| `local-bug` | The seam is right; the logic inside it is wrong. | Patch it in place. |
| `wrong-seam` | The invariant has no single owner, or lives in the wrong place. Patching treats a symptom. | Escalates to a refactor task. **Must not be patched.** |

Evidence that makes a cluster `wrong-seam` — any one is sufficient:

- The same invariant is enforced in more than one place (duplicate mechanisms, parallel guards protecting one piece of state).
- The obvious fix would add another guard, flag, or ref to state that already has several.
- A touched file recurs across more than two consecutive `fix:` commits.
- A previous abstraction covering this invariant was deleted in favor of inline guards.
- The finding lives in responsibility a component has accreted beyond what its name implies.

A `wrong-seam` cluster must state its invariant in one sentence — "UI always converges to the last server-accepted write," "planner entry and calendar block always describe the same range." A cluster that cannot name its invariant is `local-bug`.

**Escalation rule.** Report `wrong-seam` clusters as refactor tasks: restate the invariant, extract or redesign the mechanism that owns it (with unit tests on the extracted mechanism), then re-run the existing behavioral suite unchanged. Never as another guard clause. Do not downgrade a cluster to `local-bug` because the patch would be smaller, the round is late, or the diff is already large — say the design is wrong when it is wrong.

## Handoff

1. Drop anything already posted on the PR or tracked in a follow-up issue unless new evidence warrants an update.
2. Follow the canonical [review output contract](../pr-review/SKILL.md#review-output-contract). If no findings survive, return only `No findings.` plus material validation or limitations, then stop the handoff; do not include five expert verdicts, clean-area summaries, empty plans, rejected candidates, or ask for plan approval.
3. When findings survive, use one severity-ordered list. Add expert area, cluster, and classification inline as compact metadata rather than separate expert sections.
4. Use one **Resolution chunks** section as the complete fix plan. Reference finding IDs rather than repeating evidence. Label `wrong-seam` chunks and name their invariant; do not duplicate them in a separate refactor list. Omit empty sections.
5. Ask the user if they accept the plan.
6. If approved, follow [github-pr-review](../github-pr-review/SKILL.md) to post the result once as a `COMMENT`, never inline or as `REQUEST_CHANGES`. Create follow-up issues only for verified work outside the current target and link them without restating their full content.
