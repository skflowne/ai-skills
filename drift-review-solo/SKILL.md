---
name: drift-review-solo
description: "Single-agent correctness-and-drift review: same lenses and classification as drift-review-council, but you review directly instead of spawning a panel. Use for small diffs, quick slop checks, or when the token cost of a six-expert panel is not warranted."
---

# Drift Review (solo)

The single-agent version of [drift-review-council](../drift-review-council/SKILL.md). Same target, same lenses, same classification, same handoff — but **you perform the review yourself; spawn no sub-agents.**

## Procedure

1. **Read [drift-review-council/SKILL.md](../drift-review-council/SKILL.md) first.** It defines everything this skill reuses: the Setup (target + repo profile), the six lens definitions in the expert-panel table, the evidence rules, the Classification section (`local-bug` / `convention-violation` / `wrong-seam`), the escalation rules, and the Handoff. Do not improvise a variant of any of those.
2. Run the Setup exactly as written there (determine target, establish review-intent context, profile the repo's `CLAUDE.md`/`AGENTS.md`).
3. Work through the six lenses **one at a time, in table order, completing each before starting the next** — correctness, reuse & duplication, deletion & bypass, seam & state ownership, test integrity, conventions & docs. A single reviewer's failure mode is blending lenses into one shallow pass; the sequential discipline replaces the panel's isolation. For each lens, run the tests, searches, or git commands its focus prescribes — do not skip the mechanical checks (`git log --name-only`, `git log --diff-filter=D`, equivalent-symbol searches) because the diff "looks clean."
4. The evidence bar is unchanged: every finding needs a concise description, concrete failure scenario, concrete location, and supporting evidence. Discard what you cannot evidence, and do not report style nits.
5. Since there are no reports to cross-check, the Synthesis step reduces to: merge findings that describe the same underlying mechanism across lenses, then apply the Classification and Escalation rules from drift-review-council verbatim.
6. Hand off exactly as drift-review-council's Handoff section specifies (three separate lists: mechanical fixes, patches, refactor tasks with named invariants).
