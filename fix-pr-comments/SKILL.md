---
name: fix-pr-comments
description: "Handle fixes to a PR after review. Use only when the user explicitly names and requests this skill."
---

# Fix PR comments

Read and apply the canonical review contract in [pr-review](../pr-review/SKILL.md), especially its scope, fix-verification, wrong-seam, and test-usefulness rules.

- First summarize the PR comments and recover the original issue intent, acceptance criteria, pre-fix revision, repository policy, and affected invariant. A review comment is a reported problem, not an accepted requirement or implementation design.
- Verify each finding independently against code and original intent. Retract or explicitly reject invalid, speculative, duplicate, pre-existing, or out-of-scope comments instead of manufacturing work to satisfy them.
- If the resolution path requires a genuine product, dependency, scope, or architecture decision not settled by repository evidence, ask the user and provide a recommendation.
- Before editing, check the environment, active agents, branches, and worktrees so the fix does not collide with another writer; fetch the latest target state.
- Assess orchestration and, when necessary, divide independent invariants between isolated agents. Keep each agent's context under 100K tokens and one owner per invariant.
- Implement the smallest correct fix at the owning seam. Do not add guards, production test hooks, environment branches, public APIs, dependencies, or test infrastructure merely to match the wording of a comment.
- Add or change tests only when they protect required user/caller behavior or core logic from a realistic regression, and require every test to satisfy the canonical test-usefulness standard. Delete or reject tautological tests rather than replacing them with fake runtime coverage.
- Commit cohesively. Do not force one commit per comment when comments share one invariant or one root cause; do not combine unrelated findings merely to reduce commits.
- Re-review each fix range against the pre-fix revision and original requirement. Matching a comment is insufficient: verify correctness, scope, ownership, regression sensitivity, and absence of test-only production behavior. A symptom patch or misplaced proof is unresolved wrong-seam work.
- Reply to valid fixed comments with `resolved: {short concise explanation}` and resolve the thread only after correct re-review. Reply to rejected comments with concise evidence and leave the disposition explicit.
- Report failures and unresolved decisions to the user.
