---
name: paseo-verified-issue
description: Implement a GitHub issue through Paseo with Portolan Forge and CodeGraph evaluation, then run autonomous drift-review-duo and recursively dispatch worthwhile fix chunks until the PR is clear and merged.
---

# Paseo Verified Issue

Own an issue from implementation through merge. Use [paseo](../paseo/SKILL.md) for every agent workspace, [portolan-forge](../portolan-forge/SKILL.md) for every implementation chunk, [codegraph-evaluation](../codegraph-evaluation/SKILL.md) throughout, and [drift-review-duo](../drift-review-duo/SKILL.md) for branch-level verification.

The user preauthorizes this workflow to make implementation and review decisions. Never request a preference or approval. When direction is not dictated by repository evidence, perform [trade-off analysis](../trade-off-analysis/SKILL.md), choose the strongest option, continue, and record:

- context and problem;
- option chosen and why;
- options considered and their material trade-offs.

If evidence remains unavailable after reasonable inspection, state the assumptions and choose the safest reversible option; do not turn uncertainty into a user decision request.

Stop only for a hard external blocker such as unavailable credentials, an inaccessible remote, an unsafe irreversible action outside the requested issue/PR lifecycle, or infrastructure failure that remains after reasonable recovery attempts.

## 1. Preflight and implementation

Require an issue number. Resolve the repository, authenticated GitHub identity, default or explicitly stacked base, clean-tree state, active Paseo agents, and current `paseo run --help`; verify issue scope and repository instructions rather than asking for facts that can be inspected. Leave unrelated dirty work untouched and branch from the selected committed base, recording anything excluded from the run.

Create one Paseo worktree branch for the issue and launch an agent whose prompt begins with `/skill:portolan-forge`. Explicitly require it to:

- implement the complete issue;
- follow `codegraph-evaluation` and commit its `.codegraph-evals/issue-<number>-<task>.md` report;
- resolve decision forks autonomously using the decision-log contract above;
- push the issue branch and open its single PR; and
- return the branch, PR URL, commits, validation, reviewer results, and decision log.

Paseo already owns the worktree; tell Portolan not to create a nested one. Wait with `paseo wait`, then inspect the agent and logs. An idle request for a decision is not completion: send the autonomous-decision contract and continue waiting.

## 2. Drift review

Run `drift-review-duo` against the PR in a separate Paseo worktree. Do not let it edit or post GitHub comments. Run it in the foreground with `--output-schema` so its findings and resolution chunks are machine-readable; Paseo does not support structured output together with `--background`.

Require each verified finding to include severity, classification, invariant when applicable, evidence, realistic impact, dependencies, affected paths, and a cohesive agent-sized resolution chunk. The reviewer must not ask for plan approval.

The workflow adjudicates what is worth doing:

- verified bugs are always worth fixing;
- refactors almost certain to make later work safer, faster, or less error-prone are always worth doing;
- for everything else, compare fix, defer, and alternative approaches using trade-off analysis, choose, and record the decision;
- speculative, duplicate, already-recorded, or disproven findings are not work.

A review is clear when it contains no verified worthwhile findings. Record deferred findings and why they were not worth doing.

## 3. Dispatch resolution chunks

Create exactly one Paseo agent and temporary branch per worthwhile resolution chunk. Each branch starts from the latest issue-branch tip. Run independent chunks in parallel only when they share neither invariant, dependency, nor likely paths; run dependent or overlapping chunks sequentially from the updated issue branch.

Each fix prompt begins with `/skill:portolan-forge` and includes the original issue and PR, complete finding evidence, chunk boundary, base ref, acceptance evidence, neighboring constraints, and the autonomous-decision contract. Require the agent to follow `codegraph-evaluation`, commit a uniquely named `.codegraph-evals/issue-<number>-pr-<number>-<chunk>.md`, verify the chunk through Portolan's gates, and return a commit/branch for integration. Override Portolan's normal handoff: a fix agent must not open another PR or merge itself.

Wait for every dispatched agent and inspect its evidence. Send verified branches to the original issue agent, which remains the sole integrator. It merges them into the issue branch, resolves integration conflicts using repository evidence and trade-off analysis, runs assembled validation, pushes the updated PR, and records decisions. A conflict revealing shared invariant ownership means the affected chunks were not independent; integrate or rework them sequentially under one owner rather than forcing both patches together.

## 4. Repeat and merge

After all selected fixes are integrated, run a fresh full `drift-review-duo` against the assembled PR—not separate final reviews of each fix branch.

- If worthwhile findings remain, repeat review adjudication, one-agent-per-chunk dispatch, integration, validation, and full drift review.
- If no worthwhile findings remain, verify required CI and repository merge requirements, choose the repository-supported merge strategy through trade-off analysis when policy does not dictate one, update the PR description with validation, CodeGraph report links, drift-review rounds, deferred findings, and decision log, then merge the PR.

Do not impose an arbitrary round limit. Do not call the workflow complete because one agent became idle, one patch passed, or one review round ended. Completion requires the issue PR to be merged or a hard external blocker to be reported with the preserved branches, PR, agent IDs, evidence, and attempted recovery.
