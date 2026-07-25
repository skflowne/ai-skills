---
name: tdd-forge
description: Implement code changes with one primary author, one persistent independent correctness reviewer, and one persistent automated-test coverage reviewer using milestone-by-milestone RED/GREEN. Use when the user asks for implementation with continuous independent review, test-first development, review after meaningful changes instead of only at the end, or explicitly invokes $tdd-forge. Do not use for read-only reviews or trivial edits where no implementation is needed.
---

# TDD Forge

Keep all code and test authorship with the primary agent. Use exactly two independent smart specialists throughout the task:

- a correctness reviewer for behavior, regression, lifecycle, performance, and architecture risks;
- a test-coverage reviewer that designs automated tests one milestone at a time.

Neither reviewer edits files or runs a competing implementation.

## Continuous execution contract

This is one continuous implementation workflow. A reviewer response is workflow input, never a completion event. After every reviewer response, verify its findings; fix and re-review valid findings; and, when the milestone is clear, immediately begin the next incomplete milestone. A clean response from both reviewers still requires moving to the next milestone.

After spawning or messaging reviewers, use the `subagent_wait` tool to await their results. Never `end_turn` until every planned milestone is complete and the finish procedure has passed. Do not give the user a progress/completion summary or hand control back because a review arrived or a milestone completed. Before any final response, verify that every planned milestone is complete and the finish procedure has passed. Otherwise, continue the workflow.

## Plan before editing

When assigned an issue, create a dedicated branch before editing. After the required validation and review gates pass, open a PR for the completed work.

1. Read repository instructions and inspect enough context to define task boundaries.
2. Name the invariants (see below). Do this before slicing milestones — the slices and the test plan both follow from the invariants, not the other way around.
3. Create an explicit plan of cohesive, preferably vertical and independently testable milestones. Use the plan tool when available.
4. Put a RED/GREEN cycle and both reviewer gates in every behavior-bearing milestone.
5. Record the plan, including the invariant list and each invariant's owner, before editing any implementation or test file.
6. After the plan is recorded, immediately spawn both reviewers with no inherited conversation history.

Do not begin implementation before the plan exists and both reviewers are running.

## Name the invariants first

Before slicing the work, name the invariants the change introduces or touches — the properties that must hold regardless of ordering, interleaving, or failure. One sentence each, recorded in the plan: "the UI always converges to the last server-accepted write," "the planner entry and the calendar block always describe the same range."

- **One owner per invariant, end to end.** Exactly one mechanism enforces each invariant, across every file it spans. Never divide an invariant between milestones by directory or layer — state ownership is not file ownership. Splitting by file is what produces three duplicate ordering machines guarding one piece of state, none of them aware of the others.
- **Invariants govern the test plan.** Each user-visible invariant gets one end-to-end spec through the real interface. Ordering and interleaving semantics get unit tests against the mechanism that owns the invariant, which is a reason to keep that mechanism extractable. Derive coverage from the invariant list, not from the file list — and give the test-coverage reviewer the invariant its milestone belongs to, so it designs against the property rather than the diff.
- **Fix commits extend the owning invariant's spec** rather than adding a one-off regression test next to it. A fix that cannot be expressed as a case in that spec is a signal the invariant is owned in the wrong place — treat it as a design problem, not a missing test.

An invariant with no named owner, or one owned in more than one place, is a planning defect. Resolve it in the plan, before implementing.

## Look before authoring anything new

Before writing any new helper, hook, constant, type, or coordination mechanism — in production code or in tests — check whether an equivalent already exists. Read the repository's placement conventions (CLAUDE.md / AGENTS.md — where constants, pure logic, and hooks live) and look there first: list the shared directories, read the constants module. The step costs seconds; skipping it is how a codebase ends up with three write-ordering machines guarding one piece of state and two copies of the same formatter. If an equivalent exists, import it; if it almost fits, extend it rather than writing a parallel local version. A new definition that duplicates an existing shared symbol is a defect even when its logic is correct.

The same rule protects the other direction: never delete, inline, or bypass an existing shared module or accessor as part of a milestone or a fix. If a shared mechanism seems to be in the way, that is a design question — raise it in the plan and with the correctness reviewer; do not ship inline guards in its place.

## Select reviewer models

Use high-capability reasoning models for both reviewers. Never choose fast, low-thinking, or economy models because review runs in the background.

- OpenAI/Codex: use the configured reviewer model.
- Claude: use Opus.
- Kimi: use Kimi K3.
- Other runtimes: use the strongest available reasoning/coding model at medium reasoning or higher.

If a preferred model is unavailable, use the strongest substitute and disclose it. Keep the primary on the user-selected/default model unless asked otherwise.

## Brief the reviewers independently, once, up front

The spawn brief is the only time the primary describes the task to a reviewer. Give each reviewer, once: the original task prompt, the requirements, the complete milestone plan, the invariant list with each invariant's owner, the working branch and base ref, and an instruction not to edit files.

Ask the correctness reviewer to check the invariant list for gaps — invariants the change touches but the plan does not name, and any invariant the plan gives more than one owner — and to identify regression risks, validation targets, and missing review gates across the plan. Also give it a standing duplication-and-deletion lens for every milestone: flag code that reimplements an existing shared module or re-inlines an existing constant, and treat any deletion, inlining, or bypass of a shared module or accessor as an escalation — a design question to resolve, never a change to wave through because tests stay green. State the standing expectation for every review: concrete correctness and regression findings ranked by severity with exact file and line references. Do not ask it to co-design the implementation.

Ask the test-coverage reviewer to design automated tests for milestone 1 only, against the invariants that milestone owns. Require concrete test cases, assertions, fixtures/mocks, commands, and the failure that should prove RED. Do not request tests for later milestones yet and do not reveal the intended implementation.

If the milestone plan changes later, send both reviewers the updated plan as a plain factual update with no commentary on work in progress.

## Milestones are communication checkpoints

Milestones are purely communication points between the primary agent and reviewers, not stopping points. **DO NOT treat milestone updates as terminal messages.** Treat every reviewer response, including clean responses from both reviewers, as the trigger to continue the workflow: fix and re-review valid findings, then immediately start the next incomplete milestone. Do not stop or hand control back merely because a review arrived or a milestone was reached. The only stopping point is after every planned milestone has been implemented and the finish procedure is complete.

## Run one milestone at a time

For each milestone:

1. Ask the same test-coverage reviewer to design tests for this milestone only. For milestone 1, use its initial response. Call `subagent_wait` for the design; do not `end_turn` while waiting.
2. Verify that the proposed tests exercise requirements rather than implementation details. Resolve test-design gaps with the reviewer before coding, calling `subagent_wait` after each follow-up.
3. As the sole author, implement the agreed automated tests before production code.
4. Run them and establish RED: they must fail for the missing behavior and for the expected reason, not because of syntax, setup, environment, or unrelated failures.
5. If tests unexpectedly pass, determine whether behavior already exists or the tests are weak. Strengthen or correct the tests before proceeding.
6. Share the RED evidence with the test reviewer when the failure is ambiguous or the test design materially changed.
7. Implement the smallest complete production change that satisfies the milestone.
8. Run the new tests and relevant regression suite to establish GREEN.
9. Commit the milestone's work (tests and production code) with a message that names the milestone (e.g. `M2: <summary>`) so the reviewers can locate it.
10. Request review from both reviewers with only the milestone identifier (e.g. "Review M2") plus the raw, unedited RED and GREEN output (the commands run and their verbatim output) so neither reviewer reruns the same suites. Do not send diffs, change summaries, restated requirements, or areas to focus on: each reviewer finds the milestone's commits and inspects the changes and tests itself. Provide other raw artifacts only when a reviewer asks for them. The correctness reviewer applies its standing brief; the test reviewer checks for missing cases, false positives, brittle assertions, inadequate failure proof, and coverage gaps.
11. Call `subagent_wait` for both reviewers. Do not `end_turn` while waiting.
12. Verify findings, fix valid ones, rerun RED/GREEN-relevant validation, and commit the fixes. Reply to the appropriate reviewer with only which findings were addressed or rejected (with concrete evidence for rejections), the raw rerun validation output, and a request to re-review the milestone — do not describe the fixes. Call `subagent_wait` after each follow-up until both report no substantive remaining findings.
13. Only then mark the milestone complete and request test design for the next milestone.

Reuse the same two reviewer processes through follow-up messages. Do not spawn replacements at each gate.

## Commit every milestone and every fix

Non-negotiable: one commit per milestone, one commit per round of fixes. Never leave work uncommitted until the end, never squash several milestones into one commit, and never fold a fix round into the milestone commit it corrects.

- Milestone commits: `M<n>: <summary>`, carrying the milestone's tests and production code together.
- Fix commits: `fix: <summary>`, made after the rerun validation passes.

Two things depend on this. Each reviewer locates a milestone by its commits and inspects them itself — that is why review requests carry only a milestone identifier. And the shape of the history is a signal in its own right: a file recurring across consecutive `fix:` commits means the guards are accreting in one place and the seam is likely wrong. Squashing or deferring commits erases that signal exactly where it matters most.

## The refactor fork

The fix loop must not stack guards. Two triggers, either one sufficient:

- the same file appears in more than two consecutive fix rounds (in this task's rounds or in the existing `git log --name-only` history), or
- a reviewer classifies a finding as a wrong seam — the invariant it protects has no single owner or lives in the wrong place.

When a trigger fires, the next round is a refactor task, not another patch: restate the invariant the accumulated guards are protecting, extract or redesign the one mechanism that owns it (with unit tests on the extracted mechanism — ask the test-coverage reviewer to design them against the invariant), then re-run the existing behavioral suite unchanged. Do not add another guard, flag, or ref to state that already has several, and do not defer the refactor because the round is late or the diff is already large. If the refactor exceeds the task's scope, stop and report it as a blocking design finding instead of shipping the patch.

## Define meaningful milestones

Create a review gate after any cohesive user-visible slice or change to an API, schema, IPC boundary, persistence format, lifecycle, concurrency, process, power, security, destructive, or platform-specific contract. Batch tiny mechanical edits into the nearest milestone.

Structure behavior changes so each milestone can demonstrate RED/GREEN. For documentation, generated artifacts, or purely mechanical changes where a meaningful failing automated test is impossible, have the test reviewer specify the closest deterministic validation and record why strict RED does not apply. Never create a fake failing test merely to satisfy the ceremony.

## Run end-to-end specs locally only for what you touched

When the repository's CI runs the full end-to-end suite on push, never run the full suite locally. Locally, run only the spec(s) the milestone touched — RED/GREEN per spec still applies and is proven locally. After pushing, monitor the CI run (e.g. `gh run watch`) and treat failures as workflow input like any review finding: fix, commit, push, monitor again. If the repository has no CI for the suite, fall back to a full local run before opening the PR and say so in the final report.

## Preserve review integrity

- Do not leak intended fixes, defend the design, or prescribe reviewer conclusions.
- After the spawn brief, every review request contains only the milestone identifier and raw validation output. Never curate diffs, summarize changes, or steer a reviewer's attention. (Test-design requests and RED-evidence exchanges with the test reviewer are the designed exceptions.)
- Verify findings against code and requirements; do not accept them mechanically.
- Explain rejected findings with concrete evidence.
- Do not build later high-risk layers on an unreviewed milestone.
- While reviewers run, continue only separable work that cannot invalidate the pending gate, then call `subagent_wait` before advancing the gate. Never `end_turn` instead of waiting.
- If either reviewer is unavailable, disclose the block; never silently replace independent review with self-review.

## Finish

1. Run final tests, type checks, lint, builds, and runtime checks appropriate to the complete change.
2. Request one last focused pass from both reviewers, identifying the work only as the full branch against the base ref and attaching the raw final validation output; each reviewer inspects the final diff itself. Call `subagent_wait` for their results.
3. Resolve and re-review all substantive final findings, using `subagent_wait` after each follow-up.
4. Commit, push, publish, or mutate external state only when authorized.
5. Report milestone RED/GREEN evidence, final validation, both independent review outcomes, model substitutions, and residual risk.

The two specialized reviewers are not a council. Do not add more reviewers unless the user asks.
