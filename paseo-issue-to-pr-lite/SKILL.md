---
name: paseo-issue-to-pr-lite
description: "Implement a GitHub issue through Paseo with Supervised Forge, then run up to four fresh drift-review-duo rounds whose bounded resolution chunks are handled by steered Supervised Chunk agents. Use only when the user explicitly names and requests this skill."
---

# Paseo Issue to PR Lite

Read and apply [Paseo](../paseo/SKILL.md) and the canonical [issue-to-PR loop](../paseo/references/issue-to-pr-loop.md). Do not preload the leaf skills named below; dispatch them through first-token `/skill:` prompts with task facts and the profile deltas in this file.

## Workflow profile

- **Implementation skill:** `/skill:supervised-forge`.
- **Fix skill:** `/skill:supervised-chunk`.
- **Review and publication:** `/skill:drift-review-duo` and `github-pr-review`.
- **Issue implementation mutation authority:** push the issue branch and open or update its single discovered PR.
- **Fix mutation authority:** push the cleared temporary branch only; do not open or edit a PR, merge, or integrate other chunks.
- **Required implementation handoff additions:** PR URL and current head SHA, or a concise failure report.
- **Required fixer handoff additions:** explicit scope-control outcome.

The user preauthorizes implementation, review, fix, and publication decisions. Escalate only a genuine product or repository-policy decision that evidence cannot resolve, or a significant scope increase.

When `supervised-forge` or `supervised-chunk` reports that required work exceeds the canonical boundary, launch one judge to identify the correct solution with the smallest justified expansion. Report the expansion and rationale immediately through Paseo notification; do not let the active writer absorb it silently.

Check activity every 15 minutes for stalls, loops, scope growth, or drift and send a concise progress notification. If work clearly drifts from the issue, stop the workflow and notify the human.

## Review and recovery deltas

Run each duo read-only against the exact assembled range. Publishing its canonical consolidated `COMMENT` review is preauthorized. Require concise reasons for dropped candidates and `Fix plan: None` when clear, with no intermediate analysis in the posted body.

Resume a failed review agent rather than replacing it. Read the uniquely posted review directly and never publish or request a second copy. If the same reviewer cannot produce one verifiable posted review after Paseo recovery, preserve its logs and stop as an infrastructure blocker.

Do not add a solo review after fix chunks; their persistent supervision is internal evidence, while the next branch-wide gate is the fresh assembled duo. Repeated findings against one invariant in rounds 1–3 go to one reconciliation owner rather than another local patch.

## Profile-specific final report

The canonical final report must include duo permalinks, deferred findings and reasons, material decisions, scope-control outcomes, and residual risks.
