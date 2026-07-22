---
name: dual-gate-forge
description: Implement code changes with one primary author, one persistent independent correctness reviewer, and one persistent automated-test coverage reviewer using milestone-by-milestone RED/GREEN. Use when the user asks for implementation with continuous independent review, test-first development, review after meaningful changes instead of only at the end, or explicitly invokes $dual-gate-forge. Do not use for read-only reviews or trivial edits where no implementation is needed.
---

# Dual Gate Forge

Keep all code and test authorship with the primary agent. Use exactly two independent smart specialists throughout the task:

- a correctness reviewer for behavior, regression, lifecycle, performance, and architecture risks;
- a test-coverage reviewer that designs automated tests one milestone at a time.

Neither reviewer edits files or runs a competing implementation.

## Plan before editing

1. Read repository instructions and inspect enough context to define task boundaries.
2. Create an explicit plan of cohesive, preferably vertical and independently testable milestones. Use the plan tool when available.
3. Put a RED/GREEN cycle and both reviewer gates in every behavior-bearing milestone.
4. Record the plan before editing any implementation or test file.
5. After the plan is recorded, immediately spawn both reviewers with no inherited conversation history.

Do not begin implementation before the plan exists and both reviewers are running.

## Select reviewer models

Use high-capability reasoning models for both reviewers. Never choose fast, low-thinking, or economy models because review runs in the background.

- OpenAI/Codex: use the latest `sol` model with medium reasoning or higher (currently `gpt-5.6-sol`, `reasoning_effort: medium`).
- Claude: use Opus.
- Kimi: use Kimi K3.
- Other runtimes: use the strongest available reasoning/coding model at medium reasoning or higher.

If a preferred model is unavailable, use the strongest substitute and disclose it. Keep the primary on the user-selected/default model unless asked otherwise.

## Brief the reviewers independently

Give both reviewers only task-local requirements, milestone boundaries, relevant paths or raw artifacts, and an instruction not to edit files.

Ask the correctness reviewer to identify invariants, regression risks, validation targets, and missing review gates across the plan. Do not ask it to co-design the implementation.

Ask the test-coverage reviewer to design automated tests for milestone 1 only. Require concrete test cases, assertions, fixtures/mocks, commands, and the failure that should prove RED. Do not request tests for later milestones yet and do not reveal the intended implementation.

## Run one milestone at a time

For each milestone:

1. Ask the same test-coverage reviewer to design tests for this milestone only. For milestone 1, use its initial response.
2. Verify that the proposed tests exercise requirements rather than implementation details. Resolve test-design gaps with the reviewer before coding.
3. As the sole author, implement the agreed automated tests before production code.
4. Run them and establish RED: they must fail for the missing behavior and for the expected reason, not because of syntax, setup, environment, or unrelated failures.
5. If tests unexpectedly pass, determine whether behavior already exists or the tests are weak. Strengthen or correct the tests before proceeding.
6. Share the RED evidence with the test reviewer when the failure is ambiguous or the test design materially changed.
7. Implement the smallest complete production change that satisfies the milestone.
8. Run the new tests and relevant regression suite to establish GREEN.
9. Send the raw milestone diff, requirements, and test output to both reviewers:
   - correctness reviewer: concrete correctness/regression findings ranked by severity with exact file and line references;
   - test reviewer: missing cases, false positives, brittle assertions, inadequate failure proof, and coverage gaps.
10. Verify findings, fix valid ones, rerun RED/GREEN-relevant validation, and send corrections back to the appropriate reviewer until both report no substantive remaining findings.
11. Only then mark the milestone complete and request test design for the next milestone.

Reuse the same two reviewer processes through follow-up messages. Do not spawn replacements at each gate.

## Define meaningful milestones

Create a review gate after any cohesive user-visible slice or change to an API, schema, IPC boundary, persistence format, lifecycle, concurrency, process, power, security, destructive, or platform-specific contract. Batch tiny mechanical edits into the nearest milestone.

Structure behavior changes so each milestone can demonstrate RED/GREEN. For documentation, generated artifacts, or purely mechanical changes where a meaningful failing automated test is impossible, have the test reviewer specify the closest deterministic validation and record why strict RED does not apply. Never create a fake failing test merely to satisfy the ceremony.

## Preserve review integrity

- Do not leak intended fixes, defend the design, or prescribe reviewer conclusions.
- Verify findings against code and requirements; do not accept them mechanically.
- Explain rejected findings with concrete evidence.
- Do not build later high-risk layers on an unreviewed milestone.
- While reviewers run, continue only separable work that cannot invalidate the pending gate.
- If either reviewer is unavailable, disclose the block; never silently replace independent review with self-review.

## Finish

1. Run final tests, type checks, lint, builds, and runtime checks appropriate to the complete change.
2. Send the final complete diff and validation evidence to both reviewers for one last focused pass.
3. Resolve and re-review all substantive final findings.
4. Commit, push, publish, or mutate external state only when authorized.
5. Report milestone RED/GREEN evidence, final validation, both independent review outcomes, model substitutions, and residual risk.

The two specialized reviewers are not a council. Do not add more reviewers unless the user asks.
