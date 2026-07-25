---
name: supervised-forge
description: Implement code changes with one primary author and one persistent independent correctness reviewer using milestone-by-milestone review gates. Use when the user asks for implementation with continuous independent review or explicitly invokes $supervised-forge. Do not use for read-only reviews or trivial edits where no implementation is needed.
---

# Supervised Forge

Keep all code and test authorship with the primary agent. Use exactly one independent smart specialist throughout the task:

- a correctness reviewer for behavior, regression, lifecycle, performance, architecture, and other implementation risks.

The reviewer does not edit files or run a competing implementation. This skill provides correctness review only; it does not add a separate automated-test-coverage review process.

## Continuous execution contract

This is one continuous implementation workflow. A reviewer response is workflow input, never a completion event. After every reviewer response, verify its findings; fix and re-review valid findings; and, when the milestone is clear, immediately begin the next incomplete milestone. A clean review still requires moving to the next milestone.

After spawning or messaging a reviewer, use the `subagent_wait` tool to await its result. Never `end_turn` until every planned milestone is complete and the finish procedure has passed. Do not give the user a progress/completion summary or hand control back because a review arrived or a milestone completed. Before any final response, verify that every planned milestone is complete and the finish procedure has passed. Otherwise, continue the workflow.

## Plan before editing

When assigned an issue, create a dedicated branch before editing. After the required validation and review gates pass, open a PR for the completed work.

1. Read repository instructions and inspect enough context to define task boundaries.
2. Name the invariants (see below). Do this before slicing milestones — the slices follow from the invariants, not the other way around.
3. Create an explicit plan of cohesive, preferably vertical milestones. Use the plan tool when available.
4. Put a review gate in every behavior-bearing milestone.
5. Record the plan, including the invariant list and each invariant's owner, before editing any implementation or test file.
6. After the plan is recorded, immediately spawn the correctness reviewer with no inherited conversation history.

Do not begin implementation before the plan exists and the reviewer is running.

## Name the invariants first

Before slicing the work, name the invariants the change introduces or touches — the properties that must hold regardless of ordering, interleaving, or failure. One sentence each, recorded in the plan: "the UI always converges to the last server-accepted write," "the planner entry and the calendar block always describe the same range."

- **One owner per invariant, end to end.** Exactly one mechanism enforces each invariant, across every file it spans. Never divide an invariant between milestones by directory or layer — state ownership is not file ownership. Splitting by file is what produces three duplicate ordering machines guarding one piece of state, none of them aware of the others.
- **Invariants govern the test plan.** Each user-visible invariant gets one end-to-end spec through the real interface. Ordering and interleaving semantics get unit tests against the mechanism that owns the invariant, which is a reason to keep that mechanism extractable. Derive coverage from the invariant list, not from the file list.
- **Fix commits extend the owning invariant's spec** rather than adding a one-off regression test next to it. A fix that cannot be expressed as a case in that spec is a signal the invariant is owned in the wrong place — treat it as a design problem, not a missing test.

An invariant with no named owner, or one owned in more than one place, is a planning defect. Resolve it in the plan, before implementing.

## Look before authoring anything new

Before writing any new helper, hook, constant, type, or coordination mechanism, check whether an equivalent already exists. Read the repository's placement conventions (CLAUDE.md / AGENTS.md — where constants, pure logic, and hooks live) and look there first: list the shared directories, read the constants module. The step costs seconds; skipping it is how a codebase ends up with three write-ordering machines guarding one piece of state and two copies of the same formatter. If an equivalent exists, import it; if it almost fits, extend it rather than writing a parallel local version. A new definition that duplicates an existing shared symbol is a defect even when its logic is correct.

The same rule protects the other direction: never delete, inline, or bypass an existing shared module or accessor as part of a milestone or a fix. If a shared mechanism seems to be in the way, that is a design question — raise it in the plan and with the reviewer; do not ship inline guards in its place.

## Select the reviewer model

Use a high-capability reasoning model. Never choose a fast, low-thinking, or economy model because the review runs in the background.

- OpenAI/Codex: use the configured reviewer model.
- Claude: use Opus.
- Kimi: use Kimi K3.
- Other runtimes: use the strongest available reasoning/coding model at medium reasoning or higher.

If the preferred model is unavailable, use the strongest substitute and disclose it. Keep the primary on the user-selected/default model unless asked otherwise.

## Brief the reviewer once, up front

The spawn brief is the only time the primary describes the task to the reviewer. Give it, once: the original task prompt, the requirements, the complete milestone plan, the invariant list with each invariant's owner, the working branch and base ref, and an instruction not to edit files. State the standing expectation for every review: concrete correctness and regression findings ranked by severity with exact file and line references.

Ask the reviewer to check the invariant list for gaps — invariants the change touches but the plan does not name, and any invariant the plan gives more than one owner — and to identify regression risks, validation targets, and missing review gates across the plan. Also give it a standing duplication-and-deletion lens for every milestone: flag code that reimplements an existing shared module or re-inlines an existing constant, and treat any deletion, inlining, or bypass of a shared module or accessor as an escalation — a design question to resolve, never a change to wave through because tests stay green. Do not ask it to co-design the implementation or review automated-test coverage separately.

If the milestone plan changes later, send the reviewer the updated plan as a plain factual update with no commentary on work in progress.

## Milestones are communication checkpoints

Milestones are purely communication points between the primary agent and reviewer, not stopping points. **DO NOT treat milestone updates as terminal messages.** Treat every reviewer response, including a clean review, as the trigger to continue the workflow: fix and re-review valid findings, then immediately start the next incomplete milestone. Do not stop or hand control back merely because a review arrived or a milestone was reached. The only stopping point is after every planned milestone has been implemented and the finish procedure is complete.

## Run one milestone at a time

For each milestone:

1. Implement the smallest complete change for that milestone as the sole author.
2. Run the tests and other relevant validation appropriate to the milestone.
3. Commit the milestone's work with a message that names the milestone (e.g. `M2: <summary>`) so the reviewer can locate it.
4. Request review with only the milestone identifier (e.g. "Review M2") plus the raw, unedited validation output from step 2 (the commands run and their verbatim output) so the reviewer does not rerun the same checks. Do not send diffs, change summaries, restated requirements, or areas to focus on: the reviewer finds the milestone's commits and inspects the changes itself. Provide other raw artifacts only when the reviewer asks for them.
5. Call `subagent_wait` for the reviewer. Do not `end_turn` while waiting.
6. Verify findings against the code and requirements; do not accept them mechanically.
7. Fix valid findings, rerun relevant validation, and commit the fixes. Reply with only which findings were addressed or rejected (with concrete evidence for rejections), the raw rerun validation output, and a request to re-review the milestone — do not describe the fixes. Call `subagent_wait` after each follow-up until no substantive findings remain.
8. Only then mark the milestone complete and proceed to the next one.

Reuse the same reviewer process through follow-up messages. Do not spawn replacements at each gate.

## Commit every milestone and every fix

Non-negotiable: one commit per milestone, one commit per round of fixes. Never leave work uncommitted until the end, never squash several milestones into one commit, and never fold a fix round into the milestone commit it corrects.

- Milestone commits: `M<n>: <summary>`.
- Fix commits: `fix: <summary>`, made after the rerun validation passes.

Two things depend on this. The reviewer locates a milestone by its commits and inspects them itself — that is why review requests carry only a milestone identifier. And the shape of the history is a signal in its own right: a file recurring across consecutive `fix:` commits means the guards are accreting in one place and the seam is likely wrong. Squashing or deferring commits erases that signal exactly where it matters most.

## The refactor fork

The fix loop must not stack guards. Two triggers, either one sufficient:

- the same file appears in more than two consecutive fix rounds (in this task's rounds or in the existing `git log --name-only` history), or
- the reviewer classifies a finding as a wrong seam — the invariant it protects has no single owner or lives in the wrong place.

When a trigger fires, the next round is a refactor task, not another patch: restate the invariant the accumulated guards are protecting, extract or redesign the one mechanism that owns it (with unit tests on the extracted mechanism), then re-run the existing behavioral suite unchanged. Do not add another guard, flag, or ref to state that already has several, and do not defer the refactor because the round is late or the diff is already large. If the refactor exceeds the task's scope, stop and report it as a blocking design finding instead of shipping the patch.

## Define meaningful milestones

Create a review gate after any cohesive user-visible slice or change to an API, schema, IPC boundary, persistence format, lifecycle, concurrency, process, power, security, destructive, or platform-specific contract. Batch tiny mechanical edits into the nearest milestone.

For documentation, generated artifacts, or purely mechanical changes where a behavior-bearing review gate is unnecessary, perform deterministic validation and record why a full milestone gate does not apply.

## Run end-to-end specs locally only for what you touched

When the repository's CI runs the full end-to-end suite on push, never run the full suite locally. Locally, run only the spec(s) the milestone touched — red-green per spec still applies. After pushing, monitor the CI run (e.g. `gh run watch`) and treat failures as workflow input like any review finding: fix, commit, push, monitor again. If the repository has no CI for the suite, fall back to a full local run before opening the PR and say so in the final report.

## Preserve review integrity

- Do not leak intended fixes, defend the design, or prescribe the reviewer's conclusions.
- After the spawn brief, every review request contains only the milestone identifier and raw validation output. Never curate diffs, summarize changes, or steer the reviewer's attention.
- Explain rejected findings with concrete evidence.
- Do not build later high-risk layers on an unreviewed milestone.
- While the reviewer runs, continue only separable work that cannot invalidate the pending gate, then call `subagent_wait` before advancing the gate. Never `end_turn` instead of waiting.
- If the reviewer is unavailable, disclose the block; never silently replace independent review with self-review.

## Finish

1. Run final tests, type checks, lint, builds, and runtime checks appropriate to the complete change.
2. Request one last focused pass over the complete change, identifying it only as the full branch against the base ref and attaching the raw final validation output; the reviewer inspects the final diff itself. Call `subagent_wait` for the result.
3. Resolve and re-review all substantive final findings, using `subagent_wait` after each follow-up.
4. Commit, push, publish, or mutate external state only when authorized.
5. Report milestone validation, final validation, the independent review outcome, model substitutions, and residual risk.

This is a single-reviewer process, not a council. Do not add automated-test reviewers or other reviewers unless the user asks.
