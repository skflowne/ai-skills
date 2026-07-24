export const meta = {
  name: 'supervised-forge-implement',
  description: 'Implement a GitHub issue end to end with Supervised Forge and open a PR',
  phases: [
    { title: 'Setup' },
    { title: 'Implement with Supervised Forge' },
    { title: 'Ship' },
  ],
}

// Some harnesses hand `args` through as a JSON-encoded string rather than the parsed object.
const ARGS = typeof args === 'string' ? JSON.parse(args) : args

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
const { branch } = await agent(`Fetch issue #${ARGS.issueNumber} yourself. Create and check out a new branch for it off an up-to-date default branch (name it something like issue-${ARGS.issueNumber}-<slug>). Do not discard any unrelated uncommitted changes already in the working tree — stash them first if present and note that you did. Return the branch name.`,
  { label: 'setup:branch', schema: BRANCH_SCHEMA, agentType: 'general-purpose' })
log(`Branch ready: ${branch}`)

phase('Implement with Supervised Forge')
const testResults = await agent(`Fetch issue #${ARGS.issueNumber} yourself. On branch ${branch}, follow the supervised-forge skill to implement the issue end to end.

Read and follow the skill's complete process. You are the sole implementer, paired with one persistent independent correctness reviewer per the skill: inspect the repository, record an explicit milestone plan before editing anything, put a review gate on every behavior-bearing milestone, brief the reviewer once up front, resolve and re-review every finding before advancing, and run the finish procedure (final tests, lint, typecheck, build, and one last focused reviewer pass over the complete diff) before considering the work done. Use subagent_wait after every reviewer dispatch and do not end_turn until every milestone and the finish procedure are complete. Do not post a plan to the issue. Commit the completed implementation only after the finish procedure passes. Report whether final validation passed, a concise summary, and any failures.`,
  { label: 'implement:supervised-forge', schema: TEST_SCHEMA, agentType: 'general-purpose' })
log(`Supervised Forge validation: ${testResults.passed ? 'passed' : 'FAILED'} — ${testResults.summary}`)
if (!testResults.passed) throw new Error(`Supervised Forge validation failed: ${testResults.failures.join('; ')}`)

phase('Ship')
const shipped = await agent(`On branch ${branch}, push it and open a PR for issue #${ARGS.issueNumber} (reference/close the issue in the PR body). If PR creation tooling is unavailable, say so explicitly instead of guessing. Return the PR number and URL.`,
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
  implementationProcess: 'supervised-forge',
}
