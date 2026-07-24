export const meta = {
  name: 'supervised-forge-implement',
  description: 'Implement a GitHub issue end to end with Supervised Forge (script-driven milestone review gates) and open a PR',
  phases: [
    { title: 'Setup' },
    { title: 'Plan' },
    { title: 'Milestones' },
    { title: 'Finish' },
    { title: 'Ship' },
  ],
}

// Some harnesses hand `args` through as a JSON-encoded string rather than the parsed object.
const ARGS = typeof args === 'string' ? JSON.parse(args) : args
const ISSUE_NUMBER = ARGS.issueNumber

// supervised-forge's contract is one persistent implementer paired with one persistent
// independent reviewer it spawns and consults via subagent_wait. A Workflow agent() call cannot
// spawn a further subagent of its own, so that mechanic can't run inside a single agent() call --
// asking one agent to "follow the supervised-forge skill" silently degrades to self-review. Instead
// this script plays the role of the primary: it drives the milestone loop itself, dispatching a
// genuinely separate, independent agent() for each review gate.
const MAX_FIX_ROUNDS_PER_GATE = 2

const BRANCH_SCHEMA = {
  type: 'object',
  properties: { branch: { type: 'string' } },
  required: ['branch'],
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    milestones: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          needsReviewGate: { type: 'boolean' },
        },
        required: ['title', 'description', 'needsReviewGate'],
      },
    },
  },
  required: ['milestones'],
}

const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    commitSha: { type: 'string' },
    summary: { type: 'string' },
    validationOutput: { type: 'string' },
  },
  required: ['commitSha', 'summary', 'validationOutput'],
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

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    summary: { type: 'string' },
    failures: { type: 'array', items: { type: 'string' } },
  },
  required: ['passed', 'summary', 'failures'],
}

function actionable(findings) {
  return findings.filter(f => f.severity !== 'nit')
}

async function requestReview(label, subject, context) {
  const review = await agent(`Act as an independent correctness reviewer for ${subject}, per the supervised-forge skill's review-gate contract. You did not write this code and have no prior context beyond this message. Inspect the actual commits/diff on the branch yourself -- do not trust the implementer's own description of what changed. Report concrete correctness, regression, and behavior findings with evidence and exact file references. Return no findings if it's clean.

${context}`,
    { label: `${label}:review`, model: 'opus', schema: FINDINGS_SCHEMA, agentType: 'general-purpose' })
  return review.findings
}

async function runReviewGate(label, subject, context, fixPromptPrefix) {
  let findings = actionable(await requestReview(label, subject, context))
  const allFixed = []
  let round = 0
  while (findings.length && round < MAX_FIX_ROUNDS_PER_GATE) {
    round++
    await agent(`${fixPromptPrefix}

Findings to resolve:
${JSON.stringify(findings, null, 2)}

Rerun the relevant validation and commit your fixes.`,
      { label: `${label}:fix:r${round}`, agentType: 'general-purpose' })
    allFixed.push(...findings)
    findings = actionable(await requestReview(`${label}:r${round}`, subject, context))
  }
  if (findings.length) {
    log(`${subject}: ${findings.length} finding(s) still open after ${round} fix round(s) — proceeding with residual risk`)
  }
  return { fixed: allFixed, openFindings: findings }
}

phase('Setup')
const { branch } = await agent(`Fetch issue #${ISSUE_NUMBER} yourself. Create and check out a new branch for it off an up-to-date default branch (name it something like issue-${ISSUE_NUMBER}-<slug>). Do not discard any unrelated uncommitted changes already in the working tree — stash them first if present and note that you did. Return the branch name.`,
  { label: 'setup:branch', schema: BRANCH_SCHEMA, agentType: 'general-purpose' })
log(`Branch ready: ${branch}`)

phase('Plan')
const { milestones } = await agent(`Fetch issue #${ISSUE_NUMBER} yourself. Inspect the repository and record an explicit plan of cohesive, preferably vertical milestones to implement it, per the supervised-forge skill. For each milestone, decide needsReviewGate: true for any cohesive user-visible slice or change to behavior, an API, schema, IPC boundary, persistence format, lifecycle, concurrency, process, or security-relevant contract; false only for purely mechanical, non-behavior-bearing changes (docs, formatting, generated artifacts, trivial config) where a review gate is unnecessary. Do not post the plan to the issue. Return the milestone list only — do not implement anything yet.`,
  { label: 'plan', model: 'opus', schema: PLAN_SCHEMA, agentType: 'general-purpose' })
log(`Plan: ${milestones.length} milestone(s) — ${milestones.map(m => `${m.title}${m.needsReviewGate ? '' : ' (no gate)'}`).join(', ')}`)

phase('Milestones')
const commits = []
for (const [index, milestone] of milestones.entries()) {
  const tag = `M${index + 1}`
  const impl = await agent(`On branch ${branch}, implement milestone ${tag}/${milestones.length}: "${milestone.title}".

Description: ${milestone.description}

Implement it as the sole author -- the smallest complete change for this milestone. Run the tests, lint, typecheck, and other validation relevant to this milestone. Commit your work with a message starting "${tag}: ${milestone.title}". Return the commit sha, a concise summary, and the raw, verbatim validation command output (commands run and their output).`,
    { label: `${tag}:implement`, schema: IMPLEMENT_SCHEMA, agentType: 'general-purpose' })
  commits.push(impl.commitSha)
  log(`${tag} implemented: ${impl.summary} (${impl.commitSha})`)

  if (!milestone.needsReviewGate) {
    log(`${tag}: no review gate needed (purely mechanical) — deterministic validation only`)
    continue
  }

  const gate = await runReviewGate(
    tag,
    `milestone ${tag} ("${milestone.title}") on branch ${branch}, commit ${impl.commitSha}`,
    `Milestone description: ${milestone.description}

Raw validation output from the implementer:
${impl.validationOutput}`,
    `On branch ${branch}, resolve these independent-reviewer findings for milestone ${tag} ("${milestone.title}").`,
  )
  log(`${tag}: review gate ${gate.openFindings.length ? `left ${gate.openFindings.length} open finding(s)` : 'clean'} (${gate.fixed.length} fixed)`)
}

phase('Finish')
const finalTests = await agent(`On branch ${branch}, run the full relevant test suite plus any required lint, typecheck, and build checks for this project (discover the correct commands from the repo, e.g. package.json scripts). If none apply (e.g. a docs/config-only repo), say so explicitly rather than fabricating a pass. Report whether everything passed and include failure details if not.`,
  { label: 'finish:tests', schema: TEST_SCHEMA, agentType: 'general-purpose' })
log(`Finish validation: ${finalTests.passed ? 'passed' : 'FAILED'} — ${finalTests.summary}`)
if (!finalTests.passed) throw new Error(`Finish validation failed: ${finalTests.failures.join('; ')}`)

const finalGate = await runReviewGate(
  'finish',
  `the complete branch ${branch} against its base ref (all milestones together)`,
  `Milestones implemented: ${milestones.map(m => m.title).join(', ')}

Final validation output:
${finalTests.summary}`,
  `On branch ${branch}, resolve these final-review findings covering the complete change.`,
)
log(`Finish review gate: ${finalGate.openFindings.length ? `left ${finalGate.openFindings.length} open finding(s)` : 'clean'} (${finalGate.fixed.length} fixed)`)

phase('Ship')
const shipped = await agent(`On branch ${branch}, push it and open a PR for issue #${ISSUE_NUMBER} (reference/close the issue in the PR body). If PR creation tooling is unavailable, say so explicitly instead of guessing. Return the PR number and URL.`,
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
  implementationProcess: 'supervised-forge',
  milestoneCount: milestones.length,
  openFindings: finalGate.openFindings,
}
