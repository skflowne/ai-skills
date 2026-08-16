---
name: paseo-issue-to-pr
description: "Implement a GitHub issue through Paseo with Portolan Forge and CodeGraph evaluation, then run up to four autonomous drift-review-duo rounds with bounded fix dispatch before handing the PR to a human. Use only when the user explicitly names and requests this skill."
---

# Paseo Issue to PR

Read and apply [Paseo](../paseo/SKILL.md) and the canonical [issue-to-PR loop](../paseo/references/issue-to-pr-loop.md). Do not preload execution leaf skills; dispatch them through first-token `/skill:` prompts with task facts and the profile deltas below. Read supporting publication or decision skills only when the controller reaches the action that needs them.

## Workflow profile

- **Implementation and fix skill:** `/skill:portolan-forge`.
- **Supporting skill:** tell each Portolan implementer to read and apply `codegraph-evaluation`; the controller does not need its body.
- **Review and publication:** `/skill:drift-review-duo` and `github-pr-review` under the recovery protocol below.
- **Issue implementation mutation authority:** push the issue branch and open or update its single discovered PR.
- **Fix mutation authority:** push the cleared temporary branch only; do not open or edit a PR, merge, or integrate other chunks.
- **Required implementation handoff additions:** branch, PR URL, decision log, and committed CodeGraph report.
- **Required fixer handoff additions:** committed CodeGraph report and scope outcome.

If Portolan reports that required work exceeds the workflow boundary, stop that implementation and adjudicate the expansion before continuing.

The user preauthorizes implementation and review decisions. When repository evidence does not dictate direction, read and apply `trade-off-analysis`, but override its user-decision handoff: choose the strongest option, continue, and record the choice, alternatives, material trade-offs, and assumptions. Prefer the safest reversible option when evidence remains unavailable.

Only findings introduced by the branch or required by the issue are eligible for dispatch. Eligible bugs are worthwhile. Issue-owned wrong-seam refactors are current-PR chunks when strongly likely to make the requested work safer, overriding the duo's default follow-up handoff. Apply the autonomous trade-off rule to other eligible findings.

Stop early only for a hard external blocker: unavailable credentials for both reviewer and controller, inaccessible remote, unsafe irreversible action outside the requested lifecycle, unresolved live-writer ambiguity, or infrastructure failure that survives the recovery below.

## Review publication recovery

For every round, create a unique recovery-artifact directory outside Git worktrees and record it in the Paseo ledger. The review agent atomically writes JSON containing the PR number, exact reviewed `headRefOid`, round, `event: "COMMENT"`, complete body, and body SHA-256 before publication. Its body begins `## Automated drift review — Round <n>/4`. The artifact is publication recovery data, never a findings handoff.

Create the review workspace from the exact fetched PR head with a collision-resistant review-only slug. Verify its clean canonical path is unique and separate from every writer workspace. Quarantine ambiguous path collisions rather than using or deleting them.

Use the least-privileged provider mode that permits authenticated GitHub access (`full-access` for Codex). Before consuming the round, have that same agent run `gh auth status`, `gh api user`, and a PR-head read. Use reviewer-publish mode when child access succeeds, controller-publish mode when only controller access succeeds, and stop before substantive review when both fail.

The substantive duo task receives only the canonical review inputs plus the round heading, publication mode, artifact path, and these overrides: publishing is preauthorized; keep dropped candidates internal; after the required round heading, use the canonical concise output (`No findings.` when clear); return only the verified permalink on child success or `PUBLISH_RECOVERY_REQUIRED <artifact-path> <error-category>` otherwise.

After the agent idles, query GitHub by the unique round heading:

1. If exactly one review exists, verify its body, hash, permalink, author, and reviewed head, then use it.
2. If duplicates exist, do not post again; preserve evidence and stop.
3. If none exists, validate the artifact schema, hash, PR, round, event, and head against the ledger and current PR. A moved head goes back to the same reviewer for reassessment and artifact replacement.
4. Recheck controller authentication and review absence immediately before posting. Then read and apply `github-pr-review` to post the artifact's exact `{event, body}`; never edit it.
5. Treat an ambiguous post as unknown. Query by heading and body hash, and retry only after proving absence.
6. Verify exactly one landed review and delete the recovery artifact during final cleanup.

A child publication failure never authorizes a replacement reviewer. Stop as a hard publication blocker only when the finalized artifact cannot be recovered or neither reviewer nor controller can publish and verify it.

## Profile-specific final report

The canonical final report additionally includes CodeGraph report links and whether each review was reviewer-published or controller-recovered. Add material decisions or justified refactors only when nonempty, one line each; never emit empty sections or `None` placeholders.
