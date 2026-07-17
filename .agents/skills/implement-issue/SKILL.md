---
name: Implement Issue
description: Implement a GitHub issue end to end. Use a new branch, subagents for implementation/review/e2e work, local verification, and a final pull request.
argument-hint: "[GitHub issue URL, issue number, or pasted issue text]"
---

# Implement Issue

Drive from an issue to merge-ready pull request. Keep the main conversation responsible for orchestration, final judgment, and verification.

## Workflow

1. Read the issue and required repo instructions.
2. Create and switch to a new branch before implementation.
3. Before you start, consider how the new code will fit within the existing codebase and craft an implementation plan
4. Consider what needs to be tested in e2e so that when these tests pass, the implementation can be considered robust and faithful to the issue's intent, with confidence that any future regression will be caught
5. Run steps 3 and 4 in design subagents, ask them to fetch the issue themselves and report to you
6. Post the implementation plan and e2e plans on the issue
7. Launch an implementation subagent.
8. Launch a review subagent, again it can fetch the issue by itself, instruct it to provide evidence of its claims.
9. Analyze the review findings and implement fixes.
10. Launch an e2e implementation subagent.
11. Run the relevant e2e tests plus any required lint, typecheck, unit, or integration checks.
12. Launch a final code review subagent with the final diff and test results.
13. Resolve valid final findings and rerun affected tests.
14. Commit, push the branch, and open a PR.
15. Finish with the branch, PR URL, summary, tests run, and residual risks.

## Rules

- When using separate sub agents, let them fetch the issue data for themselves, pass only relevant context that is not already mentioned in there
- When using sub-agents, planning & review are considered tasks for smarter models while implementation based on these plans can be delegated to more efficient models. (Claude example: Plan with Opus, implement with Sonnet)
- Be concise but accurate in your reports
- Notify the user when the initial plans for implementation and e2e are posted, you don't need to wait for the user's review, just ensure they can review it as soon as they are ready
- The main conversation must personally inspect implementation diffs, approve the e2e design, judge review findings, and verify tests.
- Adopt a critical mindset, ensure changes fit in the codebase and they expose sensible interfaces for possible future reuse
- Do not discard unrelated user changes while branching or preparing the PR.
- If subagent tooling or PR creation is unavailable, continue manually and state the limitation in the handoff.
