---
name: council-review
description: "Use independent sub-agents as a panel of expert reviewers (correctness, UI/UX, architecture, security) in parallel, then aggregate and verify findings"
---

# Council Review

Run a fixed panel of five expert reviewers in parallel, then synthesize their reports.

## Setup

1. Ensure environment is ready for review.
2. Fetch details about the PR you were asked to review.
3. Fetch the corresponding issue(s).

## Expert panel

Spawn **five** sub-agents in parallel — one per expert. Each reviewer uses the same base prompt with a different focus:

```
/pr-review PR #{number}, but don't post inline comments — report your findings to your parent agent instead.

Provide actual evidence for every claim. Do not rely on hypotheticals that are unlikely to materialize. If unsure, search the codebase or fetch relevant docs. For every finding, provide a concise description, a realistic failure scenario, and evidence (for example file/line references, a test result, or authoritative documentation).

A realistic failure scenario has three parts, per the Failure scenario standard in pr-review: the concrete trigger (who does what, with which inputs and state, on a path a real user or caller actually takes), the mechanism (what the code then does wrong, at the cited file:line), and the real-world impact (what the person on the other end loses, sees wrong, cannot do, or is exposed to). Also say how a user reaches that state in normal use and how often. Discard — do not hedge and report — any finding whose scenario reduces to "could cause unexpected behavior," "is not ideal," or "a caller might misuse this," and any whose trigger the call sites, types, or validation already exclude. For findings that are not user-facing, the affected party is the next person to change this code: name the realistic edit, what silently breaks when they make it, and the user-visible defect that ships as a result.

Your expert role: {role}
Your focus areas: {focus}
```

| Expert | Role | Focus areas |
|--------|------|-------------|
| **Correctness** | Correctness & behavior reviewer | Logic bugs, edge cases, incorrect behavior, regressions, whether the implementation matches the issue intent and acceptance criteria |
| **UI/UX** | UI & UX reviewer | Run the app in a browser and test the relevant flow as a user would. Visually verify each state and interaction, and report behavior that is not ideal, including interaction design, accessibility, visual consistency, loading/error/empty states, copy clarity, and friction points. |
| **Architecture** | Code architecture reviewer | Module boundaries, abstractions, duplication, coupling, naming, testability, whether patterns match the codebase, maintainability |
| **Security** | Security reviewer | Auth/authz gaps, input validation, injection risks, secrets exposure, unsafe dependencies, data handling, OWASP-style concerns |
| **Design soundness** | Root-cause & design-soundness reviewer | Whether the seams are right, not whether the behavior is right. For each defect you see, name the invariant it is really protecting and ask who owns that invariant — one mechanism, or scattered guards and duplicate machines? Is each touched component still coherent at its current size and responsibility count? Run `git log --name-only` over the touched files and report any that recur across consecutive `fix:` commits, plus any abstraction a later commit deleted in favor of inline guards. |

Pass each sub-agent the PR number, issue context, and its row from the table above.

For UI/UX reviews, use the browser automation tool available in the host environment, such as `agent-browser`; use the equivalent tool in Codex, Claude Code, or another host when the tool differs. A real browser engine is required, but headless execution is acceptable. Capture screenshots of key states and test the flow as a user would. Do not substitute source inspection for running the flow.

## Synthesis

Your job is to analyze all five reports with a critical mindset — do not accept findings at face value.

- Cross-check overlapping findings; deduplicate and reconcile severity.
- Anything in a reviewer report shaped like "may not accept," "documented separately," "not guaranteed to," "assumes the endpoint," or issue-cited external docs → **WebFetch** the doc before assigning severity.
- Drop findings that lack evidence or are speculative.
- **Audit every failure scenario against the standard in [pr-review](../pr-review/SKILL.md).** Drop any finding whose trigger no real user or caller reaches, or whose impact you cannot state as a concrete real-world consequence — do not rescue it by downgrading it to a nit. Where a reviewer asserted a scenario without checking call sites, types, or validation, check them yourself before keeping it.
- Note where experts disagree and resolve with code/issue evidence.
- Preserve each finding's concise description, realistic failure scenario (trigger, mechanism, real-world impact, plausibility), and evidence through deduplication; a finding missing any of these is invalid.

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

0. Verify what has already been posted on the PR or as part of follow-up issues, unless something is new or has relevant new findings that should be posted as an update, it is irrelevant, therefore do not pollute the summary with it
1. Summarize verified findings that are issues (I don't care what's working), list in order of severity and section by expert area. Tag each finding with its cluster and that cluster's classification.
2. Recommend a fix plan (blockers first, then major, minor, nits) and organize it into the agent-sized resolution chunks defined by [github-pr-review](../github-pr-review/SKILL.md). List `wrong-seam` clusters separately, as refactor tasks with their invariant named — never folded into the patch list, even when a patch outranks them on severity.
3. Ask the user if they accept the plan.
4. If approved, follow [github-pr-review](../github-pr-review/SKILL.md) to post all findings and resolution chunks as one consolidated review body, never as inline comments. Always post the review as a normal comment (`COMMENT`), never as a request for changes (`REQUEST_CHANGES`). Create a follow-up issue for non-blocking gaps (e2e, assertions, etc.) and reference it in the review.
