---
name: paseo-issue-to-pr
description: "Implement a GitHub issue through Paseo with Portolan Forge and CodeGraph evaluation, then run up to four autonomous drift-review-duo rounds with bounded fix dispatch before handing the PR to a human. Use only when the user explicitly names and requests this skill."
---

# Paseo Issue to PR

Own an issue through an open PR and a bounded, explicitly classified handoff. Use [paseo](../paseo/SKILL.md) for every agent workspace, [portolan-forge](../portolan-forge/SKILL.md) for every implementation chunk, [codegraph-evaluation](../codegraph-evaluation/SKILL.md) throughout, [drift-review-duo](../drift-review-duo/SKILL.md) for branch-level verification, and [github-pr-review](../github-pr-review/SKILL.md) to publish each review round.

The user preauthorizes this workflow to make implementation and review decisions. Never request a preference or approval. When direction is not dictated by repository evidence, perform [trade-off analysis](../trade-off-analysis/SKILL.md), choose the strongest option, continue, and record:

- context and problem;
- option chosen and why;
- options considered and their material trade-offs.

If evidence remains unavailable after reasonable inspection, state the assumptions and choose the safest reversible option; do not turn uncertainty into a user decision request.

The workflow may finish before round 4 when an assembled review is clear. Otherwise, stop early only for a hard external blocker such as unavailable credentials, an inaccessible remote, an unsafe irreversible action outside the requested issue/PR lifecycle, or infrastructure failure that remains after reasonable recovery attempts. The four-round cap is a normal bounded handoff condition, not a blocker.

## Bounded execution contract

The original issue and its acceptance criteria are the scope boundary. In every Portolan prompt, designate its correctness reviewer as the scope supervisor. At planning, every milestone gate, and the final gate, that reviewer must compare the proposed and actual work with the issue or assigned resolution-chunk contract. It must flag adjacent features, broad cleanup, speculative hardening, dependency changes, and architecture work that are not strictly required for the assigned acceptance evidence. The writer must remove or defer that expansion rather than absorbing it. If a material expansion is genuinely required to complete the issue safely, stop that agent's implementation and return the evidence to this workflow for adjudication; never let supervision silently turn an issue into a larger project.

Consume a review round as soon as its assembled `drift-review-duo` agent begins substantive execution. Run at most four. Only a launch proven never to have started the provider is a failed pre-execution attempt that does not count; a started review consumes its round even if transport or agent failure prevents completion. Rounds 1–3 may produce fixes and another assembled review. Round 4 is terminal: publish it, but do not dispatch its remaining findings; stop automation, clean up, and report whether the PR is clear or which worthwhile chunks remain.

Launch every workflow agent in the background, then use `paseo wait <agent-id> --json` as the dedicated completion primitive. After every `paseo send` that starts more work, wait the same way. Do not substitute a foreground `paseo run`, `paseo logs --follow`, `watch`, polling loops, sleeps, shell `timeout`, or a generic command invocation with an oversized tool timeout. Do not pass `--timeout` to `paseo wait`; let Paseo report the agent's idle transition, then immediately inspect the agent and recent logs. For parallel agents, call `paseo wait` once per ID; agents that already finished return immediately.

## 1. Preflight and implementation

Require an issue number. Resolve the repository, authenticated GitHub identity, default or explicitly stacked base, clean-tree state, active Paseo agents, and current `paseo run --help`; verify issue scope and repository instructions rather than asking for facts that can be inspected. Leave unrelated dirty work untouched and branch from the selected committed base, recording anything excluded from the run.

Create one Paseo worktree branch for the issue and launch an agent whose prompt begins with `/skill:portolan-forge`. Record every workflow-created workspace, including one left behind by a failed agent launch, and every workflow-owned agent's ID, workspace, canonical path, branch, role, and expected lifecycle state so later recovery and cleanup can reconcile the complete fleet. The ledger also records every long-lived process or service started by workspace setup, agents, or validation—PID when known, canonical working directory, command, listener/port when relevant, and the repository-prescribed teardown command. Explicitly require the implementation agent to:

- implement the complete issue without expanding beyond its acceptance criteria;
- brief its correctness reviewer with the standing scope-supervision contract above and include scope-control outcomes in the handoff;
- follow `codegraph-evaluation` and commit its `.codegraph-evals/<UTC-timestamp>-issue-<number>-<task>.md` report;
- resolve decision forks autonomously using the decision-log contract above;
- push the issue branch and open its single PR; and
- return the branch, PR URL, commits, validation, reviewer results, and decision log.

Paseo already owns the worktree; tell Portolan not to create a nested one. Launch it in the background, wait with `paseo wait <agent-id> --json`, then inspect the agent and logs. An idle request for a decision is not completion: after confirming there is no active run, send the autonomous-decision contract, wait again with `paseo wait`, and inspect the new result.

A transport error, failed `wait`/`send`, or `status: error` does not prove the implementation process stopped. Follow Paseo's ambiguous-state recovery before sending more messages or launching a replacement. In particular:

- if Paseo says the agent is already processing, observe that run instead of queueing another recovery message;
- never queue a follow-up to the original agent and also start a replacement;
- never put a replacement writer in the issue workspace until the original cancellation is acknowledged and no provider or child process remains; and
- after replacement, do not send any further message to the superseded agent.

The original issue workspace must have exactly one active writer. If the integrator is unrecoverable, preserve its branch and evidence, definitively terminate it, then assign one replacement integrator as an explicit same-task continuation. An unacknowledged cancellation with a live process is an infrastructure blocker, not permission to create a second writer.

## 2. Drift review

Run `drift-review-duo` against the PR in a separate Paseo worktree. Do not let the review agent edit the branch. Launch it in the background and require it to adjudicate its findings, then use `github-pr-review` to post exactly one consolidated `COMMENT` review headed `## Automated drift review — Round <n>/4`. The posted review is the sole findings handoff. The agent's final response must contain only the verified review permalink, never a copy or summary of the review body.

Treat review-workspace isolation as a pre-execution gate, not something inferred from a workspace ID or checked after review:

1. Create the review workspace separately with `paseo workspace create`, using `branch-off` from the fetched latest PR head and a unique review-only branch and `--worktree-slug` containing the PR number, round, and a collision-resistant suffix. Do not rely on `checkout-pr`'s implicit branch-derived workspace name.
2. Before starting an agent, inspect `paseo workspace ls --json`, `git worktree list`, and the workspace's branch and canonical path. The path must exist exactly once in Paseo's workspace registry, differ from the issue integrator and every fixer workspace, and point at the expected PR-head commit with a clean tree. Only then start the background review with `paseo run --background --workspace <verified-id>`.
3. Wait with `paseo wait <agent-id> --json`, inspect the agent and recent logs, then fetch the posted review from GitHub by its verified permalink or unique round heading and read that body as the round result. If the permalink is missing but the uniquely headed review exists, use the posted review instead of asking the agent to restate it. If no unique posted review exists, stop as an infrastructure blocker, report the consumed round and preserved logs, and do not launch a replacement reviewer.
4. If workspace or agent creation fails, inspect the workspace, agent registry, and live processes before retrying. Never run a review in a workspace produced by a failed combined create-and-run attempt. Archive an orphan only after proving its path is not shared; two workspace IDs resolving to one canonical path is a control-plane collision, so quarantine them, preserve the implementation workspace, and create a freshly named review workspace. If uniqueness still cannot be established, stop as an infrastructure blocker.

Create exactly one review agent for each round after this gate passes. Record the round number in the ledger before launch and mark it consumed when substantive execution starts; never create round 5. Record only attempts proven not to have started a provider as failed pre-execution attempts outside the round count. Never launch a compensating review merely because isolation was checked only after an agent returned—the gate must prevent that agent from starting.

Require each verified finding to include severity, classification, invariant when applicable, evidence, realistic impact, dependencies, affected paths, and a cohesive agent-sized resolution chunk. The reviewer must not ask for plan approval.

The review agent applies the following adjudication before posting, and the workflow verifies the posted result before dispatch. A finding is eligible for the current PR only when the branch introduced it or it is necessary to satisfy the original issue's acceptance criteria; a verified but unrelated or pre-existing defect is residual work, not permission to expand this issue.

- eligible verified bugs are always worth fixing;
- refactors within an issue-owned invariant that are almost certain to make the requested work safer or less error-prone are worth doing;
- for every other eligible finding, compare fix, defer, and alternative approaches using trade-off analysis, choose, and record the decision;
- unrelated, pre-existing, speculative, duplicate, already-recorded, or disproven findings are not current-PR work.

A review is clear when it contains no verified worthwhile findings. Record deferred findings and why they were not worth doing.

The review agent publishes through `github-pr-review` as one consolidated Pull Request Review with `event: COMMENT`, never inline comments or `REQUEST_CHANGES`. Its body contains the final eligible findings, agent-sized resolution chunks, and candidates dropped from the plan with a concise reason for each; omit intermediate analysis. For a clear round, use `Fix plan: None`. Capture and verify the permalink returned by `post-pr-review.mjs`. After `paseo wait`, the workflow reads this posted review directly and must not publish a second review or ask the agent to reproduce its contents. Every review round must land on the PR before any fixer for that round starts.

## 3. Dispatch resolution chunks

Create exactly one Paseo agent and temporary branch per worthwhile resolution chunk. Each branch starts from the latest issue-branch tip. Run independent chunks in parallel only when they share neither invariant, dependency, nor likely paths; run dependent or overlapping chunks sequentially from the updated issue branch.

Each fix prompt begins with `/skill:portolan-forge` and includes the original issue and PR, the verified PR review permalink, the exact chunk identifier and title assigned to that agent, complete finding evidence, owned scope, explicit neighboring chunks it must not absorb, base ref, acceptance evidence, neighboring constraints, and the autonomous-decision contract. State plainly that the agent is responsible for that chunk only. Designate its correctness reviewer as scope supervisor and require scope checks at planning, every milestone gate, and final clearance; adjacent review findings or cleanup are outside the chunk unless explicitly assigned. Require the agent to follow `codegraph-evaluation`, commit a uniquely named `.codegraph-evals/<UTC-timestamp>-issue-<number>-pr-<number>-<chunk>.md`, verify the chunk through Portolan's gates, and return a commit/branch plus its scope-control outcome for integration. Override Portolan's normal handoff: a fix agent must not open another PR or merge itself.

Wait for every dispatched agent with `paseo wait <agent-id> --json` and inspect its evidence. Send verified branches to the current designated issue integrator, which remains the sole integrator. It merges them into the issue branch, resolves integration conflicts using repository evidence and trade-off analysis, runs assembled validation, pushes the updated PR, and records decisions. A conflict revealing shared invariant ownership means the affected chunks were not independent; integrate or rework them sequentially under one owner rather than forcing both patches together.

## 4. Repeat and hand off

After all selected fixes from rounds 1–3 are integrated, emit exactly one concise progress update before the next review:

> Round `<n>/4`: `<count>` worthwhile chunk(s) integrated; validation `<result>`; starting round `<n+1>`.

This is a progress event, not a stopping point or an invitation for approval. Do not include transcripts or finding walkthroughs.

Then run a fresh full `drift-review-duo` against the assembled PR—not separate final reviews of each fix branch.

Retire agents and tear down their workspace services as soon as their evidence is integrated or their review is published; do not accumulate cleanup until the final round. Retirement is process-based:

1. Inspect the agent, recent logs, and processes whose canonical working directory is the workspace. If a provider or child is live, stop it and verify exit; `idle`, `error`, a successful `paseo stop`, or an interrupted count is not exit evidence.
2. Run repository-prescribed teardown from that exact workspace for services started by setup or tests, such as isolated databases, dev servers, Playwright web servers, or emulators. Stop CodeGraph/MCP servers and other auxiliary processes launched for the workspace when they are no longer needed.
3. For a remaining workflow-owned process, match the ledger's PID/command/canonical cwd, send a normal termination signal, wait and re-inspect, and escalate only that exact process if it does not exit. Never use broad `pkill`, process-name matching alone, or cleanup that can affect user-owned sessions.
4. Re-scan the process table and relevant listeners, verify no workflow-owned descendant or service remains, verify the tree is clean, and update the ledger with teardown evidence. Keep branch/workspace evidence unless archival is independently safe; process cleanup does not require deleting the worktree.

- In rounds 1–3, if worthwhile findings remain, repeat review adjudication, one-agent-per-chunk dispatch, integration, validation, the concise between-round status, and a full drift review.
- If any round has no worthwhile findings, verify required CI, leave the PR open for human review, and publish the final workflow report as a PR comment.
- After round 4, do not launch fixers or another review. If worthwhile findings remain, leave them unmodified as explicit residual chunks, mark the workflow `round cap reached — not verified clear`, and hand off. If none remain, mark it `clear within round cap`. Cleanup and final reporting still run in either case. Never update the PR body, merge the PR, or enable auto-merge.

Post one final PR comment using the following template. Include validation, CodeGraph report links, drift-review rounds, deferred findings, and the full decision log. Use `None` when a section is empty; keep decision and refactoring items to one line.

```markdown
## Automated workflow report

### Workflow status
- <clear within round cap | round cap reached — not verified clear | hard blocker>

### Validation
- <check and result>

### CodeGraph reports
- <report link>

### Drift-review rounds
- <round summary and review permalink>

### Deferred findings
- <finding> — <reason deferred>

### Decisions made ↔ problem solved
- <decision> ↔ <problem it solved>

### Refactoring done ↔ why it was worth it
- <refactor> ↔ <why it was judged sufficiently likely to improve later work>
```

If the workflow resumes, update its existing report comment rather than posting duplicates. Leave the PR body unchanged.

Before declaring completion, reconcile the workflow's agent and workspace registries and the process ledger. Inspect every implementation, fixer, integrator, and review agent plus every workspace created by successful or failed launches; verify that no obsolete workflow-owned provider, child, database, CodeGraph server, dev/test server, emulator, or listener remains active, no two active workspace IDs share a canonical path, no workspace has multiple writers, the issue branch is clean, and its local and remote tips match. Re-run the retirement protocol for any workspace that lacks teardown evidence. Stop obsolete workflow-owned runs only after confirming they are not user-owned or still needed. Archive an orphaned workspace only after confirming its path is not shared with a retained workspace. A stale Paseo label with no process should be reported as stale control-plane state; a live workflow-owned process must be stopped or reported as a hard blocker with its PID, command, cwd, and attempted teardown. Completion requires a final process-table/listener scan, not only `paseo ls`.

Never exceed four assembled review rounds. Do not call the PR verified clear because one agent became idle, one patch passed, or one review round ended. Completion requires the issue PR to remain open with the final report posted and workflow-owned agents reconciled. The report must distinguish `clear within round cap`, `round cap reached — not verified clear` with residual chunks, and a hard external blocker with preserved branches, PR, agent IDs, evidence, and attempted recovery.
