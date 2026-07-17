---
name: create-issue
description: "Generate a new github issue to define what needs to be done"
---

Interview me so that we reach a shared understanding of what needs to be done.

Once we do reach a shared understanding, you'll interview me until we reach a shared understanding of how the code should be architectured to achieve the goal: to this end, you'll do upfront research in the codebase and make some recommendations based on the evidence you found, the core values are: keep it simple yet easy to make evolve through generalization and centralization (single source of truth, avoid duplication, strive for generic and reusable but not if the trade-off is a large jump in complexity).

The goal is to get a detailed architecture and implementation plan.

## Posting the issue

When the plan is ready, **do not** call `gh issue create` with inline heredocs. Read and follow [github-issue-create](../github-issue-create/SKILL.md):

1. Write the body to a scratch markdown file.
2. Run `node .agents/skills/github-issue-create/scripts/create-github-issue.mjs`.
3. For follow-up issues, use `commentOn` in the JSON payload to link the parent issue.
4. Return the issue URL to the user.
