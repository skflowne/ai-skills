---
name: paseo-issue-to-pr-lite
description: "Implement a GitHub issue through Paseo with Supervised Forge, then run up to four fresh drift-review-duo rounds whose bounded resolution chunks are handled by steered Supervised Chunk agents. Use only when the user explicitly names and requests this skill."
---

# Paseo Issue to PR Lite

Own an issue through an open PR and a bounded, explicitly classified handoff with bounded agent contexts. Use [paseo](../paseo/SKILL.md) for every workspace, [supervised-forge](../supervised-forge/SKILL.md) for the initial implementation, [supervised-chunk](../supervised-chunk/SKILL.md) for every fix chunk, [drift-review-duo](../drift-review-duo/SKILL.md) for assembled-branch reviews, and [github-pr-review](../github-pr-review/SKILL.md) to publish each review round.

The user preauthorizes this workflow to make implementation, review, and fix decisions. Do not request approval unless work reaches a genuine product or repository-policy decision that repository evidence cannot resolve or the decision involves a significant scope increase.

Pass only durable, compact handoffs and relevant artifact paths between agents, never accumulated transcripts or repeated raw logs.

## Bounded execution and supervision

When `supervised-forge` or `supervised-chunk` reports that required work exceeds its canonical scope boundary, launch a judge agent to identify the correct solution with the smallest justified scope increase. Report any expansion immediately through a Paseo notification with the problem and decision rationale.

Consume a review round as soon as its assembled `drift-review-duo` agent begins substantive execution. Resume a failed review agent rather than replacing it.

This workflow runs to completion. Follow Paseo's run-to-completion, ambiguous-state recovery, lifecycle-ledger, and retirement contracts.

Check activity every 15 minutes for stalls, loops, scope growth, or drift. Report concise progress; if work clearly drifts from the issue, stop the workflow and notify the human.

## 1. Context exploration and preflight

Require an issue number and authenticated repository access. Invoke `/skill:explore` for a read-only synthesis of the issue and acceptance criteria, discussion and linked work, related local and remote branches or PRs, and the implementation state that should be adopted or completed.

Initialize Paseo's workflow lifecycle ledger before creating any workspace.

## 2. Initial supervised implementation

Create or adopt one Paseo worktree and issue branch from the discovered state and selected committed base. Launch `/skill:supervised-forge` with the issue, base SHA, and synthesized remaining-work boundary. In addition to that skill's standard finish report, require the PR URL and current head SHA, or a concise failure report.

After completion, verify the PR, branch, validation, and handoff, then retire the implementation agent with Paseo's protocol before assigning another writer to its workspace.

## 3. Fresh assembled duo review

For every review round, launch `/skill:drift-review-duo` read-only against the exact assembled range. Provide only the target refs; that skill owns issue/repository setup, reviewer isolation, adjudication, classification, and canonical review output.

A round is clear only when no verified worthwhile findings remain. Override the duo's approval prompt: this workflow preauthorizes publishing its canonical output through `github-pr-review`. Require concise reasons for dropped candidates and `Fix plan: None` for a clear round, but no intermediate analysis.

Read the posted review directly; do not publish it again or ask the agent to reproduce it. The review must exist before any fixer starts. Once its evidence is durable, retire the review agent with Paseo's protocol.

## 4. Run one steered fixer per chunk

For every worthwhile resolution chunk, create one fresh Paseo worktree, branch, and fixer agent. Start its prompt with `/skill:supervised-chunk` and follow Paseo's task-brief contract, adding the original issue and PR, review permalink and round, and the one assigned chunk.

`supervised-chunk` owns continuous implementation, independent supervision, scope control, validation, and its compact handoff. This workflow authorizes pushing the cleared chunk branch, but not opening or editing a PR, merging, or integrating other chunks.

Do not add another solo review after chunks finish; the next branch-wide review is the assembled duo. After completion, verify the fixer's cleared branch and artifacts, then retire it with Paseo's protocol.

### Scheduling

Apply Paseo's invariant-based parallelism rules when validating the canonical resolution chunks. Start independent chunks from the same current issue-branch tip. Run dependent or overlapping chunks in waves, integrating and validating prerequisites before creating downstream branches. If a fixer reports shared ownership or overlap, regroup that work under one supervised owner.

## 5. Integrate the cleared chunks

After the initial implementer is retired, launch one fresh integrator for the current review round in the original issue workspace. Give it only the current issue-branch SHA, cleared chunk handoffs, merge order, repository constraints, and required assembled validation.

The integrator is the issue workspace's sole writer. It must:

- verify every chunk was independently cleared and still descends from its declared base;
- integrate only the approved commits in dependency order;
- run focused checks after each dependency wave and assembled validation after all selected chunks are in;
- push the updated issue branch; and
- return a compact integration handoff and decision log.

The integrator must not invent a large conflict resolution. A conflict that reveals shared invariant ownership or invalid independence returns the affected work to one fresh `supervised-chunk` reconciliation agent. After all chunks and dependency waves are integrated and validated, retire the integrator with Paseo's protocol.

## 6. Repeat within four rounds

After integrating rounds 1–3, post one concise progress update containing the completed round, integrated chunk count, validation result, and next round; then run a fresh assembled `drift-review-duo`.

If a round is clear, verify required CI and leave the PR open for human review. Otherwise repeat chunk dispatch and integration through round 3. Round 4 is terminal: leave remaining worthwhile chunks untouched for human handoff and mark `round cap reached — not verified clear`, or mark `clear within round cap` when none remain.

Repeated findings against the same invariant in rounds 1–3 go to one `supervised-chunk` reconciliation owner rather than another local patch. Never exceed four assembled review rounds.

## 7. Final handoff and cleanup

Post or update one concise final PR comment containing:

- workflow status: `clear within round cap`, `round cap reached — not verified clear`, or `hard blocker`;
- duo rounds and review permalinks;
- deferred findings and reasons;
- material decisions; and
- residual risks.

Never merge, enable auto-merge, or replace the PR body.

Complete Paseo's final ledger reconciliation. Preserve branches and evidence for any hard blocker.
