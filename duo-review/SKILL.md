---
name: duo-review
description: "Lightweight two-expert review: one correctness-vs-issue-intent reviewer and one drift reviewer in parallel, then aggregate, classify, and hand off. Use for routine PRs where a full council is overkill but both 'does it do what the issue asked' and 'does it erode the codebase' must be checked."
---

# Duo Review

Run **two** expert reviewers in parallel — correctness against the issue, and drift against the codebase — then synthesize. The middle ground between a solo pass and a full [council-review](../council-review/SKILL.md): every change gets both questions asked, by reviewers whose incentives don't mix (a correctness reviewer closes findings with patches; a drift reviewer must be free to say the patch is the problem).

## Setup

Run the Setup from [drift-review](../drift-review/SKILL.md) exactly as written there: determine the target (PR number, else current branch vs main), fetch PR details and linked issue(s), and build the repo profile from the target's `CLAUDE.md`/`AGENTS.md`. The issue context feeds the correctness expert; the profile feeds the drift expert.

## Expert panel

Spawn **two** sub-agents in parallel:

**Correctness expert** — uses the council base prompt:

```
/pr-review {target}, but don't post inline comments — report your findings to your parent agent instead.

Provide actual evidence for every claim. Do not rely on hypotheticals that are unlikely to materialize. If unsure, search the codebase or fetch relevant docs. For every finding, provide a concise description, a concrete failure scenario explaining why it is bad, and evidence (for example file/line references, a test result, or authoritative documentation).

Your expert role: Correctness & behavior reviewer
Your focus areas: Logic bugs, edge cases, incorrect behavior, regressions, and whether the implementation matches the issue intent and acceptance criteria. Do not review architecture, duplication, or conventions — a second expert owns those.
```

**Drift expert** — uses the drift base prompt from [drift-review](../drift-review/SKILL.md), with all five lens rows from its expert-panel table combined into a single focus. Pass it the repo profile and instruct it to work the lenses **one at a time, in table order** (reuse & duplication → deletion & bypass → seam & state ownership → test integrity → conventions & docs), running each lens's mechanical checks (`git log --name-only`, `git log --diff-filter=D`, equivalent-symbol searches) rather than one blended pass. Same evidence bar: findings without a concrete location or search/git result are discarded; correctness bugs and style nits are out of scope for this expert.

## Synthesis

Adjudicate both reports with a critical mindset — do not accept findings at face value, and do not start a third broad review.

- Deduplicate across the two reports; where both flag the same code, keep the drift framing if the defect is structural and the correctness framing if it is behavioral — one cluster, not two findings.
- Verify duplication claims (the cited original must exist and cover the need) and any external-doc claims (WebFetch before assigning severity).
- Drop unevidenced or speculative findings from either expert.

Then apply the **Classification** and **Escalation rules** from [drift-review](../drift-review/SKILL.md) verbatim, to **all** surviving clusters — including the correctness expert's: a behavioral bug whose obvious fix is another guard on already-guarded state is `wrong-seam`, no matter which expert found it. Correctness findings with a sound seam are `local-bug`.

## Handoff

Follow drift-review's Handoff: check what's already posted, summarize verified findings by severity sectioned by expert, and recommend the plan as three separate lists — mechanical fixes (`convention-violation`), patches (`local-bug`), refactor tasks (`wrong-seam` with named invariants) — organized into the agent-sized resolution chunks defined by [github-pr-review](../github-pr-review/SKILL.md). Ask the user before posting; if approved, use that skill to post all findings and chunks as one consolidated review body, never as inline comments, and file refactor tasks as follow-up issues via [github-issue-create](../github-issue-create/SKILL.md).
