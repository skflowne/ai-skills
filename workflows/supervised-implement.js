export const meta = {
  name: 'supervised-implement',
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
// repoSlug/repoPath (optional) thread explicit repo context into every prompt — without them,
// agents resolve the issue and repo from cwd's default remote, which is ambiguous across multiple
// checkouts. Same contract as review-supervised, so issue-to-pr can thread them to both children.
const REPO_SLUG = ARGS.repoSlug
// The user's own checkout. Read-only: it is the source `git worktree add` clones from and the
// place gh lookups run before a worktree exists. Nothing in this run may commit, check out, or
// otherwise mutate it — see WORKTREE_PATH below, which is where agents actually work.
const REPO_PATH = ARGS.repoPath
// Base branch to cut the run's branch from. The launch skill resolves and (when ambiguous)
// confirms this; absent, setup falls back to the repo's default branch. Never the current HEAD.
const BASE_BRANCH = ARGS.baseBranch
// Explicit acknowledgement that the user's checkout has uncommitted changes and the run may
// proceed anyway. Absent, a dirty tree is refused rather than silently stashed.
const ALLOW_DIRTY_TREE = ARGS.allowDirtyTree === true

// Built per-path, not once: after setup every prompt must point agents at the run's worktree, not
// at the user's checkout. A single top-level const would keep saying "cd to REPO_PATH" for the
// whole run and silently defeat the isolation.
const repoContext = (path) => (REPO_SLUG || path)
  ? `Repo context: ${path ? `local checkout at ${path} (cd there for git operations)` : ''}${path && REPO_SLUG ? ', ' : ''}${REPO_SLUG ? `GitHub repo ${REPO_SLUG} (pass --repo ${REPO_SLUG} to every gh subcommand that accepts it — do not rely on cwd's default remote). \`gh api\` has no --repo flag and resolves the {owner}/{repo} placeholders from the cwd's remote, so spell the repo out in the path instead: repos/${REPO_SLUG}/...` : ''}.`
  : ''
// Reassigned once the run's worktree exists; every prompt after setup interpolates the new value.
let REPO_CONTEXT = repoContext(REPO_PATH)
const GH_REPO_FLAG = REPO_SLUG ? ` --repo ${REPO_SLUG}` : ''
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

// One setup agent, one schema. The first group is what the run needs from setup; the second is the
// evidence the script checks to confirm a worktree really was created and the checkout left alone.
// Nothing is required, so an agent told to stop on a dirty tree can report that instead of failing
// schema validation and retrying the abort. The script checks the fields it needs after the call.
const BRANCH_SCHEMA = {
  type: 'object',
  properties: {
    worktreePath: { type: 'string' },
    branch: { type: 'string' },
    baseBranch: { type: 'string' },
    headSha: { type: 'string' },
    // Evidence.
    repoRoot: { type: 'string' },
    repoBranchBefore: { type: 'string' },
    repoHeadBefore: { type: 'string' },
    repoHeadAfter: { type: 'string' },
    worktreePaths: { type: 'array', items: { type: 'string' } },
    worktreeBranch: { type: 'string' },
    dirtyPaths: { type: 'array', items: { type: 'string' } },
  },
  required: [],
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
// workflows/review-supervised.js. The sandbox has no imports and workflow() nesting is one
// level deep — already spent by issue-to-pr — so the shape is duplicated deliberately; propagate
// structural changes to the twin by hand.
async function requestReview(label, subject, context) {
  const review = await agent(`Act as an independent correctness reviewer for ${subject}, per the supervised-forge skill's review-gate contract. You did not write this code and have no prior context beyond this message. Inspect the actual commits/diff on the branch yourself -- do not trust the implementer's own description of what changed. Report concrete correctness, regression, and behavior findings with evidence and exact file references. Return no findings if it's clean.

${REPO_CONTEXT}

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
    const fix = await agent(`${fixPromptPrefix}

${REPO_CONTEXT}

Findings to resolve:
${JSON.stringify(findings)}

Rerun the relevant validation and commit your fixes.`,
      { label: `${label}:fix:r${round}`, agentType: 'general-purpose' })
    if (fix === null) throw new Error(`${label}: fix round ${round} failed`)
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
const resolvedIssue = await agent(`Run exactly this command and relay its result: \`gh issue view ${ISSUE_NUMBER}${GH_REPO_FLAG} --json number,title,state,url\`. If it succeeds, return found=true plus the number, title, state, and url fields verbatim. If it fails for any reason, return found=false — do not retry with different arguments, search for similarly-numbered issues, try other repos or remotes, or substitute a pull request.

${REPO_CONTEXT}`,
  { label: 'setup:resolve-issue', schema: ISSUE_RESOLVE_SCHEMA, model: 'haiku', effort: 'low' })
if (resolvedIssue === null || resolvedIssue.found !== true || resolvedIssue.number !== ISSUE_NUMBER || !resolvedIssue.title) {
  throw new Error(`Issue #${ISSUE_NUMBER} did not resolve to an exact match in this repo — stopping instead of guessing`)
}
if (resolvedIssue.state && resolvedIssue.state.toUpperCase() !== 'OPEN') {
  throw new Error(`Issue #${ISSUE_NUMBER} ("${resolvedIssue.title}") is ${resolvedIssue.state} — stopping instead of implementing a non-open issue`)
}
const ISSUE_PIN = `issue #${ISSUE_NUMBER} ("${resolvedIssue.title}")`
log(`Pinned ${ISSUE_PIN}: ${resolvedIssue.url || 'no url reported'} (${resolvedIssue.state})`)

// One agent does the setup: it needs judgment (inspect state, pick the base, clear stale
// worktrees). What it does NOT get is the final word on whether it complied — it reports the raw
// facts below and the script enforces them, so a run that quietly checked out in the user's
// checkout instead of creating a worktree fails here rather than proceeding and looking normal.
const branchResult = await agent(`Set up an isolated worktree to implement ${ISSUE_PIN}. The user's own checkout must be left exactly as you found it: never run \`git checkout\`, \`git switch\`, \`git reset\`, or \`git stash\` in it.

1. Record the starting state of the checkout and return it: \`git rev-parse --show-toplevel\` as repoRoot, \`git rev-parse --abbrev-ref HEAD\` as repoBranchBefore, \`git rev-parse HEAD\` as repoHeadBefore, and each path from \`git status --porcelain\` in dirtyPaths (empty array when clean).
2. ${ALLOW_DIRTY_TREE
  ? 'The caller has acknowledged that the tree may be dirty, so continue — but leave those changes exactly as they are.'
  : 'If dirtyPaths is not empty, STOP NOW: return what you have and create nothing. Do not stash, commit, or discard anything.'}
3. Run \`git fetch origin\`.
4. Resolve the base branch: ${BASE_BRANCH
  ? `use \`${BASE_BRANCH}\` — it was resolved and confirmed by the caller.`
  : 'determine the repository\'s default branch from `gh repo view --json defaultBranchRef`. Do NOT use the currently checked-out branch.'} Return it as baseBranch. Create from the REMOTE ref \`origin/<baseBranch>\`, never the local ref — a local branch may hold unpushed commits, which would pull unrelated work into the PR diff and give reviewers the wrong diff to review.
5. Pick a branch name like issue-${ISSUE_NUMBER}-<slug>. If it already exists from an aborted run, delete it first (\`git branch -D\`; if a stale worktree still holds it, \`git worktree list\` then \`git worktree remove --force\` before deleting).
6. Create the worktree in a fresh temp directory OUTSIDE the repository tree: \`git worktree add <temp dir> -b <branch> origin/<baseBranch>\`. Return its absolute path as worktreePath, the branch as branch, and \`git rev-parse HEAD\` run inside it as headSha.
7. Prove it: return every absolute path listed by \`git worktree list --porcelain\` in worktreePaths, \`git rev-parse --abbrev-ref HEAD\` run inside the new worktree as worktreeBranch, and the checkout's \`git rev-parse HEAD\` re-read afterwards as repoHeadAfter.

${REPO_CONTEXT}`,
  { label: 'setup:worktree', schema: BRANCH_SCHEMA, agentType: 'general-purpose' })
if (branchResult === null) throw new Error('setup:worktree agent failed — no worktree to implement in')

const DIRTY_PATHS = branchResult.dirtyPaths || []
// The script decides this, not the agent: stashing mutates state the user did not offer, and a run
// that silently tidies the tree is worse than one that stops.
if (DIRTY_PATHS.length && !ALLOW_DIRTY_TREE) {
  throw new Error(`The checkout at ${branchResult.repoRoot || REPO_PATH || 'cwd'} has uncommitted changes — refusing to run rather than stashing them. Commit, stash, or discard them yourself, or pass allowDirtyTree: true to proceed and leave them untouched. Dirty paths: ${DIRTY_PATHS.join(', ')}`)
}

const { branch, headSha: baseSha, worktreePath: WORKTREE_PATH } = branchResult
if (!WORKTREE_PATH) throw new Error('setup:worktree returned no worktree path — refusing to fall back to the user\'s checkout')
// baseSha anchors every parallel chain (`git worktree add -b <chain> ${baseSha}`) and the
// integration cherry-pick ranges, so an absent one would silently corrupt those commands.
if (!branch || !baseSha) throw new Error(`setup:worktree returned an incomplete result (branch=${JSON.stringify(branch)}, headSha=${JSON.stringify(baseSha)}) — cannot anchor milestone chains`)

// Enforcement. Each check below is the difference between "the agent was asked to isolate" and
// "the run is isolated": without them a setup that did a plain checkout still reads as success.
const reportedWorktrees = branchResult.worktreePaths || []
if (!reportedWorktrees.includes(WORKTREE_PATH)) {
  throw new Error(`setup:worktree reported ${WORKTREE_PATH} but \`git worktree list\` does not contain it (${reportedWorktrees.join(', ') || 'no worktrees listed'}) — the run is not isolated, refusing to continue`)
}
// A "worktree" inside the repo would put the run's commits and build output in the user's tree,
// which is most of what isolation is meant to prevent.
const repoRoot = branchResult.repoRoot || REPO_PATH
if (repoRoot && (WORKTREE_PATH === repoRoot || WORKTREE_PATH.startsWith(`${repoRoot}/`))) {
  throw new Error(`Worktree ${WORKTREE_PATH} is inside the checkout at ${repoRoot} — it must live outside the repository tree, refusing to continue`)
}
if (branchResult.worktreeBranch && branchResult.worktreeBranch !== branch) {
  throw new Error(`Worktree at ${WORKTREE_PATH} has ${branchResult.worktreeBranch} checked out, not ${branch} — refusing to implement on the wrong branch`)
}
// The whole promise of the change: the user's HEAD is where they left it.
if (branchResult.repoHeadBefore && branchResult.repoHeadAfter && branchResult.repoHeadBefore !== branchResult.repoHeadAfter) {
  throw new Error(`Setup moved the checkout's HEAD from ${branchResult.repoHeadBefore} to ${branchResult.repoHeadAfter} — it must be left untouched. Restore it with \`git checkout ${branchResult.repoBranchBefore || branchResult.repoHeadBefore}\` before rerunning`)
}

// Everything past this point works in the worktree, so every later prompt must say so.
REPO_CONTEXT = repoContext(WORKTREE_PATH)
log(`Worktree verified: ${WORKTREE_PATH} on ${branch} at ${baseSha}, cut from origin/${branchResult.baseBranch || BASE_BRANCH || 'default'}; checkout left on ${branchResult.repoBranchBefore || 'its original branch'} at ${branchResult.repoHeadBefore || 'its original HEAD'}`)
if (DIRTY_PATHS.length) {
  log(`Note: ${DIRTY_PATHS.length} uncommitted change(s) in the checkout are left untouched and are NOT part of ${branch}: ${DIRTY_PATHS.join(', ')}`)
}

phase('Plan')
const plan = await agent(`Fetch issue #${ISSUE_NUMBER} from this repository yourself; it is already pinned to the title "${resolvedIssue.title}" — if gh reports a different number or title, stop and report the mismatch instead of proceeding or substituting another issue. Inspect the repository and record an explicit plan of cohesive, preferably vertical milestones to implement it, per the supervised-forge skill. For each milestone, decide needsReviewGate: true for any cohesive user-visible slice or change to behavior, an API, schema, IPC boundary, persistence format, lifecycle, concurrency, process, or security-relevant contract; false only for purely mechanical, non-behavior-bearing changes (docs, formatting, generated artifacts, trivial config) where a review gate is unnecessary. Also decide independent: true only when implementing the milestone will not touch any file or concern that any other milestone touches — independent milestones are implemented in parallel from the same base and then merged, so vertical milestones that build on one another are never independent; when in doubt use independent=false. Do not post the plan to the issue. Return the milestone list only — do not implement anything yet.

${REPO_CONTEXT}`,
  { label: 'plan', model: 'opus', schema: PLAN_SCHEMA, agentType: 'general-purpose' })
if (plan === null) throw new Error('plan agent failed — no milestones to implement')
const { milestones } = plan
log(`Plan: ${milestones.length} milestone(s) — ${milestones.map(m => `${m.title}${m.needsReviewGate ? '' : ' (no gate)'}${m.independent ? ' (independent)' : ''}`).join(', ')}`)

// Serial milestone: implement and gate directly on the branch in the run's worktree.
async function runSerialMilestone(tag, milestone, total) {
  const impl = await agent(`On branch ${branch}, implement milestone ${tag}/${total}: "${milestone.title}".

${REPO_CONTEXT}

Description: ${milestone.description}

Implement it as the sole author -- the smallest complete change for this milestone. Run the tests, lint, typecheck, and other validation relevant to this milestone. Commit your work with a message starting "${tag}: ${milestone.title}". Return the commit sha, a concise summary, and the raw, verbatim validation command output (commands run and their output).`,
    { label: `${tag}:implement`, schema: IMPLEMENT_SCHEMA, agentType: 'general-purpose' })
  if (impl === null) throw new Error(`Milestone ${tag} implementation failed`)
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
  const impl = await agent(`Implement milestone ${tag}/${total}: "${milestone.title}" for issue #${ISSUE_NUMBER}. Other milestones are being implemented in parallel, so do not touch branch ${branch} or this run's worktree at ${WORKTREE_PATH}: run \`git worktree add <fresh temp dir> -b ${chainBranch} ${baseSha}\` and do all work inside that worktree. If ${chainBranch} is left over from an aborted run, delete it first (\`git branch -D ${chainBranch}\`; if that fails because a stale worktree still has it checked out, find it with \`git worktree list\`, \`git worktree remove --force\` it, then delete the branch). If a git command fails with a lock (index.lock) error, another parallel agent is mid-operation — wait a moment and retry.

${REPO_CONTEXT}

Description: ${milestone.description}

Implement it as the sole author -- the smallest complete change for this milestone. Run whatever validation is feasible inside the worktree (set up dependencies there if the project needs them); full validation runs again at integration. Commit your work with a message starting "${tag}: ${milestone.title}", then run \`git worktree remove --force <that dir>\` (the branch and its commits survive) and return the commit sha, a concise summary, and the raw, verbatim validation command output (commands run and their output).`,
    { label: `${tag}:implement`, schema: IMPLEMENT_SCHEMA, agentType: 'general-purpose' })
  if (impl === null) throw new Error(`Milestone ${tag} implementation failed`)
  log(`${tag} implemented on ${chainBranch}: ${impl.summary} (${impl.commitSha})`)

  if (milestone.needsReviewGate) {
    const gate = await runReviewGate(
      tag,
      `milestone ${tag} ("${milestone.title}") on temp branch ${chainBranch} (parallel chain for issue #${ISSUE_NUMBER})`,
      `The chain's commits live on branch ${chainBranch}, based on ${baseSha}. Inspect them read-only from the run's worktree at ${WORKTREE_PATH} (e.g. git log/diff ${baseSha}..${chainBranch}) — do not check that branch out.

Milestone description: ${milestone.description}

Raw validation output from the implementer:
${impl.validationOutput}`,
      `Resolve these independent-reviewer findings for milestone ${tag} ("${milestone.title}") on temp branch ${chainBranch}. Other milestones are being implemented in parallel, so do not touch this run's worktree at ${WORKTREE_PATH}: run \`git worktree add <fresh temp dir> ${chainBranch}\` (if that fails because ${chainBranch} is checked out in a stale worktree from an earlier failed attempt, \`git worktree list\` and \`git worktree remove --force\` the stale one first; on a git lock error, another parallel agent is mid-operation — wait a moment and retry), do all work inside that worktree, and run \`git worktree remove --force <that dir>\` after committing.`,
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

  const integrated = await agent(`On branch ${branch} (checked out in the run's worktree at ${WORKTREE_PATH}), integrate these parallel milestone chains by cherry-picking each chain's range onto ${branch}, in the order listed:
${chains.map(chain => `- ${chain.tag} "${chain.milestone.title}": git cherry-pick ${baseSha}..${chain.chainBranch}`).join('\n')}

${REPO_CONTEXT}

The chains were all built from ${baseSha} against concerns the plan judged disjoint, so conflicts should be rare; resolve any that appear in the spirit of the milestone descriptions rather than aborting:
${chains.map(chain => `- ${chain.tag}: ${chain.milestone.description}`).join('\n')}

After integrating, run the project's relevant validation (tests, lint, typecheck as applicable) on ${branch}. Do not push. Delete the temp chain branches (git branch -D) only after validation passes — they are the only copy of each chain's work until then. If a cherry-pick proves impossible or validation fails, leave the chain branches in place and restore the branch before returning: \`git cherry-pick --abort\` if one is in progress, then \`git reset --hard ${baseSha}\`, and return success=false with the reason.`,
    // Cross-chain conflict resolution plus full validation — worth a strong tier, but not the
    // session default. (codex routes `*:integrate` to the same tier its opus alias maps to.)
    { label: 'milestones:integrate', model: 'opus', schema: INTEGRATE_SCHEMA, agentType: 'general-purpose' })
  if (integrated === null || !integrated.success) throw new Error(`Parallel milestone integration failed${integrated ? `: ${integrated.summary}` : ''}`)
  log(`Integrated ${parallelEntries.length} parallel chain(s) onto ${branch}: ${integrated.summary}`)
}

for (const entry of serialEntries) {
  await runSerialMilestone(entry.tag, entry.milestone, milestones.length)
}

phase('Finish')
async function runFinishValidation(label) {
  const result = await agent(`On branch ${branch}, run the full relevant test suite plus any required lint, typecheck, and build checks for this project (discover the correct commands from the repo, e.g. package.json scripts). If none apply (e.g. a docs/config-only repo), say so explicitly rather than fabricating a pass. Report whether everything passed and include failure details if not.

${REPO_CONTEXT}`,
    { label, schema: TEST_SCHEMA, agentType: 'general-purpose' })
  if (result === null) throw new Error(`${label} agent failed — cannot establish the branch's validation state`)
  return result
}

let finalTests = await runFinishValidation('finish:tests')
log(`Finish validation: ${finalTests.passed ? 'passed' : 'FAILED'} — ${finalTests.summary}`)
// A failed suite is residual risk, not a dead end: the final review gate sees the failures as
// findings and its fix rounds get a shot at repairing them, mirroring how milestone gates proceed.
// The PR then ships with testsPassed reflecting the real final state for the caller to act on
// (issue-to-pr warns and hands the PR straight to the review-fix loop).
if (!finalTests.passed) {
  log(`Proceeding to the final review gate with residual risk — failures: ${finalTests.failures.join('; ')}`)
}

const finalGate = await runReviewGate(
  'finish',
  `the complete branch ${branch} against its base ${baseSha} (all milestones together, e.g. git diff ${baseSha}..HEAD)`,
  `Milestones implemented: ${milestones.map(m => m.title).join(', ')}

Final validation output:
${finalTests.summary}${finalTests.passed ? '' : `

Validation FAILED — treat these failures as findings to report unless the branch state proves them resolved: ${finalTests.failures.join('; ')}`}`,
  `On branch ${branch}, resolve these final-review findings covering the complete change.`,
)
log(`Finish review gate: ${finalGate.openFindings.length ? `left ${finalGate.openFindings.length} open finding(s)` : 'clean'} after ${finalGate.fixRounds} fix round(s)`)

// The gate's fix rounds may have repaired the failing suite — refresh the verdict so the returned
// testsPassed describes what actually ships.
if (!finalTests.passed && finalGate.fixRounds > 0) {
  finalTests = await runFinishValidation('finish:tests:recheck')
  log(`Finish validation recheck: ${finalTests.passed ? 'passed' : 'still FAILED'} — ${finalTests.summary}`)
}

phase('Ship')
const shipped = await agent(`On branch ${branch}, push it and open a PR for ${ISSUE_PIN} (reference/close that exact issue in the PR body). If an open PR already exists for this branch (e.g. from an earlier aborted run), reuse it — return its number and URL instead of creating a duplicate. If PR creation tooling is unavailable, say so explicitly instead of guessing. Return the PR number and URL.

${REPO_CONTEXT}`,
  {
    label: 'ship:pr',
    schema: { type: 'object', properties: { prNumber: { type: 'number' }, url: { type: 'string' } }, required: ['prNumber', 'url'] },
    agentType: 'general-purpose',
  })
if (shipped === null) throw new Error('ship:pr agent failed — branch is implemented but no PR was opened')
log(`PR #${shipped.prNumber} opened: ${shipped.url}`)

// Teardown runs only here, on the success path, and only after the branch is pushed — the commits
// live on the remote by now, so removing the worktree loses nothing. Deliberately NOT in a
// finally/catch: on failure the worktree is the only copy of the run's work, so it stays put and
// its path is reported for triage.
const cleaned = await agent(`Run \`git worktree remove --force ${WORKTREE_PATH}\` from the checkout at ${REPO_PATH || 'the repository root'}. The branch ${branch} and its commits must survive — only the worktree directory goes away. Do not delete the branch. Do not check out, reset, or otherwise modify the checkout you run this from. Report whether the removal succeeded.

${repoContext(REPO_PATH)}`,
  {
    label: 'ship:cleanup',
    schema: { type: 'object', properties: { removed: { type: 'boolean' }, detail: { type: 'string' } }, required: ['removed'] },
    model: 'haiku',
    effort: 'low',
  })
// A stranded worktree is untidy, not a failed run: the PR is already open. Surface the path so it
// can be cleaned up by hand rather than failing a run whose actual work succeeded.
if (cleaned === null || !cleaned.removed) {
  log(`Worktree at ${WORKTREE_PATH} could not be removed — remove it manually with \`git worktree remove --force ${WORKTREE_PATH}\`${cleaned?.detail ? ` (${cleaned.detail})` : ''}`)
} else {
  log(`Worktree removed: ${WORKTREE_PATH} (branch ${branch} untouched)`)
}

return {
  branch,
  worktreePath: cleaned?.removed ? null : WORKTREE_PATH,
  prNumber: shipped.prNumber,
  prUrl: shipped.url,
  testsPassed: finalTests.passed,
  testSummary: finalTests.summary,
  implementationProcess: 'supervised-forge',
  milestoneCount: milestones.length,
  openFindings: finalGate.openFindings,
}
