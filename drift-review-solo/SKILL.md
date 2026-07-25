---
name: drift-review-solo
description: "Single-agent drift review: same lenses and classification as drift-review, but you review directly instead of spawning a panel. Use for small diffs, quick slop checks, or when the token cost of a five-expert panel is not warranted."
---

# Drift Review (solo)

The single-agent version of [drift-review](../drift-review/SKILL.md). Same target, same lenses, same classification, same handoff — but **you perform the review yourself; spawn no sub-agents.**

## Procedure

1. **Read [drift-review/SKILL.md](../drift-review/SKILL.md) first.** It defines everything this skill reuses: the Setup (target + repo profile), the five lens definitions in the expert-panel table, the evidence rules, the Classification section (`local-bug` / `convention-violation` / `wrong-seam`), the escalation rules, and the Handoff. Do not improvise a variant of any of those.
2. Run the Setup exactly as written there (determine target, profile the repo's `CLAUDE.md`/`AGENTS.md`).
3. Work through the five lenses **one at a time, in table order, completing each before starting the next** — reuse & duplication, deletion & bypass, seam & state ownership, test integrity, conventions & docs. A single reviewer's failure mode is blending lenses into one shallow pass; the sequential discipline replaces the panel's isolation. For each lens, run the searches/git commands its focus prescribes — do not skip the mechanical checks (`git log --name-only`, `git log --diff-filter=D`, equivalent-symbol searches) because the diff "looks clean."
4. The evidence bar is unchanged: every finding needs a concrete location or search/git result; discard what you cannot evidence, and do not report correctness bugs or style nits.
5. Since there are no reports to cross-check, the Synthesis step reduces to: merge findings that describe the same underlying mechanism across lenses, then apply the Classification and Escalation rules from drift-review verbatim.
6. Hand off exactly as drift-review's Handoff section specifies (three separate lists: mechanical fixes, patches, refactor tasks with named invariants).
