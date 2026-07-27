---
name: drift-review-duo
description: "Lightweight two-expert review: one correctness-vs-review-intent reviewer and one drift reviewer in parallel, then aggregate, classify, and hand off. Use for routine PRs or branches where a full council is overkill but both 'does it meet the goal' and 'does it erode the codebase' must be checked."
---

# Drift Review (duo)

Run **two** expert reviewers in parallel — correctness against the established review intent, and drift against the codebase — then synthesize. The middle ground between a solo pass and a full [drift-review-council](../drift-review-council/SKILL.md): every change gets both questions asked, by reviewers whose incentives don't mix (a correctness reviewer closes findings with patches; a drift reviewer must be free to say the patch is the problem).

## Setup

Run the Setup from [drift-review-council](../drift-review-council/SKILL.md) exactly as written there: determine the target (PR number, else current branch vs main), establish review intent from linked issue(s) or branch context, and build the repo profile from the target's `CLAUDE.md`/`AGENTS.md`. Pass the target and intent context to both experts, plus the repo profile to the drift expert.

## Expert panel

Spawn **two** sub-agents in parallel:

**Correctness expert** — uses the council base prompt:

```
Review {target}, but don't post comments anywhere — report your findings to your parent agent instead.

Provide actual evidence for every claim. Do not rely on hypotheticals that are unlikely to materialize. If unsure, search the codebase or fetch relevant docs. For every finding, provide a concise description, a realistic failure scenario, and evidence (for example file/line references, a test result, or authoritative documentation).

A realistic failure scenario has three parts, per the Failure scenario standard in pr-review: the concrete trigger (who does what, with which inputs and state, on a path a real user or caller actually takes), the mechanism (what the code then does wrong, at the cited file:line), and the real-world impact (what the person on the other end loses, sees wrong, cannot do, or is exposed to). Also say how a user reaches that state in normal use and how often. Discard — do not hedge and report — any finding whose scenario reduces to "could cause unexpected behavior," "is not ideal," or "a caller might misuse this," and any whose trigger the call sites, types, or validation already exclude.

Review goal and acceptance criteria: {intent_context}

Your expert role: Correctness & behavior reviewer
Your focus areas: Logic bugs, edge cases, incorrect behavior, regressions, and whether the implementation matches the established review goal and acceptance criteria. Do not review architecture, duplication, or conventions — a second expert owns those.
```

**Drift expert** — uses the base prompt from [drift-review-council](../drift-review-council/SKILL.md), with its five drift lens rows (excluding correctness) combined into a single focus. Pass it the target, intent context, and repo profile, and instruct it to work the lenses **one at a time, in table order** (reuse & duplication → deletion & bypass → seam & state ownership → test integrity → conventions & docs), running each lens's mechanical checks (`git log --name-only`, `git log --diff-filter=D`, equivalent-symbol searches) rather than one blended pass. Same evidence bar: every finding needs a concise description, a realistic failure scenario, and a concrete location or search/git result; discard anything missing one, and keep correctness bugs and style nits out of this expert's scope. Pass this expert the drift-specific form of the scenario requirement verbatim from drift-review-council's base prompt — the affected party is the next agent or developer to change the code, so the finding must name the realistic edit they will make, what silently breaks when they make it, and the user-visible defect that reaches production as a result. "This is duplicated" or "this violates the convention" without that chain is not a finding.

## Synthesis

Adjudicate both reports with a critical mindset — do not accept findings at face value, and do not start a third broad review.

- Deduplicate across the two reports; where both flag the same code, keep the drift framing if the defect is structural and the correctness framing if it is behavioral — one cluster, not two findings.
- Verify duplication claims (the cited original must exist and cover the need) and any external-doc claims (WebFetch before assigning severity).
- Drop unevidenced or speculative findings from either expert.
- **Audit every failure scenario against the standard in [pr-review](../pr-review/SKILL.md).** Drop any finding whose trigger no real user, caller, or future edit reaches, or whose impact you cannot trace to a concrete real-world consequence — do not rescue it by downgrading it to a nit. A drift finding that names only the structural smell, without the edit-goes-wrong chain and the user-visible defect it produces, is incomplete: close the chain yourself, and drop it if it does not close.

Then apply the **Classification** and **Escalation rules** from [drift-review-council](../drift-review-council/SKILL.md) verbatim, to **all** surviving clusters — including the correctness expert's: a behavioral bug whose obvious fix is another guard on already-guarded state is `wrong-seam`, no matter which expert found it. Correctness findings with a sound seam are `local-bug`.

## Handoff

Follow drift-review-council's Handoff: check what's already posted, summarize verified findings by severity sectioned by expert, and recommend the plan as three separate lists — mechanical fixes (`convention-violation`), patches (`local-bug`), refactor tasks (`wrong-seam` with named invariants) — organized into the agent-sized resolution chunks defined by [github-pr-review](../github-pr-review/SKILL.md). Ask the user before posting; if approved, use that skill to post all findings and chunks as one consolidated review body, never as inline comments. Always post the review as a normal comment (`COMMENT`), never as a request for changes (`REQUEST_CHANGES`). File refactor tasks as follow-up issues via [github-issue-create](../github-issue-create/SKILL.md).
