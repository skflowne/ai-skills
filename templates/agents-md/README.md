# AGENTS.md template

These templates bootstrap repository rules for coding agents. Their purpose is to keep entropy under
control as agents change a codebase: ownership stays explicit, shared decisions do not fork,
verification remains executable, and project conventions do not drift into contradictory copies.

They are starting points, not drop-in policy. Adapt them to the target repository through an
interview between a maintainer and an agent. The maintainer supplies the architecture, recurring
failure modes, operating constraints, and intended conventions; the agent inspects the repository,
turns that knowledge into concrete and verifiable rules, and flags claims that do not match the
code. Delete anything that is not true for the target repository.

The result is a four-file convention set:

```
CLAUDE.md        one line: @AGENTS.md          — never a second copy of the rules
AGENTS.md        canonical, always read        — workflow, core rules, gate, handoff
ENGINEERING.md   read when the trigger fires   — ownership, boundaries, state
TESTING.md       read when the trigger fires   — layers, red-green, test integrity
```

## Why this shape

**One canonical copy per rule.** Every rule lives in exactly one file. `AGENTS.md` routes to
`ENGINEERING.md` and `TESTING.md`; it never restates them. A rule stated twice drifts, and an agent
that finds two versions obeys the wrong one.

**Conditional depth costs nothing on trivial changes.** `AGENTS.md` is small enough to always be in
context. The expensive material sits behind explicit read-triggers ("read `ENGINEERING.md` before
doing X"), so a typo fix does not pay for the package-boundary table.

**Triggers are enumerated, not judged.** "Read this before adding a package, shared helper, type,
constant, protocol shape, identity, cache, or stateful mechanism" fires reliably. "Read this for
significant changes" does not — the agent that most needs the rule is the one that thinks its change
is small.

**Every rule is verifiable against the diff.** The gate is a literal command block whose output must
be reported. Rules are written as things a reviewer can check, not as aspirations.

**Rules name the failure they prevent.** `no bare literals` is ignorable; `a constant that mirrors a
schema default must be pinned by a test, because drift shows up as the UI rendering one value and
snapping to another once settings load` is not.

## Adapting it

1. Copy the four `*.template.md` files into the repo, dropping `.template`.
2. Have a maintainer and agent walk through the placeholders together. Interview for the repository's
   actual ownership boundaries, architectural constraints, testing layers, recurring failure modes,
   verification commands, and documentation sources of truth.
3. Resolve every `<PLACEHOLDER>`. Grep for `<` when done — none should remain.
4. Delete sections that do not apply. An inapplicable rule teaches agents that rules are optional.
5. Fill the ownership table in `ENGINEERING.md` from the real dependency graph, not from intent.
   If it does not match `git grep` of the imports today, it is fiction.
6. Fill the layer table in `TESTING.md` with what each layer *owns* — the class of failure only it
   can catch. If two rows own the same thing, one is redundant.
7. Run the gate yourself and paste the real command names. A gate that does not run is worse than
   no gate.

## Keeping it honest

- New rules go in the file that owns that topic, never in a second place "for visibility".
- When a rule is repeatedly violated, the rule is usually too abstract — rewrite it with the
  concrete trigger and the concrete failure.
- Delete a rule the moment it stops being true. Debt sections carry a live issue link and a
  deletion condition (see the pattern in `TESTING.template.md`).
- Project-specific living docs (plan, architecture, design, vocabulary) are referenced from the
  `AGENTS.md` header, and each one owns its topic exclusively.
