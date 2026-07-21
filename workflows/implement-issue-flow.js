export const meta = {
  name: 'implement-issue-flow',
  description: 'Implement a GitHub issue end to end (design, implement, review, e2e, final review, PR) fully unattended',
  phases: [
    { title: 'Setup' },
    { title: 'Design', model: 'opus' },
    { title: 'Implement' },
    { title: 'Initial review', model: 'opus' },
    { title: 'E2E' },
    { title: 'Final review', model: 'opus' },
    { title: 'Ship' },
  ],
}

const BRANCH_SCHEMA = {
  type: 'object',
  properties: { branch: { type: 'string' } },
  required: ['branch'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          file: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['severity', 'description'],
      },
    },
  },
  required: ['findings'],
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    actionable: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          file: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['severity', 'description'],
      },
    },
    rationale: { type: 'string' },
  },
  required: ['actionable', 'rationale'],
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

async function reviewJudgeFix(label, reviewPrompt, fixPromptPrefix) {
  const review = await agent(reviewPrompt, {
    label: `${label}:review`, model: 'opus', schema: FINDINGS_SCHEMA, agentType: 'general-purpose',
  })

  if (!review.findings.length) return { fixed: [], rationale: 'no findings reported' }

  const judged = await agent(`Judge these review findings with a critical mindset — drop anything speculative or lacking evidence, keep what's real and worth fixing now:

${JSON.stringify(review.findings, null, 2)}`,
    { label: `${label}:judge`, model: 'opus', schema: JUDGE_SCHEMA, agentType: 'general-purpose' })

  if (!judged.actionable.length) return { fixed: [], rationale: judged.rationale }

  await agent(`${fixPromptPrefix}\n\nFindings to fix:\n${JSON.stringify(judged.actionable, null, 2)}\n\nCommit your fixes when done.`,
    { label: `${label}:fix`, agentType: 'general-purpose' })

  return { fixed: judged.actionable, rationale: judged.rationale }
}

phase('Setup')
const { branch } = await agent(`Fetch issue #${args.issueNumber} yourself. Create and check out a new branch for it off an up-to-date default branch (name it something like issue-${args.issueNumber}-<slug>). Do not discard any unrelated uncommitted changes already in the working tree — stash them first if present and note that you did. Return the branch name.`,
  { label: 'setup:branch', schema: BRANCH_SCHEMA, agentType: 'general-purpose' })
log(`Branch ready: ${branch}`)

phase('Design')
const [implPlan, e2ePlan] = await parallel([
  () => agent(`Fetch issue #${args.issueNumber} yourself. Consider how the new code fits within the existing codebase and craft an implementation plan. Return the plan.`,
    { label: 'design:impl-plan', model: 'opus', agentType: 'general-purpose' }),
  () => agent(`Fetch issue #${args.issueNumber} yourself. Consider what needs to be tested in e2e so that, once these tests pass, the implementation can be considered robust and faithful to the issue's intent, with confidence future regressions will be caught. Return the e2e plan.`,
    { label: 'design:e2e-plan', model: 'opus', agentType: 'general-purpose' }),
])

await agent(`Post these two plans as comments on issue #${args.issueNumber} via gh issue comment — implementation plan and e2e plan, clearly labeled.

## Implementation plan
${implPlan}

## E2E plan
${e2ePlan}`,
  { label: 'design:post-plans', agentType: 'general-purpose' })
log('Plans posted to issue')

phase('Implement')
await agent(`Fetch issue #${args.issueNumber} yourself. On branch ${branch}, implement it following this plan:

${implPlan}

Adopt a critical mindset — ensure the change fits the codebase and exposes sensible interfaces for future reuse. Commit your work.`,
  { label: 'implement', agentType: 'general-purpose' })

phase('Initial review')
const initialFix = await reviewJudgeFix(
  'initial-review',
  `Fetch issue #${args.issueNumber} yourself and review the implementation just committed on branch ${branch} against it. Provide actual evidence for every claim — do not rely on hypotheticals unlikely to materialize. Report findings only, do not post anywhere.`,
  `On branch ${branch}, resolve these review findings from the initial implementation review.`,
)
log(`Initial review: ${initialFix.fixed.length} finding(s) fixed`)

phase('E2E')
await agent(`On branch ${branch}, implement the e2e tests per this plan:

${e2ePlan}

Commit your work.`,
  { label: 'e2e:implement', agentType: 'general-purpose' })

const testResults = await agent(`On branch ${branch}, run the relevant e2e tests plus any required lint, typecheck, unit, and integration checks for this project (discover the correct commands from the repo, e.g. package.json scripts). Report whether everything passed and include failure details if not.`,
  { label: 'e2e:run-tests', schema: TEST_SCHEMA, agentType: 'general-purpose' })
log(`Tests: ${testResults.passed ? 'passed' : 'FAILED'} — ${testResults.summary}`)

phase('Final review')
const finalFix = await reviewJudgeFix(
  'final-review',
  `Fetch issue #${args.issueNumber} yourself. Review the full diff on branch ${branch} against it, plus these test results:

${JSON.stringify(testResults, null, 2)}

Provide actual evidence for every claim. Report findings only, do not post anywhere.`,
  `On branch ${branch}, resolve these final review findings.`,
)
log(`Final review: ${finalFix.fixed.length} finding(s) fixed`)

let finalTests = testResults
if (finalFix.fixed.length) {
  finalTests = await agent(`On branch ${branch}, rerun the tests affected by the fixes just applied (or the full suite if unsure which are affected). Report pass/fail.`,
    { label: 'final-review:rerun-tests', schema: TEST_SCHEMA, agentType: 'general-purpose' })
  log(`Retest: ${finalTests.passed ? 'passed' : 'FAILED'} — ${finalTests.summary}`)
}

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
  testsPassed: finalTests.passed,
  testSummary: finalTests.summary,
  initialReviewFixes: initialFix.fixed,
  finalReviewFixes: finalFix.fixed,
}
