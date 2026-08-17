# Canonical issue-to-PR orchestration loop

This reference defines the workflow shared by Paseo issue-to-PR controllers. The invoking skill supplies a profile containing its implementation skill, fixer skill, supporting skills, decision authority, publication policy, and report additions.

## Loading and handoff discipline

Read the Paseo lifecycle contract and this reference. Do not read implementation, fixer, exploration, or review skill bodies before dispatch; invoke them with first-token `/skill:<name>` and rely on their standard handoffs.

The issue is the implementation's complete semantic task. The controller must not rewrite its intent, restate its acceptance criteria, infer an implementation approach, qualify an exclusion, or add a requirement. Under the default prompt transport, pass only Paseo's task envelope, durable artifacts, and explicit profile overrides—never copied leaf policy, accumulated transcripts, or repeated raw logs. An invoking profile may instead declare path-only shared-artifact transport. In that mode, its artifact contract overrides every instruction in this reference to pass, give, or return task content: write the content to the artifact and use only the artifact path as the prompt payload.

The original issue and repository policy define the outer boundary for implementation and every dispatched fix. Do not absorb adjacent features, cleanup, compatibility work, dependencies, or test infrastructure. If they genuinely conflict or required work exceeds that boundary, stop the active writer and apply the invoking profile's scope-decision rule; never resolve the conflict by changing the issue in a child prompt.

This workflow runs to completion under Paseo's preflight, task-brief, invariant-parallelism, ambiguous-state recovery, run-to-completion, ledger, and retirement contracts. Initialize the workflow ledger before creating any workspace.

## Workflow

1. **Discover.** Require an issue number and authenticated repository access. Launch `/skill:explore` read-only to collect the issue verbatim, discussion and linked work, relevant implementation and tests, and related branches, worktrees, commits, and PRs. Discovery records evidence; it does not rewrite the task or acceptance criteria. Use its evidence to adopt existing work or select a committed base without deleting, overwriting, or duplicating work.
2. **Implement.** Create or adopt one issue workspace and branch. Launch the profile's implementation skill using the profile's prompt transport and discovery evidence. Verify its branch, PR, validation, review evidence, and handoff, then retire it before assigning another writer to that workspace.
3. **Review the assembled PR.** For each round, fetch the exact PR head and create a fresh, isolated, read-only review workspace. Preflight publication as required by the profile, then launch `/skill:drift-review-duo` with only the target refs, original intent and acceptance criteria, repository profile, validation evidence, and publication override. Mark the round consumed immediately before substantive review; a started review consumes its round even if it fails. Read the uniquely posted review directly rather than asking the agent to reproduce it.
4. **Dispatch worthwhile chunks.** The posted review is the findings handoff. For each eligible canonical resolution chunk, create one temporary Paseo branch and agent from the current issue tip. Launch the profile's fixer skill with the task envelope plus issue, PR, review permalink and round, and exactly one assigned chunk. Authorize only the external mutations stated by the profile.
5. **Schedule by invariant.** Run chunks in parallel only when they share no invariant, dependency, likely path, or integration decision. Otherwise run waves from the updated issue tip. Regroup overlap under one owner instead of allowing independent patches.
6. **Integrate.** Use one fresh integrator as the sole writer in the issue workspace. Give it only the current issue SHA, cleared chunk handoffs, merge order, repository constraints, and assembled validation. It verifies ancestry and clearance, integrates approved commits in dependency order, validates, pushes, and returns a compact handoff. A conflict revealing shared ownership goes to one reconciliation owner; the integrator must not invent a large fix.
7. **Repeat.** A round is clear only when no verified worthwhile findings remain. After rounds 1–3, report the integrated chunk count and validation result, then run a fresh assembled review. Round 4 is terminal: publish it but dispatch no remaining findings. Never exceed four substantive rounds.
8. **Finish.** If clear, verify required CI and leave the PR open for human review. Otherwise report `round cap reached — not verified clear` with untouched residual chunks. Retire agents as soon as evidence is durable, reconcile the complete Paseo ledger, and preserve evidence for any hard blocker. Never merge, enable auto-merge, or replace the PR body.

## Standard controller handoff

Post or update one concise final PR comment, then give the user a matching terse handoff. Include only the workflow status, the PR URL in the user handoff, and round-labeled review permalinks without summaries. Add failed checks or blockers, deferred findings, material decisions, scope expansions, residual risks, or supporting artifact links only when nonempty and actionable. Reuse the existing PR comment when resuming.

On success, omit routine validation, absent unconfigured CI, base or head SHAs, branch/open state, merge or auto-merge state, expected scope or instruction compliance, integrated-chunk summaries, and clear-review verdicts. Mention validation or CI only when a check failed or blocked completion, naming the failed check and impact. Never reproduce review bodies or emit empty headings and `None` placeholders.

A material decision is a real choice among viable options that affects the product or its maintenance, such as a dependency choice—not a stack inventory or restatement of the issue. A residual risk is an unresolved implementation-specific limitation on which the human can act, not a normal workflow fact.
