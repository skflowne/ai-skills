---
name: supervised-chunk
description: "Implement one bounded change with a single autonomous writer and one persistent independent reviewer that inspects stable work in progress, gives evidence-backed steering, and clears the final chunk without milestone-based implementation gates. Use only when the user explicitly names and requests this skill."
---

# Supervised Chunk

Implement one bounded chunk continuously as its sole author. Use exactly one persistent, independent, read-only correctness reviewer for in-progress steering and final clearance. This is not a milestone workflow: checkpoints correct trajectory without pre-slicing or stopping after every edit.

## Establish the contract

Before editing, inspect repository instructions, relevant code, tests, history, and shared abstractions. Record:

- exact scope and neighboring scope;
- owned invariant and one end-to-end owner;
- base and working refs;
- acceptance evidence and validation; and
- caller-authorized external mutations.

If the chunk overlaps another owner's invariant, dependency, or likely paths, stop for regrouping or sequencing. Use a caller-supplied branch and worktree; do not create a nested workspace or another PR.

Spawn one fresh, high-capability reviewer whose prompt begins `/skill:pr-review`. Give it only the original task or finding, the recorded contract, repository profile, refs, and raw validation evidence. Do not pass implementation rationale, intended fixes, prior conclusions, or edit authority. The canonical review skill owns scope, isolation, evidence, test-usefulness, failure scenarios, and fix verification; do not restate those policies.

## Implement and checkpoint

Reuse or extend existing owners before introducing another mechanism. Keep one owner for the invariant, add only warranted regression evidence, commit cohesive stable progress, and run proportional validation.

Request a checkpoint when stable evidence establishes direction, a material discovery changes the mechanism or owner, a failed check changes the approach, work is about to cross a risky API/schema/persistence/concurrency/lifecycle/security/destructive/platform seam, or several cohesive commits have accumulated. The reviewer must inspect at least one in-progress range and the final full range.

For a checkpoint, send only the commit range, raw validation, and factual contract updates. Continue only separable work that cannot invalidate the checkpoint or cross its seam; otherwise wait immediately. In all cases, use `subagent_wait` or the runtime equivalent to rejoin the same reviewer and adjudicate its response before advancing the affected seam or ending the turn.

Reviewer steering is:

- **must correct** — verified contract failure, regression, wrong owner, policy violation, or concrete duplication/bypass;
- **consider** — evidence-backed alternative whose trade-off depends on context; or
- **clear** — no worthwhile course correction.

Verify every item against the contract. Correct valid `must correct` findings before building on that seam; decide `consider` items from repository evidence and record the decision. Re-review corrections against the pre-fix range and original requirement until clear. A genuine unsettled product, scope, dependency, or architecture choice belongs to the caller unless the invoking workflow explicitly supplied different decision authority.

Do not stack guards around an ownerless invariant. Repeated feedback at one mechanism requires restating and fixing its owner; if that exceeds or overlaps the chunk, return it for regrouping.

## Final gate

Commit all work, run complete required validation, and ask the same reviewer to inspect the full diff against the declared base with raw evidence. Resolve and re-review every worthwhile finding until independently clear. Then perform only caller-authorized external mutations.

Return base/head SHAs, commits, invariant, changed paths, validation, checkpoint steering and decisions, scope outcome, final reviewer result, residual risks, and artifact paths. Completion requires an in-scope implementation at the owning seam, validated and independently cleared without absorbing neighboring work.
