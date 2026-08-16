# Drift-review contract

Apply this contract after the canonical `pr-review` contract. It adds drift-specific setup, lenses, classification, and handoff without weakening the canonical scope, isolation, evidence, test-usefulness, fix-verification, or output rules.

## Setup

Establish the exact target: use the supplied PR, or otherwise compare the current branch with the repository's default branch. Derive original review intent from linked issues, user goal, and acceptance criteria. Read repository instructions and record placement conventions, protected files, synced documentation, size limits, and test policy. Missing conventions are a verification limitation, not a finding.

Every expert starts fresh with only target refs, intent, repository profile, validation evidence, and one bounded focus. Never pass author rationale, prior reviews, candidate findings, expected verdicts, or another expert's output.

## Drift lenses

Apply each assigned lens mechanically rather than as generic maintainability review:

| Lens | Required checks |
|---|---|
| Reuse and duplication | Search for existing equivalents of added helpers, hooks, constants, types, and coordination mechanisms; cite both copies and verify the original covers the need. |
| Deletion and bypass | Check deleted shared files, inlined or copied internals, raw-value imports that bypass accessors, and call-site guards that route around a shared owner. |
| Scope, seam, and state ownership | Trace changed surface to intent or repository constraints; inspect guards and state machines for one invariant owner; use history to identify recurring fix accretion. |
| Test usefulness | Apply the canonical test-usefulness standard to changed tests and test-driven production code; reject tautologies, bypassed paths, and harness-only production mechanisms. |
| Conventions and docs | Check protected files, required doc synchronization, placement rules, and contradicted repository guidance. |

For structural findings, the realistic scenario names the future edit, what silently diverges or breaks, and the user-visible defect that ships. A structural label without that chain is not a finding.

## Synthesis and classification

Deduplicate reports into clusters sharing a root cause, invariant, state, or seam. Verify equivalent-code, unnecessary-scope, history, and external-document claims from source. Drop speculative, unsupported, out-of-focus, already-recorded, or implausible findings. Reassess earlier fixes against original intent and the pre-fix revision rather than treating comment-shaped code as resolution.

Classify every surviving cluster:

| Class | Meaning | Resolution |
|---|---|---|
| `local-bug` | Correct owner, incorrect behavior. | Patch in place. |
| `scope-drift` | Removable surface not required by intent, policy, or migration. | Delete or revert it without replacement. |
| `convention-violation` | Sound design in the wrong location or duplicating an established symbol. | Fix mechanically. |
| `wrong-seam` | A required invariant lacks one owner or lives in the wrong owner. | Refactor the owning mechanism; do not add a symptom patch. |

Treat a cluster as `wrong-seam` when one invariant has multiple mechanisms, the obvious fix adds another guard to already-guarded state, touched files recur across more than two consecutive fix commits, a prior owning abstraction was replaced by inline guards, responsibility has accreted beyond the component's role, or production behavior was added only for a harness. Name the invariant. Deletion or bypass is at least a convention violation and becomes wrong-seam when the bypassed mechanism owned an invariant.

## Handoff

Check existing reviews and follow-up issues first; omit already-recorded work unless new evidence requires an update. Use the canonical review output contract and group current-target work into agent-sized resolution chunks. Keep scope reductions, mechanical fixes, local patches, and wrong-seam refactors distinguishable. Ask before publishing unless the caller explicitly preauthorized it. When authorized, read and apply `github-pr-review` to publish one consolidated `COMMENT` review. Read and apply `github-issue-create` only when filing work that should not be completed in the current target.
