# AGENTS.md

Conventions for every change in `<PROJECT>`. This is canonical; [`CLAUDE.md`](./CLAUDE.md) imports it. Read the relevant parts of [`<PLAN_DOC>`](./<PLAN_DOC>) for decisions and sequence and [`<ARCHITECTURE_DOC>`](./<ARCHITECTURE_DOC>) for current system and module structure.

Read [`ENGINEERING.md`](./ENGINEERING.md) before adding or relocating a <MODULE_WORD>, shared helper, type, constant, <WIRE_SHAPE_WORD>, identity, cache, or stateful mechanism; adding a production dependency or import edge; changing <MODULE_WORD> boundaries, <PUBLIC_SURFACE_WORD> behavior or call paths, accessors, mutable state or transitions, synchronization, lifecycle, concurrency, retries, handlers, watchers, polling, or other external-work paths; or performing a cross-<MODULE_WORD> migration. Read [`TESTING.md`](./TESTING.md) before changing behavior, tests, or test infrastructure.

## Workflow

- Before editing, check `git status`, `git worktree list`, and active agents. Preserve existing work and keep one writer per worktree; isolate overlapping writers.
- Issue work uses a dedicated branch and, after validation, a PR. Never commit to `<DEFAULT_BRANCH>`.
- Trace the current path to its owner before editing. Make the smallest complete, cohesive change through that owner and its callers. Include migrations required for correctness, but report unrelated defects instead of mixing them in.
- Consult the user before unapproved product, dependency, integration, or architecture choices. Prefer <STDLIB_OR_BASELINE> and existing <MANIFEST_FILE> dependencies; new dependencies require verified maintenance/fit evidence and PR justification.
- Account for deletions by responsibility. State which behavior, invariant, API, test coverage, assertion, error path, platform case, shared owner, or documentation claim disappeared and why.

## Core rules

- A domain decision or mutable fact has one owner and one write path. Extend or repair shared owners; do not bypass them, recreate their decisions downstream, or add parallel mechanisms or speculative compatibility behavior.
- Fix uncovered user-visible bugs with regression coverage at the lowest deterministic layer. Develop behavioral changes red-green as specified in `TESTING.md`.
- No non-test <SOURCE_EXT> file may exceed <LINE_CAP> lines. Pre-existing oversized files may not grow; split by responsibility, never into generic <JUNK_DRAWER_NAMES> buckets.
- Comments are exceptional: explain only non-obvious invariants, safety constraints, or dependency behavior and why they matter. Never narrate obvious code, tasks, issues, reviews, phases, temporary reasoning, or implementation history. <MODULE_WORD> docs may state current contracts and ownership.

## Secrets and sensitive files

- Never read, display, search, diff, parse, summarize, copy, or edit files matching
  <SECRET_FILE_PATTERNS>. Exclude them from recursive searches, bulk file reads, tool context, logs,
  diagnostics, and generated artifacts. Being ignored by Git does not make a file safe to read.
- Do not inspect process environments, credential stores, shell history, deployment state, or
  external secret managers to discover a value. Do not ask a maintainer to paste a secret into chat,
  a command, a test, or a temporary file.
- Work from sanitized example files, schemas, key names, and documented interfaces. When a task
  requires a real secret or a change to a forbidden file, prepare the non-secret code or template
  change and ask the maintainer to perform the secret-bearing step.
- If a secret appears unexpectedly, stop the command or inspection. Do not repeat or transform the
  value. Report only the affected path or key name, keep it out of commits and other artifacts, and
  follow <SECRET_INCIDENT_PROCEDURE>.

## Verification

Assume an independent reviewer will verify every change and completion claim against the request, these rules, the final diff, and actual command output. Rule violations, skipped validation, and unsupported claims will be rejected.

Run and report the full gate:

```bash
<BUILD_OR_TYPECHECK_CMD>
<LINT_CMD>
<FORMAT_CHECK_CMD>   # must print nothing
<TEST_CMD>
```

All <N> must pass before completion. <EXTRA_GATE_CONDITION — e.g. concurrency and lifecycle changes also require the race detector on affected packages; UI changes also require the end-to-end suite.> A skip is not a pass. <TOOLCHAIN_REQUIREMENTS — runtime versions and external binaries the gate depends on, with the install command.>

## Documentation and handoff

- `<PLAN_DOC>` is the human-authored source of truth for dated decisions and sequence; change it only deliberately when those decisions change. `TESTING.md` owns automated-test policy. Keep `CLAUDE.md` as an import only.
- <STATUS_UNIT — e.g. phase, milestone> status reflects verified exit criteria, never intention. Ship documentation with behavior. Update `<ARCHITECTURE_DOC>` diagrams when <STRUCTURAL_FACTS_THAT_INVALIDATE_THEM> change. Keep README status, links, and measured counts current. Mention that changed diagrams need republishing; if a diagrams-only reviewer would be misled, the change is incomplete.
- Keep commits cohesive and describe the changed invariant or responsibility, not a review round. Rename the branch if its cohesive scope changes.
- Do not commit build artifacts, <PROJECT_ARTIFACT_PATHS>, temporary database/socket state, or worktree-specific configuration.
- Before handoff, inspect the final diff and status for unrelated or temporary verification edits. Report ownership searches when they affected the design and report actual validation output.

<!--
ADAPTATION NOTES — delete this block once resolved.

<MODULE_WORD>            unit of ownership: "package" (Go), "module" (TS), "app" (Django), "crate"
<PUBLIC_SURFACE_WORD>    what callers actually invoke: "tool", "endpoint", "router", "command"
<WIRE_SHAPE_WORD>        cross-boundary payload: "protocol shape", "DTO", "schema", "API contract"
<SOURCE_EXT>             ".go", ".ts/.tsx", ".py"
<LINE_CAP>               pick a number the repo can hold today; a cap that is already violated
                         everywhere is not a rule. Portolan uses 400 for Go.
<JUNK_DRAWER_NAMES>      "`helpers.go`, `utils.go`, `misc.go`" / "`utils.ts`, `helpers.ts`, `misc.ts`"
<STDLIB_OR_BASELINE>     "the standard library" / "the existing framework primitives"
<SECRET_FILE_PATTERNS>   explicit denylist agreed with the maintainer, e.g. "`.env`, `.env.*`
                         except `.env.example`; `secrets/**`; `*.pem`; `*.key`; deployment
                         credential files". Include generated and local-only secret locations.
<SECRET_INCIDENT_PROCEDURE>
                         repository-specific response, including who to notify and when exposed
                         credentials must be rotated. If none exists, say to stop and notify the
                         maintainer immediately.

The gate block is the highest-leverage part of this file. Every command must be one an agent can
paste and whose output it can quote. Do not list a command that requires manual setup or that
routinely fails for unrelated reasons — agents learn to ignore a noisy gate wholesale.

If the project has no meaningful architecture diagram or plan doc, delete those references rather
than pointing at a stub. A link to an empty doc trains agents to stop following links.
-->
