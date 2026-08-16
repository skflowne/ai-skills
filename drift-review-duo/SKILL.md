---
name: drift-review-duo
description: "Run a lightweight two-expert review with one correctness-vs-review-intent reviewer and one drift reviewer in parallel, then aggregate, classify, and hand off. Use only when the user explicitly names and requests this skill."
---

# Drift Review Duo

Read and apply the canonical [PR review](../pr-review/SKILL.md) and shared [drift-review contract](../pr-review/references/drift-review.md). This skill owns only the two-expert topology and synthesis.

## Panel

Complete the shared setup, then spawn exactly two fresh, independent, read-only reviewers in parallel. Each prompt begins `/skill:pr-review` and contains only target refs, original intent and acceptance criteria, repository profile, raw validation evidence, its focus below, and an instruction to report to the parent rather than publish:

- **Correctness:** behavior, edge cases, regressions, and implementation versus intent. Exclude architecture, duplication, and conventions.
- **Drift:** apply the five shared drift lenses one at a time in table order—reuse and duplication; deletion and bypass; scope, seam, and state ownership; test usefulness; conventions and docs. Include the complete `Required checks` cell for all five rows in this reviewer's prompt so its fresh context contains the actual searches and history checks. Exclude ordinary correctness bugs and style preferences.

Keep outputs isolated under the shared contract until both finish.

## Synthesis and handoff

Adjudicate both reports under the canonical and drift contracts; do not launch a third broad review. Deduplicate overlapping behavior and structural findings into one root-cause cluster, verify decisive claims from source, classify every survivor, and drop anything that fails canonical evidence or scenario requirements.

Apply the shared handoff using canonical agent-sized resolution chunks. Keep dropped candidates and separate expert verdicts internal unless a verified deferred risk materially changes the user's next action.
