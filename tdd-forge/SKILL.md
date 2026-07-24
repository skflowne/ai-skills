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
2. Create an explicit plan of cohesive, preferably vertical and independently testable milestones. Use the plan tool when available.
3. Put a RED/GREEN cycle and both reviewer gates in every behavior-bearing milestone.
4. Record the plan before editing any implementation or test file.
5. After the plan is recorded, immediately spawn both reviewers with no inherited conversation history.

Do not begin implementation before the plan exists and both reviewers are running.

## Select reviewer models

Use high-capability reasoning models for both reviewers. Never choose fast, low-thinking, or economy models because review runs in the background.

- OpenAI/Codex: use the configured reviewer model.
- Claude: use Opus.
- Kimi: use Kimi K3.
- Other runtimes: use the strongest available reasoning/coding model at medium reasoning or higher.

If a preferred model is unavailable, use the strongest substitute and disclose it. Keep the primary on the user-selected/default model unless asked otherwise.

## Brief the reviewers independently, once, up front

The spawn brief is the only time the primary describes the task to a reviewer. Give each reviewer, once: the original task prompt, the requirements, the complete milestone plan, the working branch and base ref, and an instruction not to edit files.

Ask the correctness reviewer to identify invariants, regression risks, validation targets, and missing review gates across the plan. State the standing expectation for every review: concrete correctness and regression findings ranked by severity with exact file and line references. Do not ask it to co-design the implementation.

Ask the test-coverage reviewer to design automated tests for milestone 1 only. Require concrete test cases, assertions, fixtures/mocks, commands, and the failure that should prove RED. Do not request tests for later milestones yet and do not reveal the intended implementation.

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

## Define meaningful milestones

Create a review gate after any cohesive user-visible slice or change to an API, schema, IPC boundary, persistence format, lifecycle, concurrency, process, power, security, destructive, or platform-specific contract. Batch tiny mechanical edits into the nearest milestone.

Structure behavior changes so each milestone can demonstrate RED/GREEN. For documentation, generated artifacts, or purely mechanical changes where a meaningful failing automated test is impossible, have the test reviewer specify the closest deterministic validation and record why strict RED does not apply. Never create a fake failing test merely to satisfy the ceremony.

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
