---
name: paseo-issue-to-pr
description: Implement a GitHub issue through Paseo with Portolan Forge and CodeGraph evaluation, then run autonomous drift-review-duo and recursively dispatch worthwhile fix chunks until a verified PR is ready for human review.
---

# Paseo Issue to PR

Own an issue through a verified open PR. Use [paseo](../paseo/SKILL.md) for every agent workspace, [portolan-forge](../portolan-forge/SKILL.md) for every implementation chunk, [codegraph-evaluation](../codegraph-evaluation/SKILL.md) throughout, [drift-review-duo](../drift-review-duo/SKILL.md) for branch-level verification, and [github-pr-review](../github-pr-review/SKILL.md) to publish each review round.

The user preauthorizes this workflow to make implementation and review decisions. Never request a preference or approval. When direction is not dictated by repository evidence, perform [trade-off analysis](../trade-off-analysis/SKILL.md), choose the strongest option, continue, and record:

- context and problem;
- option chosen and why;
- options considered and their material trade-offs.

If evidence remains unavailable after reasonable inspection, state the assumptions and choose the safest reversible option; do not turn uncertainty into a user decision request.

Stop only for a hard external blocker such as unavailable credentials, an inaccessible remote, an unsafe irreversible action outside the requested issue/PR lifecycle, or infrastructure failure that remains after reasonable recovery attempts.

## 1. Preflight and implementation

Require an issue number. Resolve the repository, authenticated GitHub identity, default or explicitly stacked base, clean-tree state, active Paseo agents, and current `paseo run --help`; verify issue scope and repository instructions rather than asking for facts that can be inspected. Leave unrelated dirty work untouched and branch from the selected committed base, recording anything excluded from the run.

Create one Paseo worktree branch for the issue and launch an agent whose prompt begins with `/skill:portolan-forge`. Record every workflow-owned agent's ID, workspace, branch, role, and expected lifecycle state so later recovery and cleanup can reconcile the complete fleet. Explicitly require the implementation agent to:

- implement the complete issue;
- follow `codegraph-evaluation` and commit its `.codegraph-evals/<UTC-timestamp>-issue-<number>-<task>.md` report;
- resolve decision forks autonomously using the decision-log contract above;
- push the issue branch and open its single PR; and
- return the branch, PR URL, commits, validation, reviewer results, and decision log.

Paseo already owns the worktree; tell Portolan not to create a nested one. Wait with `paseo wait`, then inspect the agent and logs. An idle request for a decision is not completion: after confirming there is no active run, send the autonomous-decision contract and continue waiting.

A transport error, failed `wait`/`send`, or `status: error` does not prove the implementation process stopped. Follow Paseo's ambiguous-state recovery before sending more messages or launching a replacement. In particular:

- if Paseo says the agent is already processing, observe that run instead of queueing another recovery message;
- never queue a follow-up to the original agent and also start a replacement;
- never put a replacement writer in the issue workspace until the original cancellation is acknowledged and no provider or child process remains; and
- after replacement, do not send any further message to the superseded agent.

The original issue workspace must have exactly one active writer. If the integrator is unrecoverable, preserve its branch and evidence, definitively terminate it, then assign one replacement integrator as an explicit same-task continuation. An unacknowledged cancellation with a live process is an infrastructure blocker, not permission to create a second writer.

## 2. Drift review

Run `drift-review-duo` against the PR in a separate Paseo worktree. Do not let the review agent edit the branch or post directly. Run it in the foreground with `--output-schema` so its findings and resolution chunks are machine-readable; Paseo does not support structured output together with `--background`.

Require each verified finding to include severity, classification, invariant when applicable, evidence, realistic impact, dependencies, affected paths, and a cohesive agent-sized resolution chunk. The reviewer must not ask for plan approval.

The workflow adjudicates what is worth doing:

- verified bugs are always worth fixing;
- refactors almost certain to make later work safer, faster, or less error-prone are always worth doing;
- for everything else, compare fix, defer, and alternative approaches using trade-off analysis, choose, and record the decision;
- speculative, duplicate, already-recorded, or disproven findings are not work.

A review is clear when it contains no verified worthwhile findings. Record deferred findings and why they were not worth doing.

After adjudication, publish that round through `github-pr-review` as one consolidated Pull Request Review with `event: COMMENT`, never inline comments or `REQUEST_CHANGES`. Its body contains only the final fix plan—the worthwhile agent-sized resolution chunks—and a list of candidates dropped from the plan with a concise reason for each. Do not post raw reviewer output, intermediate analysis, or a separate findings walkthrough. For a clear round, use `Fix plan: None` and list anything dropped with its reason. Capture and verify the review permalink returned by `post-pr-review.mjs`. Every review round must land on the PR before any fixer for that round starts.

## 3. Dispatch resolution chunks

Create exactly one Paseo agent and temporary branch per worthwhile resolution chunk. Each branch starts from the latest issue-branch tip. Run independent chunks in parallel only when they share neither invariant, dependency, nor likely paths; run dependent or overlapping chunks sequentially from the updated issue branch.

Each fix prompt begins with `/skill:portolan-forge` and includes the original issue and PR, the verified PR review permalink, the exact chunk identifier and title assigned to that agent, complete finding evidence, owned scope, explicit neighboring chunks it must not absorb, base ref, acceptance evidence, neighboring constraints, and the autonomous-decision contract. State plainly that the agent is responsible for that chunk only. Require the agent to follow `codegraph-evaluation`, commit a uniquely named `.codegraph-evals/<UTC-timestamp>-issue-<number>-pr-<number>-<chunk>.md`, verify the chunk through Portolan's gates, and return a commit/branch for integration. Override Portolan's normal handoff: a fix agent must not open another PR or merge itself.

Wait for every dispatched agent and inspect its evidence. Send verified branches to the current designated issue integrator, which remains the sole integrator. It merges them into the issue branch, resolves integration conflicts using repository evidence and trade-off analysis, runs assembled validation, pushes the updated PR, and records decisions. A conflict revealing shared invariant ownership means the affected chunks were not independent; integrate or rework them sequentially under one owner rather than forcing both patches together.

## 4. Repeat and hand off

After all selected fixes are integrated, run a fresh full `drift-review-duo` against the assembled PR—not separate final reviews of each fix branch.

- If worthwhile findings remain, repeat review adjudication, one-agent-per-chunk dispatch, integration, validation, and full drift review.
- If no worthwhile findings remain, verify required CI, leave the PR open for human review, and publish the final workflow report as a PR comment. Never update the PR body, merge the PR, or enable auto-merge.

Post one final PR comment using the following template. Include validation, CodeGraph report links, drift-review rounds, deferred findings, and the full decision log. Use `None` when a section is empty; keep decision and refactoring items to one line.

```markdown
## Automated workflow report

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

Before declaring completion, reconcile the workflow's agent registry. Inspect every implementation, fixer, integrator, and review agent; verify that no obsolete workflow-owned provider or child process remains active, no workspace has multiple writers, the issue branch is clean, and its local and remote tips match. Stop obsolete workflow-owned runs only after confirming they are not user-owned or still needed. A stale Paseo `running` label with no process should be reported as stale control-plane state; a live process must be stopped or reported as a hard blocker.

Do not impose an arbitrary round limit. Do not call the workflow complete because one agent became idle, one patch passed, or one review round ended. Completion requires the verified issue PR to remain open with the final report posted and workflow-owned agents reconciled, or a hard external blocker to be reported with the preserved branches, PR, agent IDs, evidence, and attempted recovery.
