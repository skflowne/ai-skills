---
name: council-review
description: "Use independent sub-agents as a panel of expert reviewers (correctness, UI/UX, architecture, security) in parallel, then aggregate and verify findings"
---

# Council Review

Run a fixed panel of four expert reviewers in parallel, then synthesize their reports.

## Setup

1. Ensure environment is ready for review.
2. Fetch details about the PR you were asked to review.
3. Fetch the corresponding issue(s).

## Expert panel

Spawn **four** sub-agents in parallel — one per expert. Each reviewer uses the same base prompt with a different focus:

```
/review PR #{number}, but don't post inline comments — report your findings to your parent agent instead.

Provide actual evidence for every claim. Do not rely on hypotheticals that are unlikely to materialize. If unsure, search the codebase or fetch relevant docs.

Your expert role: {role}
Your focus areas: {focus}
```

| Expert | Role | Focus areas |
|--------|------|-------------|
| **Correctness** | Correctness & behavior reviewer | Logic bugs, edge cases, incorrect behavior, regressions, whether the implementation matches the issue intent and acceptance criteria |
| **UI/UX** | UI & UX reviewer | User flows, interaction design, accessibility, visual consistency, loading/error/empty states, copy clarity, friction points |
| **Architecture** | Code architecture reviewer | Module boundaries, abstractions, duplication, coupling, naming, testability, whether patterns match the codebase, maintainability |
| **Security** | Security reviewer | Auth/authz gaps, input validation, injection risks, secrets exposure, unsafe dependencies, data handling, OWASP-style concerns |

Pass each sub-agent the PR number, issue context, and its row from the table above.

## Synthesis

Your job is to analyze all four reports with a critical mindset — do not accept findings at face value.

- Cross-check overlapping findings; deduplicate and reconcile severity.
- Anything in a reviewer report shaped like "may not accept," "documented separately," "not guaranteed to," "assumes the endpoint," or issue-cited external docs → **WebFetch** the doc before assigning severity.
- Drop findings that lack evidence or are speculative.
- Note where experts disagree and resolve with code/issue evidence.

## Handoff

0. Verify what has already been posted on the PR or as part of follow-up issues, unless something is new or has relevant new findings that should be posted as an update, it is irrelevant, therefore do not pollute the summary with it
1. Summarize verified findings that are issues (I don't care what's working), list in order of severity and section by expert area
2. Recommend a fix plan (blockers first, then major, minor, nits).
3. Ask the user if they accept the plan.
4. If approved, follow [github-pr-review](../github-pr-review/SKILL.md) to post inline comments plus a summary review; create a follow-up issue for non-blocking gaps (e2e, assertions, etc.) and reference it in the comments.
