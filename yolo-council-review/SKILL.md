---
name: yolo-council-review
description: "Compose a custom panel of expert reviewers based on the review goal, run them in parallel, then aggregate and verify findings"
---

# YOLO Council Review

Compose an expert panel tailored to the original goal, run reviewers in parallel, then synthesize their reports.

Unlike the fixed [council-review](../../council-review/SKILL.md) panel, **you** decide who reviews and what each expert focuses on.

## Setup

1. Ensure environment is ready for review.
2. Fetch details about the PR you were asked to review.
3. Fetch the corresponding issue(s).
4. Read the PR diff, linked issues, and any stated review goal. Identify what actually needs scrutiny.

## Compose the panel

Before spawning sub-agents, decide the expert roster from the **original goal** — issue intent, acceptance criteria, PR scope, and risk surface. Do not default to a generic four-person panel unless the change truly warrants it.

**Principles**

- Pick **2–6** experts. Fewer for narrow changes; more when the goal spans multiple domains.
- Name each expert by **domain**, not by generic reviewer title, when a specific lens fits better (e.g. "Node graph contracts reviewer" instead of "Architecture reviewer").
- Give each expert a **distinct, non-overlapping** focus. If two experts would hunt the same bugs, merge them.
- Skip experts that the goal does not need. A backend-only refactor does not need a UI/UX reviewer unless the issue says otherwise.
- Always include at least one expert whose job is to check **implementation vs issue intent** (correctness / acceptance criteria), unless the goal is purely non-code (e.g. docs-only with no behavioral claims).

**Examples** (illustrative — compose your own panel per goal)

| Original goal | Example panel |
|---------------|---------------|
| New graph node + registry/docs | Node-system contracts reviewer; Correctness & edge cases; Test coverage reviewer |
| Auth middleware change | Security & authz reviewer; Correctness & regression reviewer; API contract reviewer |
| Compose-node UI polish | UI/UX & a11y reviewer; Interaction/state reviewer; Visual consistency reviewer |
| Provider adapter integration | Security & secrets handling; Error/retry behavior; Mock/test strategy reviewer |

Briefly state your chosen panel to the user before spawning (expert name + one-line focus each).

## Expert panel

Spawn one sub-agent per chosen expert, **all in parallel**. Each reviewer uses the same base prompt with its assigned role and focus:

```
/pr-review PR #{number}, but don't post inline comments — report your findings to your parent agent instead.

Provide actual evidence for every claim. Do not rely on hypotheticals that are unlikely to materialize. If unsure, search the codebase or fetch relevant docs.

Your expert role: {role}
Your focus areas: {focus}
```

Pass each sub-agent the PR number, issue context, the original goal, and its assigned role and focus areas.

## Synthesis

Your job is to analyze all reviewer reports with a critical mindset — do not accept findings at face value.

- Cross-check overlapping findings; deduplicate and reconcile severity.
- Anything in a reviewer report shaped like "may not accept," "documented separately," "not guaranteed to," "assumes the endpoint," or issue-cited external docs → **WebFetch** the doc before assigning severity.
- Drop findings that lack evidence or are speculative.
- Note where experts disagree and resolve with code/issue evidence.
- Attribute findings by the expert area you assigned, not by a fixed taxonomy.

## Handoff

0. Verify what has already been posted on the PR or as part of follow-up issues, drop anything already existing, unless there are new discoveries worth an update
1. Summarize verified findings that are issues (I don't care what's working), list in order of severity and section by expert area
2. Recommend a fix plan (blockers first, then major, minor, nits).
3. Ask the user if they accept the plan.
4. If approved, follow [github-pr-review](../../github-pr-review/SKILL.md) to post inline comments plus a summary review; create a follow-up issue for non-blocking gaps (e2e, assertions, etc.) and reference it in the comments.
