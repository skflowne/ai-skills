// pi/codex-dynamic-workflows port of ../workflows/fast-implement.js.
// Run with: codex-workflow run workflows-codex/fast-implement.js --config workflows-codex/codex-workflow.config.ts
//
// This variant delegates the complete implementation lifecycle to the shared dual-forge skill.
// The surrounding workflow only prepares the branch and ships a successfully validated change.

export const meta = {
  name: 'fast-implement',
  description: 'Implement a GitHub issue end to end with dual-forge and open a PR',
  phases: [
    { title: 'Setup' },
    { title: 'Implement with Dual Forge' },
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

phase('Implement with Dual Forge')
const testResults = await agent(`Fetch issue #${args.issueNumber} yourself. On branch ${branch}, use the $dual-forge skill to implement the issue end to end.

Read and follow the skill's complete process. You own all implementation work: inspect the repository, define and record cohesive testable milestones, choose and implement all appropriate automated coverage (including e2e when warranted), use the persistent independent correctness and test-coverage reviewers, establish RED/GREEN for each milestone, resolve substantive findings, and run final validation. Do not delegate planning, test design, implementation, or validation to a surrounding workflow, and do not post a plan to the issue. Commit the completed implementation only after the dual-forge gates pass. Report whether final validation passed, a concise summary, and any failures.`,
  { label: 'implement:dual-forge', schema: TEST_SCHEMA, provider: 'implement' })
log(`Dual-forge validation: ${testResults.passed ? 'passed' : 'FAILED'} — ${testResults.summary}`)
if (!testResults.passed) throw new Error(`Dual-forge validation failed: ${testResults.failures.join('; ')}`)

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
