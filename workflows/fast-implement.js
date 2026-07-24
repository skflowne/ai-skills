export const meta = {
  name: 'fast-implement',
  description: 'Implement a GitHub issue end to end with TDD Forge and open a PR',
  phases: [
    { title: 'Setup' },
    { title: 'Implement with TDD Forge' },
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
  { label: 'setup:branch', schema: BRANCH_SCHEMA, agentType: 'general-purpose' })
log(`Branch ready: ${branch}`)

phase('Implement with TDD Forge')
const testResults = await agent(`Fetch issue #${args.issueNumber} yourself. On branch ${branch}, follow the tdd-forge skill to implement the issue end to end.

Read and follow the skill's complete process. You own all implementation work: inspect the repository, define and record cohesive testable milestones, choose and implement all appropriate automated coverage (including e2e when warranted), use the persistent independent correctness and test-coverage reviewers, establish RED/GREEN for each milestone, resolve substantive findings, and run final validation. Do not delegate planning, test design, implementation, or validation to a surrounding workflow, and do not post a plan to the issue. Commit the completed implementation only after the TDD Forge gates pass. Report whether final validation passed, a concise summary, and any failures.`,
  { label: 'implement:tdd-forge', schema: TEST_SCHEMA, agentType: 'general-purpose' })
log(`TDD Forge validation: ${testResults.passed ? 'passed' : 'FAILED'} — ${testResults.summary}`)
if (!testResults.passed) throw new Error(`TDD Forge validation failed: ${testResults.failures.join('; ')}`)

phase('Ship')
const shipped = await agent(`On branch ${branch}, push it and open a PR for issue #${args.issueNumber} (reference/close the issue in the PR body). If PR creation tooling is unavailable, say so explicitly instead of guessing. Return the PR number and URL.`,
  {
    label: 'ship:pr',
    schema: { type: 'object', properties: { prNumber: { type: 'number' }, url: { type: 'string' } }, required: ['prNumber', 'url'] },
    agentType: 'general-purpose',
  })
log(`PR #${shipped.prNumber} opened: ${shipped.url}`)

return {
  branch,
  prNumber: shipped.prNumber,
  prUrl: shipped.url,
  testsPassed: testResults.passed,
  testSummary: testResults.summary,
  implementationProcess: 'tdd-forge',
}
