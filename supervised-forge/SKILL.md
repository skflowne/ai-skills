---
name: supervised-forge
description: Implement code changes with one primary author and one persistent independent correctness reviewer using milestone-by-milestone review gates. Use when the user asks for implementation with continuous independent review or explicitly invokes $supervised-forge. Do not use for read-only reviews or trivial edits where no implementation is needed.
---

# Supervised Forge

Keep all code and test authorship with the primary agent. Use exactly one independent smart specialist throughout the task:

- a correctness reviewer for behavior, regression, lifecycle, performance, architecture, and other implementation risks.

The reviewer does not edit files or run a competing implementation. This skill provides correctness review only; it does not add a separate automated-test-coverage review process.

## Plan before editing

1. Read repository instructions and inspect enough context to define task boundaries.
2. Create an explicit plan of cohesive, preferably vertical milestones. Use the plan tool when available.
3. Put a review gate in every behavior-bearing milestone.
4. Record the plan before editing any implementation or test file.
5. After the plan is recorded, immediately spawn the correctness reviewer with no inherited conversation history.

Do not begin implementation before the plan exists and the reviewer is running.

## Select the reviewer model

Use a high-capability reasoning model. Never choose a fast, low-thinking, or economy model because the review runs in the background.

- OpenAI/Codex: use the latest `sol` model with medium reasoning or higher (currently `gpt-5.6-sol`, `reasoning_effort: medium`).
- Claude: use Opus.
- Kimi: use Kimi K3.
- Other runtimes: use the strongest available reasoning/coding model at medium reasoning or higher.

If the preferred model is unavailable, use the strongest substitute and disclose it. Keep the primary on the user-selected/default model unless asked otherwise.

## Brief the reviewer

Give the reviewer only task-local requirements, milestone boundaries, relevant paths, or raw artifacts, and instruct it not to edit files.

Ask the reviewer to identify invariants, regression risks, validation targets, and missing review gates across the plan. Do not ask it to co-design the implementation or review automated-test coverage separately.

## Milestones are communication checkpoints

Milestones are purely communication points between the primary agent and reviewer, not stopping points. When a reviewer returns findings, fix the valid findings; once the milestone is clear, immediately start the next milestone. Do not stop or hand control back merely because a milestone was reached. The only stopping point is after every planned milestone has been implemented and the finish procedure is complete.

## Run one milestone at a time

For each milestone:

1. Implement the smallest complete change for that milestone as the sole author.
2. Run the tests and other relevant validation appropriate to the milestone.
3. Send the raw milestone diff, requirements, and validation output to the reviewer.
4. Ask for concrete correctness and regression findings ranked by severity with exact file and line references.
5. Verify findings against the code and requirements; do not accept them mechanically.
6. Fix valid findings, rerun relevant validation, and send the corrections back to the reviewer until no substantive findings remain.
7. Only then mark the milestone complete and proceed to the next one.

Reuse the same reviewer process through follow-up messages. Do not spawn replacements at each gate.

## Define meaningful milestones

Create a review gate after any cohesive user-visible slice or change to an API, schema, IPC boundary, persistence format, lifecycle, concurrency, process, power, security, destructive, or platform-specific contract. Batch tiny mechanical edits into the nearest milestone.

For documentation, generated artifacts, or purely mechanical changes where a behavior-bearing review gate is unnecessary, perform deterministic validation and record why a full milestone gate does not apply.

## Preserve review integrity

- Do not leak intended fixes, defend the design, or prescribe the reviewer's conclusions.
- Explain rejected findings with concrete evidence.
- Do not build later high-risk layers on an unreviewed milestone.
- While the reviewer runs, continue only separable work that cannot invalidate the pending gate.
- If the reviewer is unavailable, disclose the block; never silently replace independent review with self-review.

## Finish

1. Run final tests, type checks, lint, builds, and runtime checks appropriate to the complete change.
2. Send the final complete diff and validation evidence to the reviewer for one last focused pass.
3. Resolve and re-review all substantive final findings.
4. Commit, push, publish, or mutate external state only when authorized.
5. Report milestone validation, final validation, the independent review outcome, model substitutions, and residual risk.

This is a single-reviewer process, not a council. Do not add automated-test reviewers or other reviewers unless the user asks.
