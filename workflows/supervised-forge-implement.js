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
const ARGS = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { throw new Error('args arrived as a string that is not valid JSON') } })()
  : args
if (ARGS == null || typeof ARGS !== 'object') throw new Error('args must be an object like { issueNumber: 123 }')
// Exact integer, or an all-digits string from a harness that stringifies numbers. Anything else
// fails here — no agent gets to guess which issue was meant.
const ISSUE_NUMBER = typeof ARGS.issueNumber === 'string' && /^[0-9]+$/.test(ARGS.issueNumber) ? Number(ARGS.issueNumber) : ARGS.issueNumber
if (!Number.isInteger(ISSUE_NUMBER) || ISSUE_NUMBER < 1) throw new Error(`issueNumber must be a positive integer (got ${JSON.stringify(ARGS.issueNumber)})`)

// supervised-forge's contract is one persistent implementer paired with one persistent
// independent reviewer it spawns and consults via subagent_wait. A Workflow agent() call cannot
// spawn a further subagent of its own, so that mechanic can't run inside a single agent() call --
// asking one agent to "follow the supervised-forge skill" silently degrades to self-review. Instead
// this script plays the role of the primary: it drives the milestone loop itself, dispatching a
// genuinely separate, independent agent() for each review gate.
const MAX_FIX_ROUNDS_PER_GATE = 2

const ISSUE_RESOLVE_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    number: { type: 'number' },
    title: { type: 'string' },
    state: { type: 'string' },
    url: { type: 'string' },
  },
  required: ['found'],
}

const BRANCH_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    headSha: { type: 'string' },
  },
  required: ['branch', 'headSha'],
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
          // True only when the milestone shares no file/concern with any other milestone — it
          // gates whether the milestone is implemented in a parallel worktree chain.
          independent: { type: 'boolean' },
        },
        required: ['title', 'description', 'needsReviewGate', 'independent'],
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

const INTEGRATE_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['success', 'summary'],
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

// The review-gate and serial/parallel milestone helpers below are mirrored (with issue-implement
// -specific contracts: milestone descriptions, no commit-sha tracking) in
// workflows/review-fix-loop-lite.js. The sandbox has no imports and workflow() nesting is one
// level deep — already spent by issue-to-pr — so the shape is duplicated deliberately; propagate
// structural changes to the twin by hand.
async function requestReview(label, subject, context) {
  const review = await agent(`Act as an independent correctness reviewer for ${subject}, per the supervised-forge skill's review-gate contract. You did not write this code and have no prior context beyond this message. Inspect the actual commits/diff on the branch yourself -- do not trust the implementer's own description of what changed. Report concrete correctness, regression, and behavior findings with evidence and exact file references. Return no findings if it's clean.

${context}`,
    { label: `${label}:review`, model: 'opus', schema: FINDINGS_SCHEMA, agentType: 'general-purpose' })
  if (review === null) throw new Error(`${label}: review-gate reviewer failed`)
  return review.findings
}

// Each review pass returns fresh finding objects that can't be identity-matched to the previous
// pass's, so a per-finding "fixed" count would count anything still open twice. The gate therefore
// reports fix rounds run + findings still open.
async function runReviewGate(label, subject, context, fixPromptPrefix) {
  let findings = actionable(await requestReview(label, subject, context))
  let round = 0
  while (findings.length && round < MAX_FIX_ROUNDS_PER_GATE) {
    round++
    await agent(`${fixPromptPrefix}

Findings to resolve:
${JSON.stringify(findings)}

Rerun the relevant validation and commit your fixes.`,
      { label: `${label}:fix:r${round}`, agentType: 'general-purpose' })
    findings = actionable(await requestReview(`${label}:r${round}`, subject, `${context}

Fix round ${round} has since committed fixes for earlier findings on top — review the current state including those fix-up commits, not just any originally-cited commit.`))
  }
  if (findings.length) {
    log(`${subject}: ${findings.length} finding(s) still open after ${round} fix round(s) — proceeding with residual risk`)
  }
  return { fixRounds: round, openFindings: findings }
}

phase('Setup')
// Pin issue #N to an exact match in this repo before anything runs — a mistyped number fails fast
// here instead of a later agent guessing at a similarly-numbered issue, a PR, or another repo.
// Later agents cross-check against this pin rather than re-resolving with room to guess.
//
// The sandbox cannot exec, so the script can't run `gh issue view` itself — a relay agent is the
// only way to touch gh from here. Its job is strictly mechanical: run exactly one command, return
// the fields verbatim. All judgment stays in the script — number equality, title presence, and
// the OPEN check below decide whether the run proceeds, so a wrong or hallucinated relay cannot
// steer the workflow onto a different issue.
const resolvedIssue = await agent(`Run exactly this command and relay its result: \`gh issue view ${ISSUE_NUMBER} --json number,title,state,url\`. If it succeeds, return found=true plus the number, title, state, and url fields verbatim. If it fails for any reason, return found=false — do not retry with different arguments, search for similarly-numbered issues, try other repos or remotes, or substitute a pull request.`,
  { label: 'setup:resolve-issue', schema: ISSUE_RESOLVE_SCHEMA, model: 'haiku', effort: 'low' })
if (resolvedIssue === null || resolvedIssue.found !== true || resolvedIssue.number !== ISSUE_NUMBER || !resolvedIssue.title) {
  throw new Error(`Issue #${ISSUE_NUMBER} did not resolve to an exact match in this repo — stopping instead of guessing`)
}
if (resolvedIssue.state && resolvedIssue.state.toUpperCase() !== 'OPEN') {
  throw new Error(`Issue #${ISSUE_NUMBER} ("${resolvedIssue.title}") is ${resolvedIssue.state} — stopping instead of implementing a non-open issue`)
}
const ISSUE_PIN = `issue #${ISSUE_NUMBER} ("${resolvedIssue.title}")`
log(`Pinned ${ISSUE_PIN}: ${resolvedIssue.url || 'no url reported'} (${resolvedIssue.state})`)

const { branch, headSha: baseSha } = await agent(`Create and check out a new branch for ${ISSUE_PIN} off an up-to-date default branch (name it something like issue-${ISSUE_NUMBER}-<slug>). Do not discard any unrelated uncommitted changes already in the working tree — stash them first if present and note that you did. Return the branch name and the sha of its HEAD.`,
  { label: 'setup:branch', schema: BRANCH_SCHEMA, agentType: 'general-purpose' })
log(`Branch ready: ${branch} at ${baseSha}`)

phase('Plan')
const { milestones } = await agent(`Fetch issue #${ISSUE_NUMBER} from this repository yourself; it is already pinned to the title "${resolvedIssue.title}" — if gh reports a different number or title, stop and report the mismatch instead of proceeding or substituting another issue. Inspect the repository and record an explicit plan of cohesive, preferably vertical milestones to implement it, per the supervised-forge skill. For each milestone, decide needsReviewGate: true for any cohesive user-visible slice or change to behavior, an API, schema, IPC boundary, persistence format, lifecycle, concurrency, process, or security-relevant contract; false only for purely mechanical, non-behavior-bearing changes (docs, formatting, generated artifacts, trivial config) where a review gate is unnecessary. Also decide independent: true only when implementing the milestone will not touch any file or concern that any other milestone touches — independent milestones are implemented in parallel from the same base and then merged, so vertical milestones that build on one another are never independent; when in doubt use independent=false. Do not post the plan to the issue. Return the milestone list only — do not implement anything yet.`,
  { label: 'plan', model: 'opus', schema: PLAN_SCHEMA, agentType: 'general-purpose' })
log(`Plan: ${milestones.length} milestone(s) — ${milestones.map(m => `${m.title}${m.needsReviewGate ? '' : ' (no gate)'}${m.independent ? ' (independent)' : ''}`).join(', ')}`)

// Serial milestone: implement and gate directly on the branch in the main checkout.
async function runSerialMilestone(tag, milestone, total) {
  const impl = await agent(`On branch ${branch}, implement milestone ${tag}/${total}: "${milestone.title}".

Description: ${milestone.description}

Implement it as the sole author -- the smallest complete change for this milestone. Run the tests, lint, typecheck, and other validation relevant to this milestone. Commit your work with a message starting "${tag}: ${milestone.title}". Return the commit sha, a concise summary, and the raw, verbatim validation command output (commands run and their output).`,
    { label: `${tag}:implement`, schema: IMPLEMENT_SCHEMA, agentType: 'general-purpose' })
  log(`${tag} implemented: ${impl.summary} (${impl.commitSha})`)

  if (!milestone.needsReviewGate) {
    log(`${tag}: no review gate needed (purely mechanical) — deterministic validation only`)
    return
  }

  const gate = await runReviewGate(
    tag,
    `milestone ${tag} ("${milestone.title}") on branch ${branch}, commit ${impl.commitSha} plus any fix-up commits on top of it`,
    `Milestone description: ${milestone.description}

Raw validation output from the implementer:
${impl.validationOutput}`,
    `On branch ${branch}, resolve these independent-reviewer findings for milestone ${tag} ("${milestone.title}").`,
  )
  log(`${tag}: review gate ${gate.openFindings.length ? `left ${gate.openFindings.length} open finding(s)` : 'clean'} after ${gate.fixRounds} fix round(s)`)
}

// Parallel milestone: the whole implement + review-gate chain runs on its own temp branch in a git
// worktree the agents create with plain git commands (portable across harnesses). The chain's
// commits are cherry-picked onto the branch by the integration agent afterwards.
async function runParallelMilestone(tag, milestone, total) {
  const chainBranch = `sf/issue-${ISSUE_NUMBER}/${tag}`
  const impl = await agent(`Implement milestone ${tag}/${total}: "${milestone.title}" for issue #${ISSUE_NUMBER}. Other milestones are being implemented in parallel, so do not touch branch ${branch} or the main checkout's working tree: run \`git worktree add <fresh temp dir> -b ${chainBranch} ${baseSha}\` and do all work inside that worktree. If ${chainBranch} is left over from an aborted run, delete it first (\`git branch -D ${chainBranch}\`; if that fails because a stale worktree still has it checked out, find it with \`git worktree list\`, \`git worktree remove --force\` it, then delete the branch). If a git command fails with a lock (index.lock) error, another parallel agent is mid-operation — wait a moment and retry.

Description: ${milestone.description}

Implement it as the sole author -- the smallest complete change for this milestone. Run whatever validation is feasible inside the worktree (set up dependencies there if the project needs them); full validation runs again at integration. Commit your work with a message starting "${tag}: ${milestone.title}", then run \`git worktree remove --force <that dir>\` (the branch and its commits survive) and return the commit sha, a concise summary, and the raw, verbatim validation command output (commands run and their output).`,
    { label: `${tag}:implement`, schema: IMPLEMENT_SCHEMA, agentType: 'general-purpose' })
  log(`${tag} implemented on ${chainBranch}: ${impl.summary} (${impl.commitSha})`)

  if (milestone.needsReviewGate) {
    const gate = await runReviewGate(
      tag,
      `milestone ${tag} ("${milestone.title}") on temp branch ${chainBranch} (parallel chain for issue #${ISSUE_NUMBER})`,
      `The chain's commits live on branch ${chainBranch}, based on ${baseSha}. Inspect them read-only from the main checkout (e.g. git log/diff ${baseSha}..${chainBranch}) — do not check that branch out.

Milestone description: ${milestone.description}

Raw validation output from the implementer:
${impl.validationOutput}`,
      `Resolve these independent-reviewer findings for milestone ${tag} ("${milestone.title}") on temp branch ${chainBranch}. Other milestones are being implemented in parallel, so do not touch the main checkout's working tree: run \`git worktree add <fresh temp dir> ${chainBranch}\` (if that fails because ${chainBranch} is checked out in a stale worktree from an earlier failed attempt, \`git worktree list\` and \`git worktree remove --force\` the stale one first; on a git lock error, another parallel agent is mid-operation — wait a moment and retry), do all work inside that worktree, and run \`git worktree remove --force <that dir>\` after committing.`,
    )
    log(`${tag}: review gate ${gate.openFindings.length ? `left ${gate.openFindings.length} open finding(s)` : 'clean'} after ${gate.fixRounds} fix round(s)`)
  } else {
    log(`${tag}: no review gate needed (purely mechanical) — deterministic validation only`)
  }
  return { tag, milestone, chainBranch }
}

phase('Milestones')
const entries = milestones.map((milestone, index) => ({ milestone, tag: `M${index + 1}` }))
const parallelEntries = entries.filter(entry => entry.milestone.independent)
// One independent milestone gains nothing from worktree indirection — parallelism needs two.
const runInParallel = parallelEntries.length >= 2
const serialEntries = runInParallel ? entries.filter(entry => !entry.milestone.independent) : entries
if (runInParallel) log(`Running ${parallelEntries.length} independent milestone(s) in parallel worktree chains, ${serialEntries.length} serial`)

// Independent chains all start from baseSha and share nothing with the other milestones, so they
// run and integrate first; the serial (order-dependent) milestones then build on top as usual.
if (runInParallel) {
  const chains = await parallel(parallelEntries.map(entry => () => runParallelMilestone(entry.tag, entry.milestone, milestones.length)))
  if (chains.some(chain => chain === null)) throw new Error('A parallel milestone chain failed')

  const integrated = await agent(`On branch ${branch} (the main checkout), integrate these parallel milestone chains by cherry-picking each chain's range onto ${branch}, in the order listed:
${chains.map(chain => `- ${chain.tag} "${chain.milestone.title}": git cherry-pick ${baseSha}..${chain.chainBranch}`).join('\n')}

The chains were all built from ${baseSha} against concerns the plan judged disjoint, so conflicts should be rare; resolve any that appear in the spirit of the milestone descriptions rather than aborting:
${chains.map(chain => `- ${chain.tag}: ${chain.milestone.description}`).join('\n')}

After integrating, run the project's relevant validation (tests, lint, typecheck as applicable) on ${branch}. Do not push. Delete the temp chain branches (git branch -D) only after validation passes — they are the only copy of each chain's work until then. If a cherry-pick proves impossible or validation fails, leave the chain branches in place and restore the branch before returning: \`git cherry-pick --abort\` if one is in progress, then \`git reset --hard ${baseSha}\`, and return success=false with the reason.`,
    // Cross-chain conflict resolution plus full validation — worth a strong tier, but not the
    // session default. (codex routes `*:integrate` to the same tier its opus alias maps to.)
    { label: 'milestones:integrate', model: 'opus', schema: INTEGRATE_SCHEMA, agentType: 'general-purpose' })
  if (!integrated.success) throw new Error(`Parallel milestone integration failed: ${integrated.summary}`)
  log(`Integrated ${parallelEntries.length} parallel chain(s) onto ${branch}: ${integrated.summary}`)
}

for (const entry of serialEntries) {
  await runSerialMilestone(entry.tag, entry.milestone, milestones.length)
}

phase('Finish')
const finalTests = await agent(`On branch ${branch}, run the full relevant test suite plus any required lint, typecheck, and build checks for this project (discover the correct commands from the repo, e.g. package.json scripts). If none apply (e.g. a docs/config-only repo), say so explicitly rather than fabricating a pass. Report whether everything passed and include failure details if not.`,
  { label: 'finish:tests', schema: TEST_SCHEMA, agentType: 'general-purpose' })
log(`Finish validation: ${finalTests.passed ? 'passed' : 'FAILED'} — ${finalTests.summary}`)
if (!finalTests.passed) throw new Error(`Finish validation failed: ${finalTests.failures.join('; ')}`)

const finalGate = await runReviewGate(
  'finish',
  `the complete branch ${branch} against its base ${baseSha} (all milestones together, e.g. git diff ${baseSha}..HEAD)`,
  `Milestones implemented: ${milestones.map(m => m.title).join(', ')}

Final validation output:
${finalTests.summary}`,
  `On branch ${branch}, resolve these final-review findings covering the complete change.`,
)
log(`Finish review gate: ${finalGate.openFindings.length ? `left ${finalGate.openFindings.length} open finding(s)` : 'clean'} after ${finalGate.fixRounds} fix round(s)`)

phase('Ship')
const shipped = await agent(`On branch ${branch}, push it and open a PR for ${ISSUE_PIN} (reference/close that exact issue in the PR body). If PR creation tooling is unavailable, say so explicitly instead of guessing. Return the PR number and URL.`,
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
