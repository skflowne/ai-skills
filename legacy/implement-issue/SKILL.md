---
name: implement-issue
description: "Implement a GitHub issue end to end using a new branch, subagents for implementation, review, and end-to-end work, local verification, and a final pull request. Use only when the user explicitly names and requests this skill."
argument-hint: "[GitHub issue URL, issue number, or pasted issue text]"
---

# Implement Issue

Drive from an issue to merge-ready pull request. Keep the main conversation responsible for orchestration, final judgment, and verification.

## Workflow

1. Read the issue and required repo instructions.
2. Create and switch to a new branch before implementation.
3. Before you start, name the invariants the change introduces or touches (see below), then consider how the new code will fit within the existing codebase and craft an implementation plan around them
4. Derive the e2e plan from the invariant list: one spec per user-visible invariant, so that when these tests pass, the implementation can be considered robust and faithful to the issue's intent, with confidence that any future regression will be caught
5. Run steps 3 and 4 in design subagents, ask them to fetch the issue themselves and report to you. Give the e2e designer the invariant list from step 3 so both plans are derived from the same properties
6. Post the invariant list, implementation plan, and e2e plans on the issue
7. Launch an implementation subagent. It commits its work before returning.
8. Launch a review subagent, again it can fetch the issue by itself, instruct it to provide evidence of its claims.
9. Analyze the review findings and implement fixes, committing them as their own `fix:` commit.
10. Launch an e2e implementation subagent. It commits its specs before returning.
11. Run the relevant e2e tests plus any required lint, typecheck, unit, or integration checks.
12. Launch a final code review subagent with the final diff and test results.
13. Resolve valid final findings, rerun affected tests, and commit the fixes.
14. Push the branch and open a PR.
15. Finish with the branch, PR URL, summary, tests run, and residual risks.

## Name the invariants first

Before planning implementation, name the invariants the change introduces or touches — the properties that must hold regardless of ordering, interleaving, or failure. One sentence each: "the UI always converges to the last server-accepted write," "the planner entry and the calendar block always describe the same range."

- **One owner per invariant, end to end.** Exactly one mechanism enforces each invariant, across every file it spans. When you split work across implementation subagents, never split an invariant between them by directory or layer — state ownership is not file ownership. Splitting by file is what produces several duplicate mechanisms guarding one piece of state, none of them aware of the others. If two subagents would both touch an invariant, one owns it and the other consumes it.
- **Invariants govern the test plan.** Each user-visible invariant gets one e2e spec through the real UI. Ordering and interleaving semantics get unit tests against the mechanism that owns the invariant. Derive coverage from the invariant list, not from the file list.
- **Fix commits extend the owning invariant's spec** rather than adding a one-off regression test next to it. A fix that cannot be expressed as a case in that spec is a signal the invariant is owned in the wrong place — treat it as a design problem, not a missing test.

An invariant with no named owner, or one owned in more than one place, is a planning defect. Resolve it before implementing.

## Commit at every step

Commit after implementation, after each round of fixes, and after the e2e specs land — not once at the end. Fixes use `fix: <summary>` and stay separate from the commit they correct.

The history's shape is a signal: a file recurring across consecutive `fix:` commits means guards are accreting in one place and the seam is likely wrong. One squashed commit at the end erases that signal, and it also costs the review subagents a reviewable unit of work.

## Rules

- When using separate sub agents, let them fetch the issue data for themselves, pass only relevant context that is not already mentioned in there
- When using sub-agents, planning & review are considered tasks for smarter models while implementation based on these plans can be delegated to more efficient models. (Claude example: Plan with Opus, implement with Sonnet)
- Be concise but accurate in your reports
- Notify the user when the initial plans for implementation and e2e are posted, you don't need to wait for the user's review, just ensure they can review it as soon as they are ready
- The main conversation must personally inspect implementation diffs, approve the e2e design, judge review findings, and verify tests.
- Adopt a critical mindset, ensure changes fit in the codebase and they expose sensible interfaces for possible future reuse
- Do not discard unrelated user changes while branching or preparing the PR.
- If subagent tooling or PR creation is unavailable, continue manually and state the limitation in the handoff.
