---
name: drift-review-council
description: "Run a fixed six-expert panel that checks correctness and hunts AI-agent drift in a PR or branch: implementation-vs-intent, duplicated logic, bypassed shared modules, wrong seams, test accretion, and convention violations. Use when the user asks for a council drift review or a slop check that must also verify feature correctness."
---

# Drift Review (council)

Run a fixed panel of six experts in parallel — one correctness expert and five drift-hunting experts — then synthesize their reports.

The correctness expert judges whether the change works and matches the established review intent. The drift experts judge whether it erodes the codebase: reimplementing what exists, deleting what should be reused, inlining what should be shared, guarding what should be redesigned, and accreting what should be split. Use [council-review](../council-review/SKILL.md) or [yolo-council-review](../yolo-council-review/SKILL.md) when security, UI/UX, or other specialist coverage is also needed.

## Why these lenses

Agent-built codebases drift for economic reasons, not knowledge gaps: rewriting is cheaper than discovering, patching is cheaper than redesigning, and review-fix loops reward findings-closed over seams-fixed. Each expert below targets one of those failure economies. Anchoring precedents (from the locus audit): a shared write-ordering abstraction (`useOrderedWrite.ts`) deleted by a later `fix:` commit that shipped inline guards instead; three hand-rolled optimistic-write machines protecting the same invariant across three files; a domain constant (`CREATE_DURATION_MINUTES`) re-inlined as a bare literal at four call sites, two of which disagreed on the fallback; ~10 consecutive `fix:` commits accreting seven coordination refs around one integer in a 1,085-line component.

## Setup

1. Determine the review target: a PR number if given; otherwise the current branch's diff against the main branch.
2. Establish the review intent. For a PR, fetch its details and linked issue(s). For a branch review, use the user's stated goal and acceptance criteria plus branch/commit context. If neither source defines intent, record that limitation and restrict correctness findings to demonstrable internal bugs and regressions.
3. **Profile the target repo.** Read its `CLAUDE.md` and `AGENTS.md` and extract:
   - **Placement conventions** — where constants, pure logic, and hooks are supposed to live (e.g. `src/constants/`, `src/lib/<domain>.ts`, `src/hooks/`). These define where the duplication expert searches for existing equivalents.
   - **Protected files** — docs agents must not edit (e.g. a user-authored `VOCABULARY.md`), and doc-sync rules (e.g. agent guidance must land in both `CLAUDE.md` and `AGENTS.md`).
   - **Size/structure limits** — max component size, lint ratchets, test policy (e.g. one e2e per user-visible invariant; interleavings unit-tested on extracted machines).

   Pass the extracted profile to every expert. If the repo has no such conventions documented, say so in the final report — that absence is itself a finding — and fall back to searching the whole source tree for equivalents.

## Expert panel

Spawn **six** sub-agents in parallel — one per expert. Each reviewer uses the same base prompt with a different focus:

```
Review {target} — do not post comments anywhere; report your findings to your parent agent instead.

Stay strictly within your assigned focus. Do not report style nits or naming preferences unless they fall inside that focus. Every finding must include a concise description, a realistic failure scenario, and actual evidence: file/line references, a test result, a search result proving an equivalent exists, git history, or authoritative documentation. A finding you cannot evidence with a concrete location must be discarded, not hedged.

A realistic failure scenario has three parts, per the Failure scenario standard in pr-review: the concrete trigger (who does what, with which inputs and state, on a path a real user or caller actually takes), the mechanism (what the code then does wrong, at the cited file:line), and the real-world impact (what the person on the other end loses, sees wrong, cannot do, or is exposed to). Also say how a user reaches that state in normal use and how often. Discard — do not hedge and report — any finding whose scenario reduces to "could cause unexpected behavior," "is not ideal," or "a caller might misuse this," and any whose trigger the call sites, types, or validation already exclude.

Most drift findings are not directly user-facing, and that is not an exemption: the affected party is the next agent or developer to change this code. Name the realistic edit they will make (fixing a bug in one of the duplicated copies, changing the domain constant, adding the next guard), what silently breaks or is missed when they make it (the second copy keeps the old behavior, the two fallbacks disagree, the invariant the deleted abstraction owned goes unenforced), and the user-visible defect that reaches production as a result — a wrong duration shown, a stale value overwriting a newer save, a flow that intermittently fails. "This is duplicated" or "this violates the convention" without that chain is not a finding.

Review goal and acceptance criteria: {intent_context}
Target repo profile (placement conventions, protected files, limits): {profile}

Your expert role: {role}
Your focus areas: {focus}
```

| Expert | Role | Focus areas |
|--------|------|-------------|
| **Correctness** | Correctness & behavior reviewer | Logic bugs, edge cases, regressions, and whether the implementation matches the established review goal and acceptance criteria. Run focused tests when they can confirm or reject a finding. Do not review architecture, duplication, or conventions — the five drift experts own those concerns. |
| **Reuse & duplication** | Reimplementation hunter | For every helper, hook, constant, type, or coordination mechanism the diff **adds**: search the repo (starting from the profile's placement locations) for an existing equivalent, and report duplicates with both file:line locations. Report new hardcoded domain values (durations, bounds, thresholds) that already exist as a named constant or belong in the constants module — and especially sites where two locations use **different fallbacks for the same concept**. Check whether the diff shows any evidence the author looked before writing (imports from shared modules vs parallel local definitions). |
| **Deletion & bypass** | Shared-module sentinel | Does the diff delete, inline, or route around any shared module, abstraction, or accessor? Check `git log --diff-filter=D` for deleted files under shared locations, direct imports of raw values where an accessor exists, re-exported or copied internals of a shared module, and guards added at call sites that a shared mechanism already provides. Every finding in this lens **escalates** — it is never approved as-is, even when tests stay green, because deleting the shared mechanism is how the last drift cycle started. |
| **Seam & state ownership** | Root-cause & accretion reviewer | Whether the seams are right, not whether the behavior is right. Report: new guards, flags, refs, sequence counters, in-flight counters, or rollback state added to logic that already has several — name the invariant those guards collectively protect and who owns it (one mechanism, or scattered duplicates?). Hand-rolled async coordination living in UI components instead of an extracted, unit-testable module. Run `git log --name-only` over the touched files and report any recurring across more than two consecutive `fix:` commits. Report components growing past the profile's size limit — or already-oversized components growing at all instead of shrinking. |
| **Test integrity** | Test-accretion reviewer | New or modified specs that: pin a specific race interleaving or implementation detail through the UI (races belong in unit tests on an extracted machine); duplicate coverage of an invariant an existing spec already proves (name the existing spec); are one-off regression files or named by ticket/PR/review-round instead of behavior; or weaken/delete assertions to get green. Verify each new behavioral spec maps to a user-visible invariant, and fix-driven test changes extend the invariant's existing spec rather than adding a parallel one. |
| **Conventions & docs** | Protected-docs guardian | Edits to files the profile marks protected (e.g. a user-authored glossary) — any agent edit there is a violation regardless of content. Agent-facing guidance added to only one of the synced doc pair (e.g. `CLAUDE.md` without `AGENTS.md` or vice versa). New code placed against the profile's placement conventions (a constant outside the constants module, pure domain logic inside a component, a hook outside the hooks directory). Deleted or contradicted doc rules. |

Pass each sub-agent the target, review-intent context, the repo profile, and its row from the table above.

## Synthesis

Analyze all six reports with a critical mindset — do not accept findings at face value. The panel performs the primary exploration; adjudicate rather than re-reviewing.

- Cross-check overlapping findings; deduplicate and reconcile severity. Duplication and seam findings frequently describe the same underlying mechanism — merge them into one cluster, don't count them twice.
- **Verify the "existing equivalent" claims.** A duplication finding is only valid if the claimed original actually exists at the cited location and genuinely covers the new code's need. Behavioral differences between the copies are evidence *for* the finding (drift has already begun), not against it.
- Drop findings that lack evidence, are speculative, or fall outside the assigned expert's focus.
- **Audit every failure scenario against the standard in [pr-review](../pr-review/SKILL.md).** Drop any finding whose trigger no real user, caller, or future edit reaches, or whose impact you cannot trace to a concrete real-world consequence. A drift finding that names only the structural smell — "duplicated," "wrong location," "bypasses the shared module" — without the edit-goes-wrong chain and the user-visible defect it produces is incomplete: send it back through the chain yourself, and drop it if the chain does not close.
- Note where experts disagree and resolve with code/git evidence.
- Preserve each finding's concise description, realistic failure scenario (trigger, mechanism, real-world impact, plausibility), concrete evidence, and class through deduplication; a finding missing any of these is invalid.

## Classification

Mandatory, after dedupe, before the report. Group surviving findings into **clusters** sharing a root cause — same invariant, same state, same seam. A cluster may hold one finding. Classify every cluster; there is no default and no "unclear."

| Class | Meaning | Resolution |
|-------|---------|------------|
| `local-bug` | The seam is right; the logic inside it is wrong. | Patch it in place. |
| `convention-violation` | Right design, wrong location or duplicated symbol. Mechanically fixable with no design decision: move the constant, import the existing helper, revert the protected-doc edit, rename the spec, sync the doc pair. | Fix mechanically; no escalation. |
| `wrong-seam` | The invariant has no single owner, or lives in the wrong place. Patching treats a symptom. | Escalates to a refactor task. **Must not be patched.** |

Evidence that makes a cluster `wrong-seam` — any one is sufficient:

- The same invariant is enforced in more than one place (duplicate mechanisms, parallel guards protecting one piece of state).
- The obvious fix would add another guard, flag, or ref to state that already has several.
- A touched file recurs across more than two consecutive `fix:` commits.
- A previous abstraction covering this invariant was deleted in favor of inline guards.
- The finding lives in responsibility a component has accreted beyond what its name implies.

A `wrong-seam` cluster must state its invariant in one sentence — "UI always converges to the last server-accepted write." A cluster that cannot name its invariant is `local-bug` or `convention-violation`.

**Escalation rules.**

- `wrong-seam` clusters are reported as refactor tasks — restate the invariant, extract or redesign the mechanism that owns it (with unit tests on the extracted mechanism), then re-run the existing behavioral suite unchanged. Never report them with a patch suggestion, and never downgrade one because the patch would be smaller or the diff is already large.
- Every **deletion-or-bypass** finding is at minimum `convention-violation` and is `wrong-seam` whenever the deleted/bypassed mechanism owned an invariant. It is never waved through on green tests.

## Handoff

1. Check what has already been posted on the PR or filed as follow-up issues; drop anything already recorded unless there is a new discovery worth an update.
2. Summarize verified findings only (not what's clean), ordered by severity, sectioned by expert lens. Tag each with its cluster and classification. If the repo profile was missing conventions the panel needed, report that gap first.
3. Recommend a resolution plan in three lists: mechanical fixes (`convention-violation`), patches (`local-bug`), and refactor tasks (`wrong-seam`, each with its invariant named) — never folded together, even when a patch outranks a refactor on severity. Within those lists, organize the work into the agent-sized resolution chunks defined by [github-pr-review](../github-pr-review/SKILL.md).
4. Ask the user if they accept the plan.
5. If approved and reviewing a PR, follow [github-pr-review](../github-pr-review/SKILL.md) to post all findings and resolution chunks as one consolidated review body, never as inline comments. Always post the review as a normal comment (`COMMENT`), never as a request for changes (`REQUEST_CHANGES`). File `wrong-seam` refactor tasks as follow-up issues (via [github-issue-create](../github-issue-create/SKILL.md)) and reference them in the review.
