# TESTING.md

Automated-test policy for `<PROJECT>`. [`AGENTS.md`](./AGENTS.md) owns the conventions that apply to
every change, including the verification gate every change must pass. **This file is the canonical
copy of the rules below**; read it before writing or changing a test or test infrastructure, and do
not restate its rules in `AGENTS.md`.

## Test layers

<N> layers, each owning a different class of failure. <One sentence on why one layer is not enough
here — name the boundary the cheap layer cannot cross.>

| Layer | Where | Runs against | Owns |
| --- | --- | --- | --- |
| <name> | <paths> | <the real or stubbed thing> | <the class of failure only this layer catches> |

Choose the layer by pushing the test down until it can no longer fail for the reason you care about,
then stop. Specifically:

- Behavior derivable from inputs belongs in a unit test with a stub. Stubbing is not a shortcut
  here — it is what makes the <PUBLIC_SURFACE_WORD> contract in `ENGINEERING.md` cheap enough to
  assert on every path.
- Anything crossing a **process boundary, protocol wire, or real UI** belongs at the integration or
  end-to-end layer. Faking one asserts our assumptions about the dependency, not the dependency.
- Anything with **shared mutable state or a lifecycle** spans two layers at once, under the
  one-end-to-end-home rule below. Do not try to prove a race through an end-to-end test, and do not
  let an owner-level race test stand in for the user-visible invariant.
- When a value or invariant crosses <MODULE_WORD>s, processes, or protocol boundaries, one
  integration or end-to-end test follows it from its authoritative producer through a final
  consumer, including the relevant live-state transition. Module-local mocks do not prove
  propagation completeness.

<WHICH_SUITES_ARE_GATES — state explicitly which suites join the gate in `AGENTS.md` and which are
measurement-only, plus any exception and its justification.>

<SKIP_CONDITIONS — the environments in which a layer silently skips.> **A skip is not a pass.** Do
not complete a change whose only coverage sits in a layer that skipped locally; report any skip in
the gate output.

## Red-green procedure

Develop behavioral changes red-green at the lowest deterministic layer:

1. Write or extend the behavior test first.
2. Confirm it fails against pre-change code **for the expected reason** — a bugfix test must
   reproduce the bug, a feature test must fail because the feature is absent. A test that passes
   before the implementation verifies nothing. Use an isolated worktree when the current tree has
   changes; never checkout over another agent's work.
3. Implement the complete fix, including required ownership changes.
4. Run focused tests, then the full gate in `AGENTS.md`, and report actual output.

<EXTRA_RIGOR — e.g. "Concurrency and lifecycle changes require focused race coverage in addition to
running the race-enabled packages.">

<ISOLATION_REQUIREMENTS — if step 2 can damage shared developer state (a shared dev database, a
fixed port, a global cache), state exactly how to isolate it and what must never be left dirty or
committed. This is the rule agents violate most often, because the damage lands on someone else.>

## Test integrity

Tests must:

- use durable behavior names, never PR, issue, review-round, or author identifiers — in file paths
  and in test titles alike; the git history already links the change to the PR;
- extend the existing behavior area instead of adding a parallel regression file;
- keep one end-to-end home per user-visible or protocol invariant, with race interleavings and state
  transitions tested directly on their owner;
- never weaken or delete an assertion merely to make output pass;
- derive expected values independently of the production decision under test;
- use source-shape assertions only for exact architectural prohibitions that behavioral tests cannot
  express cheaply; target a specific forbidden construct, import, or bounded count rather than a
  broad substring-presence check; and
- reuse <SHARED_TEST_INFRA> for setup, readiness, cleanup, and environment; never invent a parallel
  harness.

When changing an existing test, account for every removed case, assertion, platform path, and
normalization property. Adapt the old regression contract before adding coverage for a new one.
Organize tests by behavior and split files that have become collections of unrelated regressions.

<FIXTURE_POLICY — whether fixtures pin to product constants or keep their own literals, and why.
Both answers are defensible; an unstated answer produces both in the same repo.>

<!--
ADAPTATION NOTES — delete this block once resolved.

The layer table is the point of this file. Fill the "Owns" column with the class of failure only
that layer can catch. If two rows own the same thing, delete one. If a row's "Owns" cell reads
"correctness", it has not been thought about yet.

"A skip is not a pass" earns its place only if some layer actually skips in some environment. If
nothing skips here, delete it — an inapplicable rule teaches agents that rules are optional.

Temporary policy (a known-bad workaround pending a fix) belongs in a clearly marked subsection with
a live issue link and an explicit deletion condition: "When #29 ships, delete this subsection."
Undated debt notes become permanent.
-->
