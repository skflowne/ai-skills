---
name: supervised-chunk
description: "Implement one bounded change with a single autonomous writer and one persistent independent reviewer that inspects stable work in progress, gives evidence-backed steering, and clears the final chunk without milestone-based implementation gates. Use only when the user explicitly names and requests this skill."
---

# Supervised Chunk

Implement one bounded chunk continuously. The primary agent owns all code and test changes. Use exactly one persistent, independent, read-only correctness reviewer to inspect stable work in progress, steer the implementation when evidence warrants it, and review the completed chunk.

This is not a milestone workflow. Do not pre-slice the chunk into implementation milestones, stop after every behavior-bearing edit, or require every checkpoint to clear before continuing. Checkpoints are lightweight opportunities to correct trajectory while the primary remains responsible for delivery.

## Contract and ownership

Before editing:

1. Read repository instructions and inspect the relevant code, tests, history, and shared abstractions.
2. Record the chunk's exact scope, acceptance evidence, base ref, owned invariant, neighboring scope that must not be absorbed, and required validation.
3. Confirm that this chunk has one end-to-end owner. If it overlaps another chunk's invariant, dependency, or likely paths, stop and report that the chunks must be regrouped or sequenced.
4. Use the existing dedicated branch and worktree when the caller supplied them. Do not create a nested worktree or another PR unless explicitly required.
5. Spawn one high-capability reviewer with fresh context and no edit authority. Begin its prompt with `/skill:pr-review` so it applies the canonical scope, isolation, fix-verification, failure-scenario, and test-usefulness contract. Give it only the original finding or task, chunk contract, invariant, base and working refs, repository instructions, acceptance evidence, and neighboring constraints; do not give it implementation rationale, intended fixes, or prior reviewer conclusions.

The reviewer checks correctness, regressions, lifecycle and state ownership, architecture, repository compliance, reuse, and whether useful evidence proves the chunk contract. It does not co-author code, expand product scope, invent test requirements, or run a competing implementation. Requiring evidence for required behavior does not authorize production test hooks, environment branches, public APIs, dependencies, or lifecycle changes solely for the harness.

Every reviewer finding must include a realistic trigger, the mechanism at `file:line`, concrete impact, frequency or likelihood, and supporting evidence. For structural findings, identify the realistic future edit, what would silently break, and the resulting user-visible defect. Drop speculative findings and style preferences.

## Continuous implementation

The primary chooses the implementation sequence and works autonomously toward the complete chunk. It should:

- reuse or extend existing mechanisms before introducing new ones;
- preserve one owner for the chunk's invariant;
- add automated regression evidence only when the task, repository policy, or an uncovered realistic defect in required user/caller behavior or core logic warrants it, and require every test to satisfy the canonical test-usefulness standard;
- commit cohesive, stable progress so the reviewer can inspect exact ranges; and
- keep validation proportional while implementation is underway.

Do not wait for a reviewer after every edit. Launch checkpoint reviews asynchronously when supported and continue useful work only when it cannot invalidate the checkpoint or cross the seam under review. If no such work exists, wait immediately. In every case, use `subagent_wait` or the runtime's equivalent to receive and adjudicate the checkpoint before crossing its affected seam, finalizing the chunk, or ending the turn.

## Event-driven review checkpoints

Request review when there is stable evidence worth inspecting, not on a timer and not against half-written files. At minimum, the reviewer must inspect the chunk once during implementation and once at the final gate. Additional checkpoints are required when:

- the first meaningful implementation establishes the chunk's direction;
- repository evidence forces a material change to the intended mechanism or invariant owner;
- a failed test or unexpected dependency changes the approach rather than merely requiring a local correction;
- work is about to build on a risky API, schema, persistence, concurrency, lifecycle, security, destructive, or platform seam; or
- several cohesive commits have accumulated without independent inspection.

For each checkpoint, give the persistent reviewer only the commit range, raw validation evidence, and any factual contract update. Do not summarize intended fixes, defend the design, or prescribe conclusions. The reviewer inspects the repository and diff directly.

The reviewer returns concise steering:

- **must correct** — verified acceptance failure, regression, wrong-seam ownership, repository-policy violation, or concrete duplication/bypass that can produce a defect;
- **consider** — evidence-backed alternative whose trade-off depends on context; or
- **clear** — no worthwhile course correction at this checkpoint.

The primary verifies every steering item against the original chunk contract. Correct valid `must correct` findings before building further on the affected seam, but do not implement a reviewer's preferred mechanism merely to close its wording. On every fix re-review, the reviewer inspects the fix range against the pre-fix revision and original requirement; it must retract invalid findings and immediately reject symptom patches, misplaced test mechanisms, and test-only production hooks as wrong-seam work. Accept or reject `consider` items using repository evidence and record the decision. A genuine product, scope, dependency, or architecture choice not settled by repository evidence goes to the caller; the reviewer cannot decide it.

Reuse or resume the same reviewer session for every checkpoint so it retains the chunk contract and prior decisions. After every request, rejoin that reviewer and adjudicate its response before the checkpoint's deadline above. A reviewer response is workflow input, not completion. If the reviewer is unavailable, report the loss of independent supervision instead of silently self-reviewing.

## Avoid patch accretion

Do not stack local guards around an invariant with no clear owner. If checkpoint feedback repeatedly reaches the same mechanism or identifies a wrong seam, restate the invariant and fix its owning mechanism. If that redesign exceeds the chunk contract or overlaps another chunk, stop and return it for regrouping rather than absorbing neighboring work.

## Final gate and handoff

When implementation and focused validation are complete:

1. Commit all chunk work and run the repository-required validation for the complete chunk.
2. Ask the persistent reviewer to inspect the full chunk diff against its declared base with raw final evidence, then wait for its response.
3. Verify and correct every worthwhile finding, rerun invalidated checks, commit corrections cohesively, and request and await final re-review until clear. Clearance requires a correct, in-scope implementation at the owning seam with useful regression evidence where warranted; matching a prior comment or producing green output is insufficient.
4. Push only when the caller authorized it. Do not open, edit, merge, or enable auto-merge on a PR unless explicitly assigned.
5. Return a compact handoff containing base/head SHAs, commits, owned invariant, changed paths, validation, checkpoint steering and decisions, final reviewer outcome, residual risks, and artifact paths.

Completion requires the bounded chunk to be implemented, validated, independently cleared, and handed off without absorbing neighboring chunks.
