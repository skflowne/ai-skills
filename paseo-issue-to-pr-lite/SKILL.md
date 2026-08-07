---
name: paseo-issue-to-pr-lite
description: "Implement a GitHub issue through Paseo with Supervised Forge, then run up to four fresh drift-review-duo rounds whose bounded resolution chunks are handled by steered Supervised Chunk agents. Use only when the user explicitly names and requests this skill."
---

# Paseo Issue to PR Lite

Own an issue through an open PR and a bounded, explicitly classified handoff with bounded agent contexts. Use [paseo](../paseo/SKILL.md) for every workspace, [supervised-forge](../supervised-forge/SKILL.md) for the initial implementation, [supervised-chunk](../supervised-chunk/SKILL.md) for every fix chunk, [drift-review-duo](../drift-review-duo/SKILL.md) for assembled-branch reviews, and [github-pr-review](../github-pr-review/SKILL.md) to publish each review round.

The user preauthorizes this workflow to make implementation, review, and fix decisions. Do not request approval unless work reaches a genuine product or repository-policy decision that repository evidence cannot resolve. The workflow may finish before round 4 when an assembled review is clear. Otherwise, stop early only for a hard external blocker, unsafe irreversible action outside the requested issue/PR lifecycle, or ambiguous live-writer state that remains after Paseo recovery. The four-round cap is a normal bounded handoff condition.

Keep contexts bounded:

- retire the initial implementer after it opens the PR and returns a compact handoff;
- use a fresh duo-review agent for every assembled review round;
- give each worthwhile resolution chunk to exactly one fresh supervised fixer;
- use a fresh integrator for each review round rather than reviving the initial implementer; and
- pass compact handoffs and relevant artifact paths, never accumulated transcripts or repeated raw logs.

Never allow more than one active writer in a workspace or more than one owner for an invariant.

## Bounded execution and supervision

The original issue and its acceptance criteria are the outer scope boundary. In every `supervised-forge` or `supervised-chunk` prompt, make the persistent correctness reviewer the scope supervisor. At the initial plan or chunk contract, every milestone/checkpoint, and final clearance, it must compare proposed and actual work with that boundary. It must flag adjacent features, broad cleanup, speculative hardening, dependency changes, and architecture work that are not strictly required for the assigned acceptance evidence. The writer must remove or defer scope expansion instead of absorbing it. If material expansion is genuinely required to complete the issue or chunk safely, stop that child and return the evidence to the workflow for adjudication; supervision must never silently grow an issue into a larger project.

Consume a review round as soon as its assembled `drift-review-duo` agent begins substantive execution. Run at most four. Only a launch proven never to have started the provider is a failed pre-execution attempt that does not count; a started review consumes its round even if transport or agent failure prevents completion. Rounds 1–3 may produce fixes and another assembled review. Round 4 is terminal: publish it, but do not dispatch its remaining findings; stop automation, clean up, and report whether the PR is clear or which worthwhile chunks remain.

Launch every workflow agent in the background, then use `paseo wait <agent-id> --json` as the dedicated completion primitive. After every `paseo send` that starts more work, wait the same way. Do not substitute a foreground `paseo run`, `paseo logs --follow`, `watch`, polling loops, sleeps, shell `timeout`, or a generic command invocation with an oversized tool timeout. Do not pass `--timeout` to `paseo wait`; let Paseo report the idle transition, then immediately inspect the agent and recent logs. For parallel fixers, call `paseo wait` once per ID; agents that already finished return immediately.

## 1. Preflight

Require an issue number. Resolve the repository, authenticated GitHub identity, default or explicitly stacked base, clean-tree state, active Paseo agents, existing worktrees, repository instructions, and current `paseo run --help`. Inspect facts rather than asking for information that can be retrieved.

Follow Paseo's ambiguous-state recovery before reusing a workspace, replacing an agent, or retrying a failed command. A Paseo status label alone does not prove that a provider or child process stopped. Never queue a follow-up and launch a replacement for the same work.

Maintain a workflow ledger outside committed source containing every workflow-created agent and workspace, including failed launches, with its ID, canonical path, branch, role, base/head SHA, and lifecycle state. Also record long-lived processes and services started by setup, agents, or validation: PID when known, canonical cwd, command, listener/port when relevant, ownership evidence, and the repository-prescribed teardown command.

Use one retirement protocol everywhere this workflow says to retire an agent or workspace:

1. Inspect the agent, logs, and processes rooted in the workspace's canonical path. If a provider or child is live, stop it and verify process exit; Paseo `idle`/`error`, `paseo stop` output, or a status transition alone is not proof.
2. From that exact workspace, run repository-prescribed teardown for isolated databases, dev servers, Playwright servers, emulators, and similar services. Stop workflow-launched CodeGraph/MCP or auxiliary servers once their evidence is no longer needed.
3. Match any survivor by the ledger's PID, command, and canonical cwd; terminate only that exact workflow-owned process, wait, and re-inspect. Never use broad process-name kills or affect user-owned sessions.
4. Re-scan processes and relevant listeners, verify the tree is clean and branch evidence is preserved, and record teardown evidence. Process cleanup does not require deleting the worktree.

## 2. Initial supervised implementation

Create one Paseo worktree and issue branch from the selected committed base. Launch one agent whose prompt begins with `/skill:supervised-forge` and explicitly requires it to:

- implement the complete issue without expanding beyond its acceptance criteria;
- brief the persistent reviewer with the standing scope-supervision contract above and include scope-control outcomes in the handoff;
- use the Paseo-created worktree without creating a nested worktree;
- resolve repository-defined decisions as required by repository instructions;
- validate, push the issue branch, and open its single PR; and
- return a compact handoff containing the issue, PR URL and number, base and head SHAs, commits, changed invariants, validation, decisions, residual risks, and artifact paths.

Wait with `paseo wait <agent-id> --json`, inspect the agent and recent logs, and verify the PR, branch, validation, and handoff. Then definitively retire the implementation agent with the retirement protocol, including workspace services rather than only the provider process. Before assigning another writer to its workspace, prove that no provider, child, auxiliary server, test server, or isolated database remains, the tree is clean, and local and remote issue-branch tips match.

## 3. Fresh assembled duo review

For every review round, fetch the latest PR head and create a fresh, isolated, clean Paseo review worktree at that exact commit. Record its round number before launch, mark it consumed when substantive execution starts, and never create round 5. Verify its canonical path differs from every writer workspace before launching anything in it.

Launch one background review agent. Its prompt invokes `/skill:drift-review-duo`, forbids editing, and includes the PR number, base and head SHAs, original issue, acceptance criteria, repository profile, and assembled validation as the explicit target and review intent. Require it to adjudicate its findings, then use `github-pr-review` to post exactly one consolidated `COMMENT` review headed `## Automated drift review — Round <n>/4`. The posted review is the sole findings handoff; the agent's final response must contain only the verified review permalink, never a copy or summary of the review body. Wait with `paseo wait <agent-id> --json`, inspect the agent and recent logs, then fetch the posted review from GitHub by its verified permalink or unique round heading and read that body as the round result. If the permalink is missing but the uniquely headed review exists, use the posted review instead of asking the agent to restate it. If no unique posted review exists, stop as an infrastructure blocker, report the consumed round and preserved logs, and do not launch a replacement reviewer.

Require each verified finding to include, concisely:

- identifier, severity, and classification;
- realistic trigger, mechanism, impact, and evidence;
- affected invariant and paths;
- dependencies or overlap with other findings; and
- a cohesive resolution chunk sized for one agent, with acceptance evidence and explicit neighboring scope it must not absorb.

The duo may combine findings only when one agent can own the combined invariant end to end. It must not combine unrelated findings merely to reduce agent count.

The review agent applies the following adjudication before posting, and the workflow verifies the posted result before dispatch. A finding is eligible for the current PR only when the branch introduced it or it is necessary to satisfy the original issue's acceptance criteria. For eligible findings, worthwhile wrong-seam findings become current-PR resolution chunks; this explicitly overrides `drift-review-duo`'s default follow-up-issue handoff because the workflow is responsible for fixing worthwhile in-scope work before completion.

- eligible verified user-facing bugs are worthwhile;
- eligible wrong-seam fixes or refactors with concrete evidence that they prevent likely defects in an issue-owned invariant are worthwhile;
- speculative, duplicate, disproven, unrelated, pre-existing, or already-recorded findings are not current-PR work; and
- other eligible findings require a concrete fix-versus-defer trade-off, recorded concisely.

A round is clear only when no verified worthwhile findings remain.

The review agent publishes the final eligible findings, agent-sized chunk plan, and concise reasons for dropped candidates through `github-pr-review`; it omits intermediate analysis and uses `Fix plan: None` for a clear round. After `paseo wait`, the workflow reads this posted review directly and must not publish a second review or ask the agent to reproduce its contents. The review must exist on the PR before any fixer starts. Once it and all needed evidence are durable, retire the review agent and workspace services immediately with the retirement protocol.

## 4. Run one steered fixer per chunk

For every worthwhile resolution chunk, create exactly one fresh Paseo worktree, branch, and fixer agent. Each prompt begins with `/skill:supervised-chunk` and includes:

- the original issue and PR;
- review permalink and round number;
- exact chunk identifier, finding evidence, owned invariant, affected paths, and acceptance evidence;
- its base SHA and intended relationship to the issue branch;
- dependencies and neighboring chunks it must not absorb; and
- relevant repository decisions and constraints.

Require the fixer to:

- use the Paseo-created worktree without creating a nested worktree;
- implement this chunk continuously rather than pre-slicing it into milestones;
- use one persistent read-only reviewer for event-driven in-progress checks, evidence-backed steering, final clearance, and explicit scope control;
- make that reviewer compare each checkpoint and final diff with the exact chunk contract and reject unassigned neighboring work;
- keep every checkpoint and correction inside the exact chunk contract;
- commit and push the cleared chunk branch;
- avoid opening another PR, editing the existing PR, merging, or integrating other chunks; and
- return a compact handoff with base/head SHAs, commits, invariant, validation, checkpoint steering and decisions, scope-control outcome, final reviewer outcome, and artifact paths.

Do not run another solo review after all chunks finish. Independent solo supervision happens inside each `supervised-chunk` run; the next branch-wide review is the assembled duo. After `paseo wait <agent-id> --json` returns, inspect the fixer and logs. When its cleared commits, branch, validation, and artifacts are verified and no follow-up is needed, retire it and tear down its workspace services; do not keep completed fixers alive until final handoff.

### Scheduling

Validate the duo's proposed chunk boundaries before launch.

- Chunks may run in parallel only when they share neither invariant, dependency, likely paths, nor integration decision, and all start from the same current issue-branch tip.
- Dependent or overlapping chunks run in waves. Integrate and validate prerequisites before creating downstream branches from the updated issue-branch tip.
- If a chunk discovers shared ownership or scope overlap, stop it and regroup the affected work under one supervised owner rather than letting multiple agents patch the same invariant.

## 5. Integrate the cleared chunks

After the initial implementer is retired, launch one fresh integrator for the current review round in the original issue workspace. Give it only the current issue-branch SHA, cleared chunk handoffs, merge order, repository constraints, and required assembled validation.

The integrator is the issue workspace's sole writer. It must:

- verify every chunk was independently cleared and still descends from its declared base;
- integrate only the approved commits in dependency order;
- run focused checks after each dependency wave and assembled validation after all selected chunks are in;
- push the updated issue branch; and
- return a compact integration handoff and decision log.

The integrator must not invent a large conflict resolution. A conflict that reveals shared invariant ownership or invalid independence returns the affected work to one fresh `supervised-chunk` reconciliation agent. Wait for the integrator with `paseo wait <agent-id> --json`, then inspect its result and logs. Once all chunks and dependency waves are integrated and validated, retire the integrator with the full retirement protocol, including repository services and auxiliary processes rather than only Paseo's provider status.

## 6. Repeat within four rounds

After all selected chunks from rounds 1–3 are integrated, emit exactly one concise progress update before the next review:

> Round `<n>/4`: `<count>` worthwhile chunk(s) integrated; validation `<result>`; starting round `<n+1>`.

This is a progress event, not a stopping point or an invitation for approval. Do not include transcripts or finding walkthroughs.

Then run a fresh full `drift-review-duo` against the assembled PR. Never substitute per-chunk reviews for this assembled check.

- In rounds 1–3, if the duo finds worthwhile work, publish its chunk plan and repeat `supervised-chunk` dispatch, integration, assembled validation, the concise between-round status, and a fresh duo.
- If any round has no worthwhile findings, verify required CI and leave the PR open for human review.
- After round 4, do not launch fixers or another review. If worthwhile findings remain, leave them unmodified as explicit residual chunks, mark the workflow `round cap reached — not verified clear`, and hand off. If none remain, mark it `clear within round cap`. Cleanup and final reporting still run in either case.

Never exceed four assembled review rounds. Repeated findings against the same invariant in rounds 1–3 are evidence of a wrong seam: assign one `supervised-chunk` reconciliation agent to the invariant rather than stacking another local guard. A round-4 recurrence is residual work for human handoff, not permission to continue automatically.

## 7. Final handoff and cleanup

Post or update one concise final PR comment containing:

- workflow status: `clear within round cap`, `round cap reached — not verified clear`, or `hard blocker`;
- validation and CI results;
- duo rounds and review permalinks;
- integrated chunk IDs and commits;
- deferred findings and reasons;
- material decisions; and
- residual risks.

Never merge, enable auto-merge, or replace the PR body.

Reconcile every workflow-owned agent, workspace, and process-ledger entry, including failed launches. Verify no obsolete provider, child, database, CodeGraph/MCP server, dev/test server, emulator, or listener remains active; no workspace has multiple writers; retained paths are unique; the issue branch is clean; and local and remote tips match. Re-run the retirement protocol wherever teardown evidence is missing, then perform a final process-table and listener scan. Treat an idle/error status or successful stop command as control-plane evidence only. Report a stale label with no process as stale control-plane state; a live workflow-owned process is a hard blocker until stopped or reported with PID, command, cwd, and attempted teardown. Preserve branches and evidence for any hard blocker instead of hiding or deleting ambiguous state.
