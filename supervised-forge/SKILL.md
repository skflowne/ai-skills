---
name: supervised-forge
description: "Implement code changes with one primary author and one persistent independent correctness reviewer using milestone-by-milestone review gates. Use only when the user explicitly names and requests this skill."
---

# Supervised Forge

Keep all code and test authorship with the primary agent. Use exactly one persistent, independent, read-only correctness reviewer. Reviewer responses are workflow input, not completion events; run continuously until every milestone and the final gate are clear.

## Plan before editing

Inspect repository instructions, issue state and discussion, linked work, relevant code and tests, and related branches, worktrees, commits, and PRs. Use proportional read-only scouting only when needed. Adopt suitable existing work instead of duplicating or overwriting it, and maintain one relevant branch and PR.

Name every touched invariant and its single end-to-end owner, then record a plan of cohesive, preferably vertical milestones for the remaining work. Milestones follow invariant boundaries, not files. Put a gate after each behavior-bearing slice or risky API, schema, IPC, persistence, lifecycle, concurrency, process, power, security, destructive, or platform contract. Batch mechanical work into a neighboring milestone and use deterministic validation when a behavior gate is unwarranted.

Before authoring a helper, hook, constant, type, or coordination mechanism, inspect established shared locations and reuse or extend an existing owner. Never silently delete, inline, or bypass a shared mechanism.

After the plan exists, spawn one fresh high-capability reviewer whose prompt begins `/skill:pr-review`. Give it only the original task, requirements, complete plan, invariant owners, repository profile, base and working refs, validation evidence, and no edit authority. The canonical review skill owns scope, isolation, evidence, test-usefulness, failure scenarios, and fix verification; do not repeat those policies. Ask it additionally to check invariant ownership, duplication or bypass of shared mechanisms, and proportional validation across the plan. If the plan changes, send the complete update as plain facts without rationale, intended fixes, or review guidance.

Do not begin implementation before the plan is recorded and the reviewer is running. Reuse this reviewer for every gate. After every spawn or message, use `subagent_wait` or the runtime equivalent before the gate can advance or the turn can end. If the reviewer becomes unavailable, disclose the loss of independent supervision rather than silently replacing it with self-review.

## Milestone loop

For each milestone:

1. Implement the smallest complete slice as sole author and run proportional validation.
2. Commit it as `M<n>: <summary>`.
3. Send the reviewer only the milestone identifier and raw validation output; it locates and inspects the committed range.
4. Rejoin the reviewer before advancing the gate. Verify its findings rather than accepting them mechanically.
5. Fix valid findings, rerun invalidated checks, and commit each correction round as `fix: <summary>`.
6. Send only dispositions with evidence for rejections, raw rerun output, and a re-review request. Continue until the milestone is clear, then immediately start the next incomplete milestone.

Do not leak intended fixes, defend the design, prescribe conclusions, or build later high-risk layers on an uncleared gate. While review runs, continue only separable work that cannot invalidate the gate, and always rejoin before crossing it or ending the turn.

## Prevent patch accretion

A wrong-seam finding, or the same file appearing in more than two consecutive fix rounds, turns the next correction into an owner refactor: restate the invariant, redesign or extract its one owning mechanism, verify that mechanism proportionally, and rerun existing behavioral evidence. Do not add another guard. If the owner change exceeds the task boundary, stop and report the design block.

## Finish

When CI owns a full end-to-end suite, run only touched specs locally, monitor the pushed CI run, and treat failures as workflow input; run the full suite locally only when the repository has no CI coverage for it.

Run repository-required final tests, type checks, lint, builds, and focused runtime checks. Ask the same reviewer to inspect the complete branch against the base with raw final evidence. Resolve and re-review substantive findings until clear, then perform only caller-authorized commits, pushes, PR changes, or other external mutations.

Return the plan and invariant owners, base/head SHAs, commits, changed paths, milestone and final validation, reviewer decisions and final outcome, scope outcome, model substitution if any, residual risks, and artifacts. Do not add other reviewers unless the caller explicitly requests them.
