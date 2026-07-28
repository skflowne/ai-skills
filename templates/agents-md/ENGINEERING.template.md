# Engineering contracts

Conditional implementation rules for `<PROJECT>`. [`AGENTS.md`](./AGENTS.md) defines when this file must be read and owns the universal workflow and verification gate.

## Ownership discovery and migrations

Before adding or relocating a <MODULE_WORD>, shared helper, type, constant, <WIRE_SHAPE_WORD>, identity, cache, or stateful mechanism:

1. <SURFACE_INSPECTION_CMD — e.g. `go doc ./internal/<pkg>`, or "read the module header and exported names"> and inspect its imports and consumers one hop out. Read exported names and signatures before bodies.
2. Search for the concept **and for code serving the same role under a different name**. Two modules can play the same role without sharing an identifier; the duplicate you are about to create is often invisible to grep and obvious from a list of exports.
3. Check recent history when the file is stateful or repeatedly fixed.
4. Name the owner in one sentence: "X owns Y."

Apply this proportionally; a local implementation detail needs no architecture report. If you add a second implementation anyway, state what you searched for and why the existing one did not fit.

For a cross-<MODULE_WORD> migration of a shared type, <WIRE_SHAPE_WORD>, identity, or state representation, record a search-derived inventory of its producers, consumers, serializers, validators, default/fallback sites, identity or cache-key builders, and superseded helpers. Migrate every production occurrence or document why it is unaffected. Repeat the inventory against the final diff.

When work is delegated, one integrator owns the shared contract, merged inventory, and end-to-end acceptance. Delegated slices do not independently redesign the seam or add local adapters to avoid it.

## Ownership and boundaries

A domain decision or invariant has one owner. Duplication is a defect when two locations can independently change the same behavior; similar local mechanics are not automatically one concept.

- Constants live with the <MODULE_WORD> owning their meaning. <SHARED_CORE_MODULE> contains only stable cross-<MODULE_WORD> contracts and defaults, not general utilities.
- Callers use an owning accessor or formula instead of importing raw values and rebuilding part of the decision.
- Shared helpers, fixtures, <WIRE_SHAPE_WORD> adapters, and lifecycle mechanisms have one implementation. Extend that owner rather than creating a local fork.
- Values crossing a process, protocol, or persistence boundary are decoded, validated, and defaulted once by the owning <MODULE_WORD>. Downstream code receives a valid domain value or an explicit error; it does not reconstruct the value from primitives, assign semantic meaning to an empty value, or maintain a local validator.
- Existing violations are debt, not precedent. When touched, bring the concept under one owner.
- Never bypass, inline, or delete a shared abstraction merely to close a bug or review finding. Repair or replace it and migrate all callers coherently.

Allowed production dependencies and stable ownership:

| <MODULE_WORD> | Owns | May import |
| --- | --- | --- |
| `<module>` | <the decisions it is the single source of truth for> | <its permitted edges> |

<Fill from the real import graph. Rows that describe intent rather than reality make the table
unusable as a review instrument.>

Tests may depend on the <MODULE_WORD> exercised and <SHARED_TEST_INFRA>. Keep dependencies acyclic. A new production edge means responsibility moved; update the <MODULE_WORD> graph in `<ARCHITECTURE_DOC>` in the same change.

<NEGATIVE_INVARIANTS — the two or three "nothing outside X does Y" rules that this codebase has
actually been burned by. Portolan: "Nothing outside `internal/lsp` parses LSP JSON. Telemetry users
depend on `core.Logger`, not a sink. Caller-supplied paths enter through the tools normalization
boundary, not ad hoc `filepath.Abs` calls." These are worth more than any general principle above.>

## Accessors, identities, and <PUBLIC_SURFACE_WORD> calls

- <Name each accessor that owns a decision and the raw value callers must stop reading, e.g.
  "Effective caps come from `Config.Cap()`; callers do not read `DefaultMaxResults` or repeat its
  fallback.">
- A formula owns every bound of its decision; callers do not centralize one side and recreate the other. Where a shared module wraps a constant in a function, that function is the only way in; declaring a bound as-is is a direct read and stays fine.
- Each cache or deduplication mechanism has one canonical identity builder used for lookup, insertion, invalidation, and telemetry correlation. Its key includes every semantic discriminator; changing it preserves or deliberately revises each documented normalization property and its tests.

Every <PUBLIC_SURFACE_WORD> call:

1. <the ordered contract every call path must satisfy — snapshot, emit, normalize, cap, honor
   cancellation, return honest-empty, surface failures as structured errors rather than crashes>;

New <PUBLIC_SURFACE_WORD>s satisfy these rules through shared mechanisms rather than by copying an existing implementation. If the shared initializer is missing, add it instead of reproducing its fields.

## State and structural ratchets

- Retries, in-flight tracking, ordering, shutdown sequencing, resource ownership, and rollback belong in a named, unit-testable owner, not flags scattered across handlers or component state.
- A mutable fact has one write path. Derived views and caches are not independent sources of truth; changes flow through the owner's transition API. Enumerate the applicable creation, update, reconnect or restart, recovery, invalidation, and shutdown transitions before changing that state. Adding another synchronization writer is a signal to consolidate ownership instead.
- When a fix would add another guard, flag, counter, fallback, or rollback branch to already complex state, consolidate the state and fix its owner in the same change.
- When a stateful seam appears across more than two consecutive fix commits, refactor its ownership now instead of stacking another patch.
- Migrate an invariant atomically. Do not leave parallel old/new mechanisms unless an evidenced external compatibility requirement demands it.
- Do not add speculative compatibility shims, fallbacks, retries, or defensive branches without an evidenced caller or failure mode.
- <EXTERNAL_WORK_PATHS — the call paths that must not do unbounded or serial per-item external
  work> do not perform unbounded or serial per-item external work. A timeout bounds the whole operation, not merely each item; subprocess, network, and disk work is batched, cached, or concurrency-limited as appropriate and always honors cancellation.

<!--
ADAPTATION NOTES — delete this block once resolved.

The two sections that carry the weight are the ownership table and the accessor list. Both are
project-specific by nature: they name real symbols. A generic version of either is decoration.

Write the accessor list from the bugs you have actually shipped. Each entry should read as
"<decision> comes from <owner>; callers do not <the thing that caused the drift>".

Drop "State and structural ratchets" bullets that describe machinery this project does not have
(no concurrency → drop the synchronization bullets). Keep the write-path and consolidation bullets;
they apply to any codebase with mutable state, including a client-side store.
-->
