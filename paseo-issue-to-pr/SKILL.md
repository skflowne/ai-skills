---
name: paseo-issue-to-pr
description: "Implement a GitHub issue through Paseo with Portolan Forge and CodeGraph evaluation, then run up to four autonomous drift-review-duo rounds with bounded fix dispatch before handing the PR to a human. Use only when the user explicitly names and requests this skill."
---

# Paseo Issue to PR

Own an issue through an open PR and a bounded, explicitly classified handoff. Use [explore](../explore/SKILL.md) for discovery, [paseo](../paseo/SKILL.md) for every agent workspace, [portolan-forge](../portolan-forge/SKILL.md) for implementation, [codegraph-evaluation](../codegraph-evaluation/SKILL.md) throughout, [drift-review-duo](../drift-review-duo/SKILL.md) for assembled reviews, and [github-pr-review](../github-pr-review/SKILL.md) to publish them.

The user preauthorizes implementation and review decisions. When repository evidence does not dictate direction, apply [trade-off analysis](../trade-off-analysis/SKILL.md), but override its user-decision handoff: choose the strongest option, continue, and record the decision, alternatives, material trade-offs, and assumptions. Prefer the safest reversible option when evidence remains unavailable.

Stop early only for a hard external blocker such as unavailable credentials on both the review agent and controller, an inaccessible remote, an unsafe irreversible action outside the requested lifecycle, or infrastructure failure that survives publication recovery. A review agent's failed GitHub call is recoverable transport failure, not itself a blocker.

## Bounded execution contract

Apply the canonical [review boundary](../pr-review/SKILL.md#establish-the-review-boundary) to the original issue and every resolution chunk. If Portolan reports that required work exceeds that boundary, stop its implementation and adjudicate the expansion before continuing.

Run at most four substantive review rounds. Preflight does not consume a round; mark it consumed immediately before the substantive duo task. A started review consumes its round even if it fails. Failed child publication enters controller recovery and never authorizes a second reviewer.

This workflow runs to completion. Follow Paseo's run-to-completion, ambiguous-state recovery, lifecycle-ledger, and retirement contracts.

## 1. Context discovery, preflight, and implementation

Require an issue number and authenticated repository access. Invoke `/skill:explore` for a read-only synthesis of the issue and acceptance criteria, discussion and linked work, relevant code and tests, and related branches, worktrees, commits, and PRs. Use that evidence to adopt existing work or select a committed base without deleting, overwriting, or duplicating discovered work.

Apply Paseo's preflight. Additionally verify controller GitHub access, record the authenticated login without exposing credentials, and leave unrelated dirty work untouched.

Initialize Paseo's workflow lifecycle ledger, then create or adopt one issue workspace and branch. Launch `/skill:portolan-forge` using Paseo's task-brief contract and the discovery synthesis. Require `/skill:codegraph-evaluation`, the autonomous trade-off override above, and push/open-or-update authorization for the single issue PR. In addition to Portolan's standard handoff, require the branch, PR URL, decision log, and committed CodeGraph report.

After completion, verify the PR, branch, validation, review evidence, and handoff. If the agent idles on a decision, resume that same agent with the autonomous trade-off override after applying Paseo's ambiguous-state checks. If an integrator becomes unrecoverable, preserve its evidence, retire it, and assign one explicit continuation.

## 2. Drift review

Run `/skill:drift-review-duo` read-only against the assembled PR in a separate Paseo workspace. Its posted GitHub review is the sole findings handoff. The controller may publish the reviewer's exact finalized payload when child publication fails, but may not alter or re-adjudicate it.

Create a unique recovery-artifact directory outside every Git worktree before launching the review agent and record its canonical path in the ledger. The review agent must atomically write one JSON artifact before attempting publication. It contains the PR number, exact reviewed `headRefOid`, round, `event: "COMMENT"`, complete body, and body SHA-256. Its body begins `## Automated drift review — Round <n>/4`. Do not treat this artifact as a findings handoff and never dispatch fixes from it; it exists only so the controller can publish the exact reviewer-approved body.

Create one review workspace from the exact fetched PR head with a collision-resistant review-only slug. Before launch, verify its clean canonical path is unique and distinct from every writer workspace. Apply Paseo's recovery contract on failure; quarantine path collisions rather than using or deleting an ambiguous workspace.

Launch one review agent with the least-privileged provider mode that permits authenticated GitHub access (`full-access` for Codex). Preflight that same agent with `gh auth status`, `gh api user`, and a PR-head read without consuming the round. Use reviewer-publish mode when child access succeeds, controller-publish mode when only controller access succeeds, and stop before review when both fail.

Send the substantive duo task with only the target refs under the round-consumption contract above. Override its approval prompt and require canonical review output, concise reasons for dropped candidates, and `Fix plan: None` when no worthwhile findings remain. The agent writes the recovery artifact before publishing. In reviewer-publish mode it returns only the verified permalink on success; in controller-publish mode or child publication failure it returns `PUBLISH_RECOVERY_REQUIRED <artifact-path> <error-category>` without reproducing the body.

After the agent idles, query GitHub by the unique round heading. Verify and use exactly one matching review, run controller recovery when none exists, and stop without reposting when duplicates exist.

### Controller publication recovery

When no uniquely headed review exists after the substantive reviewer finishes:

1. Read the artifact, validate its schema, recompute its body hash, and require its PR number, round heading, `event`, and `headRefOid` to match the ledger and current PR head. If the PR head moved, resume the same review agent to assess the new head and replace the artifact; do not publish a stale review or launch another reviewer.
2. Re-run the controller's `gh auth status`, `gh api user`, and PR read preflight. A child credential or sandbox failure does not override successful controller access.
3. Query reviews again immediately before posting. If the unique round review appeared, verify and use it. Otherwise pass only the artifact's exact `{event, body}` through `github-pr-review`'s helper. Do not edit the body.
4. Treat an ambiguous post result as unknown, not failed: query GitHub by the exact round heading and body hash before any retry. Retry only when absence is proven.
5. Verify exactly one landed review, its full body hash, permalink, author, and PR head. Record whether the reviewer or controller published it, then delete the recovery artifact during final cleanup.

Stop as a hard publication blocker only if the finalized artifact cannot be recovered or neither the full-access review agent nor controller can publish and verify it after these checks. Preserve the artifact path and errors in the workflow report.

Only findings introduced by the branch or required by the issue are eligible for dispatch. Eligible bugs are worthwhile. Issue-owned wrong-seam refactors are current-PR chunks, overriding the duo's default follow-up handoff, when they are strongly likely to make the requested work safer. Apply the autonomous trade-off override to other eligible findings.

Publish through `github-pr-review`, capture and verify the permalink, then read the posted body directly. Do not dispatch fixes before the review lands.

## 3. Dispatch resolution chunks

Create one Paseo agent and temporary branch per canonical resolution chunk. Apply Paseo's task-brief and invariant-based parallelism contracts, adding the issue and PR, posted review permalink, and one assigned chunk. Independent chunks start from the same current issue-branch tip; dependent chunks run in waves from the updated tip.

Start each fixer with `/skill:portolan-forge` and require `/skill:codegraph-evaluation` plus the autonomous trade-off override. Authorize pushing the cleared chunk branch, but not opening or editing a PR, merging, or integrating other chunks. Require Portolan's standard handoff plus the committed CodeGraph report and scope outcome.

After completion, verify each branch and its evidence, then send cleared handoffs to the issue integrator. The integrator applies the autonomous trade-off override, validates the assembled branch, pushes it, and records decisions. If a conflict reveals shared invariant ownership, return the affected work to one Portolan owner instead of combining independent patches.

## 4. Repeat and hand off

After integrating rounds 1–3, post one concise progress update containing the completed round, integrated chunk count, validation result, and next round; then run a fresh assembled duo review.

If a round is clear, verify required CI and leave the PR open for human review. Otherwise repeat dispatch and integration through round 3. Round 4 is terminal: leave remaining worthwhile chunks untouched and mark `round cap reached — not verified clear`, or mark `clear within round cap` when none remain.

Retire each agent with Paseo's protocol as soon as its evidence is durable. Never update the PR body, merge, or enable auto-merge.

Post one final PR comment using the following template. Include validation, CodeGraph report links, drift-review rounds, deferred findings, and the full decision log. Use `None` when a section is empty; keep decision and refactoring items to one line.

```markdown
## Automated workflow report

### Workflow status
- <clear within round cap | round cap reached — not verified clear | hard blocker>

### Validation
- <check and result>

### CodeGraph reports
- <report link>

### Drift-review rounds
- <round summary, review permalink, and reviewer-published or controller-recovered publication path>

### Deferred findings
- <finding> — <reason deferred>

### Decisions made ↔ problem solved
- <decision> ↔ <problem it solved>

### Refactoring done ↔ why it was worth it
- <refactor> ↔ <why it was judged sufficiently likely to improve later work>
```

If the workflow resumes, update its existing report comment rather than posting duplicates. Leave the PR body unchanged.

Before declaring completion, perform Paseo's final ledger reconciliation. Preserve branch and workspace evidence for any unresolved blocker.

Call the PR clear only after an assembled review has no worthwhile findings. Completion requires the open PR, final report, and reconciled Paseo ledger.
