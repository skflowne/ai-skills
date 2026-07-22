// pi/codex-dynamic-workflows port of ../workflows/fast-implement.js.
// Run with: codex-workflow run workflows-codex/fast-implement.js --config workflows-codex/codex-workflow.config.ts
//
// This variant uses the dual-forge implementation process in its implementation phase. The
// workflow prompt names the shared skill so the implementation agent can apply its persistent
// correctness and test-coverage review gates while the surrounding workflow handles setup, e2e,
// validation, and shipping.

export const meta = {
  name: 'fast-implement',
  description: 'Implement a GitHub issue end to end using the dual-forge implementation process, e2e validation, and a final PR',
  phases: [
    { title: 'Setup' },
    { title: 'Design' },
    { title: 'Implement with Dual Forge' },
    { title: 'E2E' },
    { title: 'Ship' },
  ],
}

const BRANCH_SCHEMA = {
  type: 'object',
  properties: { branch: { type: 'string' } },
  required: ['branch'],
}

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    summary: { type: 'string' },
    failures: { type: 'array', items: { type: 'string' } },
  },
  required: ['passed', 'summary', 'failures'],
}

phase('Setup')
const { branch } = await agent(`Fetch issue #${args.issueNumber} yourself. Create and check out a new branch for it off an up-to-date default branch (name it something like issue-${args.issueNumber}-<slug>). Do not discard any unrelated uncommitted changes already in the working tree — stash them first if present and note that you did. Return the branch name.`,
  { label: 'setup:branch', schema: BRANCH_SCHEMA })
log(`Branch ready: ${branch}`)

phase('Design')
const [implPlan, e2ePlan] = await parallel([
  () => agent(`Fetch issue #${args.issueNumber} yourself. Consider how the new code fits within the existing codebase and craft an implementation plan. Return the plan.`,
    { label: 'design:impl-plan', provider: 'design' }),
  () => agent(`Fetch issue #${args.issueNumber} yourself. Consider what needs to be tested in e2e so that, once these tests pass, the implementation can be considered robust and faithful to the issue's intent, with confidence future regressions will be caught. Return the e2e plan.`,
    { label: 'design:e2e-plan', provider: 'design' }),
])

await agent(`Post these two plans as comments on issue #${args.issueNumber} via gh issue comment — implementation plan and e2e plan, clearly labeled.

## Implementation plan
${implPlan}

## E2E plan
${e2ePlan}`,
  { label: 'design:post-plans' })
log('Plans posted to issue')

phase('Implement with Dual Forge')
await agent(`Fetch issue #${args.issueNumber} yourself. On branch ${branch}, use the $dual-forge skill to implement the issue following this plan:

${implPlan}

Read and follow the dual-forge skill's complete process. You are the primary author: record the plan, use persistent independent correctness and automated-test-coverage reviewers, work milestone by milestone, resolve substantive findings, and run the relevant validation. Do not use a one-shot implementation followed by a separate self-review. Commit the completed implementation and report the review gates and validation performed.`,
  { label: 'implement:dual-forge', provider: 'implement' })

phase('E2E')
await agent(`On branch ${branch}, implement the e2e tests per this plan:

${e2ePlan}

Commit your work.`,
  { label: 'e2e:implement', provider: 'implement' })

const testResults = await agent(`On branch ${branch}, run the relevant e2e tests plus any required lint, typecheck, unit, and integration checks for this project (discover the correct commands from the repo, e.g. package.json scripts). Report whether everything passed and include failure details if not.`,
  { label: 'e2e:run-tests', schema: TEST_SCHEMA, provider: 'test' })
log(`Tests: ${testResults.passed ? 'passed' : 'FAILED'} — ${testResults.summary}`)

phase('Ship')
const shipped = await agent(`On branch ${branch}, push it and open a PR for issue #${args.issueNumber} (reference/close the issue in the PR body). If PR creation tooling is unavailable, say so explicitly instead of guessing. Return the PR number and URL.`,
  {
    label: 'ship:pr',
    schema: { type: 'object', properties: { prNumber: { type: 'number' }, url: { type: 'string' } }, required: ['prNumber', 'url'] },
  })
log(`PR #${shipped.prNumber} opened: ${shipped.url}`)

return {
  branch,
  prNumber: shipped.prNumber,
  prUrl: shipped.url,
  testsPassed: testResults.passed,
  testSummary: testResults.summary,
  implementationProcess: 'dual-forge',
}
