---
name: split-forge
description: "Implement a large change as several independently-scoped chunks running in parallel, with the main session model owning decomposition, cross-cutting concerns, and integration. Use only when the user explicitly names and requests this skill."
---

# Split Forge

One large change, decomposed into chunks that are implemented in parallel by independent agents, with
**you** — the main session model — keeping three jobs you never delegate: drawing the boundaries,
owning every cross-cutting concern, and integrating.

The distinction from [supervised-forge](../supervised-forge/SKILL.md) is what stays in your hands.
Supervised-forge is one author working milestones in sequence under a persistent reviewer.
Split-forge is many authors working disjoint scopes at once, and it exists because the failure mode
of large agent-built changes is not bad code inside a chunk — it is work that belonged to nobody.

## Why the main model keeps the cross-cutting work

Anchoring precedent (locus #46, PR #53): a constants-centralization task scoped by its own issue as
"no big-bang migration" shipped 38 files. Its doc edit added a rule — *"e2e helpers live in
`seed-helpers.ts`, never a private copy in a spec"* — while 13 private copies of one helper remained
in the tree, four of them in files that same PR edited. Nothing was wrong inside any chunk of that
work. The rule was written by whoever happened to be editing docs, and applying it everywhere it
applied was not any chunk's job.

That is the class this skill targets. A chunk agent sees its own scope, so a rule it writes gets
applied to its own scope. Only an agent holding the whole change can ask "where else does this
apply," which is why the trunk work below is yours and is authored **after** the chunks land, not
before.

## Contract shape

Everything this skill enforces rides on one object per chunk, and every field is checkable:

| Field | Meaning | Enforcement |
| --- | --- | --- |
| `title` | Short name; becomes the branch and commit prefix. | — |
| `deliverable` | What exists when the chunk is done, in one sentence. | Review gate |
| `acceptanceCriteria` | Concrete, checkable statements. Not "clean up X". | Review gate |
| `scopePaths` | Allowlist of paths/globs the chunk may touch. | **Script-enforced** |
| `maxFiles` | Hard file budget for the chunk's diff. | **Script-enforced** |
| `ownsInvariants` | Invariants this chunk owns end to end. | Critique gate |

`scopePaths` and `maxFiles` are the load-bearing pair. Prose scope limits do not bind agents — every
increment looks justified from inside a chunk, which is exactly how a three-file task becomes a
thirty-eight-file one. The workflow computes the violation in JavaScript from the chunk's actual
`git diff --name-only` output, reported independently of the implementer. A model cannot reason its
way past a string comparison.

## Procedure

### 1. Explore the task's current state, then name the invariants

If the task comes from an issue, first verify the issue state, discussion, linked issues and PRs, and
what work already exists in the codebase, local/remote branches, worktrees, commits, and
open/closed/draft PRs. A small read-only scout fleet is advised when the history or repository state is nontrivial, sized
proportionally to the task. Give each scout one bounded concern (issue context, codebase status, or
branch/PR state) and require a concise, evidence-backed summary with only key state, exact references,
and remaining-work implications—not raw logs or full transcripts. Use fewer scouts for narrow work
and none when one quick pass is enough. Synthesize the summaries before decomposing; never assume the
issue is untouched or start duplicate chunks for work already done.

Before drawing any boundary, name the invariants the remaining change introduces or touches — one sentence
each. Slices follow from invariants, never the reverse. **One owner per invariant, end to end**: an
invariant split across two chunks produces two mechanisms guarding one piece of state, neither aware
of the other. If two candidate chunks both need to own an invariant, they are one chunk.

### 2. Separate trunk work from chunk work

Sort every piece of the change into exactly one of two piles.

**Trunk (yours).** Anything whose correctness depends on the whole change:

- Agent-facing docs and conventions (`CLAUDE.md`, `AGENTS.md`, rule text of any kind).
- Shared modules every chunk imports — the constants module, shared helper barrels, config.
- Any rule of the form "X always lives in Y": writing it obliges you to check the whole tree.
- Cross-chunk renames, and the final consistency sweep.

**Chunks (delegated).** Work that is complete and verifiable inside its own scope, sharing no file,
no invariant, and no concern with another chunk.

Collect the trunk paths into a `crossCuttingPaths` denylist. **No chunk may touch a denylisted path,
whatever its own `scopePaths` say** — the script enforces this, and it is what stops a chunk from
editing a doc rule that governs code it cannot see.

### 3. Draw boundaries, then check them for cracks

Findings live on boundaries. When you split a task by topic, anything straddling two topics is
claimed by neither — and it is reliably the most interesting part of the change. For each boundary,
ask what work touches both sides. If the answer is anything, that work is trunk work, not a third
chunk.

Keep chunks to **2–5**. Fewer than two is not a split; more than five means the boundaries are file
boundaries rather than concern boundaries, and the agent budget stops being justifiable.

### 4. Resolve the base and preflight the tree

Run `git -C <repoPath> fetch origin`, resolve the base branch explicitly (never the current HEAD),
and capture its sha: `git -C <repoPath> rev-parse origin/<baseBranch>`. Every chunk branches from
that one sha, so the chunks stay genuinely independent and integration is a clean cherry-pick.

Check `git status --porcelain`. If the tree is dirty, show what is uncommitted and get explicit
confirmation before launching — say plainly that the uncommitted work stays in the checkout and will
not be in the branch. Never stash, never move HEAD in the user's checkout.

### 5. Launch the parallel chunk run

Call `Workflow({name: 'skills:split-chunks', args: {...}})` with the full contract object. The script:

1. **Critiques the decomposition** with an independent agent, before any implementation. It hunts
   boundary cracks, invariants owned twice, and trunk work misfiled as chunk work. A `blocker`
   verdict **aborts the run** and hands the defects back to you — no implementer is spawned. Fix the
   split and relaunch; do not argue with the gate.
2. **Implements every chunk in parallel**, each in its own git worktree cut from the base sha.
3. **Audits each chunk's scope** with a separate agent that reports the changed-file list
   independently of the implementer, and computes the verdict in JavaScript. Out-of-scope or
   over-budget gets one remediation round, then fails the chunk.
4. **Review-gates each chunk** against its own acceptance criteria.
5. **Collects escalations** — everything a chunk noticed that belongs to the trunk.

### 6. Author the trunk work yourself

Only now, with every chunk branch landed and the escalation list in hand. This is the step the skill
exists for; it is not delegable and not optional.

For every rule, doc line, or shared symbol you write here, run the search that proves it holds
tree-wide. Writing *"helpers live in X, never a private copy"* obliges you to `grep` for private
copies and either fix them or narrow the rule to what you actually did. A rule shipped alongside live
counterexamples teaches every future agent to ignore the doc — it is worse than no rule.

Work each collected escalation to a decision: fix it in the trunk commit, file it as a follow-up
issue, or reject it with evidence. None may be silently dropped.

### 7. Integrate and validate

Cherry-pick each chunk branch onto the working branch in dependency order, then commit the trunk work
on top. Run the project's full validation — tests, typecheck, lint, build — on the assembled branch.
Chunk-local validation proves nothing about the assembly.

Delete chunk branches only after validation passes; until then they are the only copy of that work.

### 8. Report

State per chunk: branch, review outcome, scope verdict. Then the trunk commit's contents, every
escalation with its disposition, full-branch validation output, and residual risk. If a chunk failed
its scope gate, report what it tried to touch — that is a decomposition defect worth knowing about,
not noise.

## Rules that survive the split

These hold inside every chunk and in the trunk work, and the chunk prompts carry them:

- **Look before authoring.** Check the repo's placement conventions for an existing helper, constant,
  or hook before writing a new one. A new definition duplicating an existing shared symbol is a
  defect even when its logic is correct.
- **Never delete, inline, or bypass a shared module** to make a chunk fit its scope. If a shared
  mechanism is in the way, that is an escalation to the trunk, not a change to ship.
- **The refactor fork.** If fixing a finding would add another guard to state that already has
  several, or the invariant it protects has no single owner, stop and escalate. Do not patch.
- **Red-green per behavior.** Each user-visible invariant gets one test through the real interface,
  observed failing before the implementation exists.

## When not to use this

A change with one seam belongs in one PR — splitting it manufactures the integration risk this skill
then spends agents managing. Use [supervised-forge](../supervised-forge/SKILL.md) for sequential work
under a persistent reviewer, and [orchestrate](../orchestrate/SKILL.md) when the parts are
independent enough that no trunk work exists at all.
