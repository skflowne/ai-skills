---
name: drift-review-council
description: "Run a fixed six-expert panel that checks correctness and hunts AI-agent drift in a PR or branch: implementation-vs-intent, unnecessary scope, duplicated logic, bypassed shared modules, wrong seams, test accretion, and convention violations. Use only when the user explicitly names and requests this skill."
---

# Drift Review Council

Read and apply the canonical [PR review](../pr-review/SKILL.md) and shared [drift-review contract](../pr-review/references/drift-review.md). This skill owns only the six-expert topology and synthesis. Use `council-review` or `yolo-council-review` instead when security, UI/UX, or other specialist coverage is required.

## Panel

Complete the shared setup, then spawn exactly six fresh, independent, read-only reviewers in parallel: one correctness reviewer and one reviewer for each of the five drift-lens rows. Every prompt begins `/skill:pr-review` and contains only target refs, original intent and acceptance criteria, repository profile, raw validation evidence, its single focus, and an instruction to report to the parent rather than publish.

- **Correctness:** behavior, edge cases, regressions, and implementation versus intent; exclude architecture, duplication, and conventions.
- **Drift reviewers:** each applies one shared lens mechanically. Include that row's complete `Required checks` cell in the reviewer's prompt so its fresh context contains the actual searches and history checks. Exclude ordinary correctness bugs and style preferences outside that lens.

Keep reports isolated under the shared contract until every reviewer finishes.

## Synthesis and handoff

Adjudicate reports under the canonical and drift contracts rather than accepting panel consensus. Deduplicate overlapping findings into root-cause clusters, verify decisive claims from source, resolve disagreements with code and history, classify every survivor, and drop anything that fails canonical evidence or scenario requirements.

Apply the shared handoff using canonical agent-sized resolution chunks. Keep expert lens and classification as compact inline metadata only when material; never section the output by reviewer.
