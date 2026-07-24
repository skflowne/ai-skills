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
2. Create an explicit plan of cohesive, preferably vertical milestones. Use the plan tool when available.
3. Put a review gate in every behavior-bearing milestone.
4. Record the plan before editing any implementation or test file.
5. After the plan is recorded, immediately spawn the correctness reviewer with no inherited conversation history.

Do not begin implementation before the plan exists and the reviewer is running.

## Select the reviewer model

Use a high-capability reasoning model. Never choose a fast, low-thinking, or economy model because the review runs in the background.

- OpenAI/Codex: use the configured reviewer model.
- Claude: use Opus.
- Kimi: use Kimi K3.
- Other runtimes: use the strongest available reasoning/coding model at medium reasoning or higher.

If the preferred model is unavailable, use the strongest substitute and disclose it. Keep the primary on the user-selected/default model unless asked otherwise.

## Brief the reviewer once, up front

The spawn brief is the only time the primary describes the task to the reviewer. Give it, once: the original task prompt, the requirements, the complete milestone plan, the working branch and base ref, and an instruction not to edit files. State the standing expectation for every review: concrete correctness and regression findings ranked by severity with exact file and line references.

Ask the reviewer to identify invariants, regression risks, validation targets, and missing review gates across the plan. Do not ask it to co-design the implementation or review automated-test coverage separately.

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

## Define meaningful milestones

Create a review gate after any cohesive user-visible slice or change to an API, schema, IPC boundary, persistence format, lifecycle, concurrency, process, power, security, destructive, or platform-specific contract. Batch tiny mechanical edits into the nearest milestone.

For documentation, generated artifacts, or purely mechanical changes where a behavior-bearing review gate is unnecessary, perform deterministic validation and record why a full milestone gate does not apply.

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
