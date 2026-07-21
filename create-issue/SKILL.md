---
name: create-issue
description: "Generate a new github issue to define what needs to be done"
---

Interview me so that we reach a shared understanding of what needs to be done, and then interview me until we reach a shared understanding of how the code should be architectured to achieve the goal.

## Interview style

1. **First, present your understanding and design.** Before asking any questions, summarize what you understand and outline your proposed approach. This is not a draft to be confirmed point by point — it is the baseline we will refine.
2. **Then, ask only about what is outside that understanding.** Focus your questions on edge cases, risks, trade-offs, hidden assumptions, and anything ambiguous or underspecified.
3. **List the obvious; question the non-obvious.** When something follows directly from what was already discussed, add it to a "What I understand" list. Do **not** ask confirmatory questions about it (e.g., don't ask "By X do you mean Y?", "Just to confirm, Z?", or "Confirm that's the desired default behavior (it follows from rule N)").
4. **Look at the problem from multiple angles.** Consider the end user, the developer implementing it, future maintainers, security, observability/ops, performance, backwards compatibility, and how this might evolve.
5. **Surface risks explicitly.** Call out what could go wrong, what could be misinterpreted, and what could make future changes harder.
6. **Make recommendations based on evidence.** Do upfront research in the codebase and propose an architecture grounded in what you find. Core values: keep it simple yet easy to evolve through generalization and centralization (single source of truth, avoid duplication, strive for generic and reusable — but not if the trade-off is a large jump in complexity).

### Examples of questions not to ask

Do not turn best practices or clearly beneficial UX into optional polls. For example, if the spec says filters can hide selected items, do **not** ask:

> "When filters hide recipes, show a subtle hint like '2 selected · 3 hidden by filters' near the pick list — nice reassurance that hidden selections are still active. Want it, or keep it minimal?"

This is a UX best practice, not a meaningful decision point. Instead, list it as part of your understanding and move on. Only ask if there is a genuine constraint (e.g., screen real estate, accessibility concerns, performance budget, brand guidelines) that makes it non-obvious.

Do not ask for confirmation of direct logical consequences. For example, if the rules already say "no inclusion chips selected + only exclusions means show everything except excluded items," do **not** ask:

> "No include chip selected + exclusions only → list shows everything except excluded-tagged recipes. Confirm that's the desired default behavior (it follows from rule 3)."

It literally follows from what was already discussed; state it in your understanding list and move on.

The goal is to get a detailed architecture and implementation plan.

## Posting the issue

When the plan is ready, **do not** call `gh issue create` with inline heredocs. Read and follow [github-issue-create](../github-issue-create/SKILL.md):

1. Write the body to a scratch markdown file.
2. Run `node .agents/skills/github-issue-create/scripts/create-github-issue.mjs`.
3. For follow-up issues, use `commentOn` in the JSON payload to link the parent issue.
4. Return the issue URL to the user.
