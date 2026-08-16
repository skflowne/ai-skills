---
name: drift-review-solo
description: "Single-agent correctness-and-drift review using the same lenses and classification as drift-review-council, but reviewing directly instead of spawning a panel. Use only when the user explicitly names and requests this skill."
---

# Drift Review Solo

Read and apply the canonical [PR review](../pr-review/SKILL.md) and shared [drift-review contract](../pr-review/references/drift-review.md). Perform the review directly; spawn no sub-agents.

## Procedure

1. Complete the shared setup and establish the canonical review boundary.
2. Work through six lenses one at a time: correctness, then the five drift-lens rows in table order. Finish each before starting the next so one reviewer does not blend them into a shallow pass.
3. For correctness, inspect behavior, edge cases, regressions, and implementation versus intent. For each drift lens, perform its complete `Required checks`, including equivalent searches, deletion and bypass history, fix-accretion history, test usefulness, and repository conventions.
4. Apply the canonical evidence and failure-scenario standards to every candidate. For structural findings, use the shared future-edit-to-user-defect scenario. Discard unsupported, speculative, stylistic, or implausible candidates.
5. Deduplicate findings across lenses, verify decisive claims from source, reassess earlier fixes against original intent and the pre-fix revision, and classify every survivor under the shared drift contract.
6. Apply the shared handoff and canonical concise output. Keep separate lens verdicts and dropped candidates internal; use one findings list and one resolution-chunks plan only when findings survive.
