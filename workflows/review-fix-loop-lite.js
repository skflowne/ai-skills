// Lightweight YOLO-only review/fix loop with persistent PR reporting.
// Claude Code: run as a dynamic workflow. codex-dynamic-workflows:
//   codex-workflow run workflows/review-fix-loop-lite.js --config workflows-codex/codex-workflow.config.ts
//
// Written to the portable primitive subset both harnesses share — no imports, Date.now(), or
// Math.random() (Claude's workflow sandbox blocks them). All GitHub I/O, including rendering and
// timestamping the live PR report comment, is delegated to agents. Harness-specific routing and
// runner tuning (reporter/orchestrator/supervisor roles, timeouts, tool exclusions) lives in the
// codex provider config's label routes, not in this script.

export const meta = {
  name: 'review-fix-loop-lite',
  description: 'Loop a tailored yolo-council-review, judge findings, and orchestrate fixes until only nits remain (max 4 rounds)',
  phases: [
    { title: 'Review' },
    { title: 'Judge' },
    { title: 'Fix' },
  ],
}

// args: prNumber (required). repoSlug/repoPath (optional) thread explicit repo context into every
// prompt — without them, agents resolve the PR from cwd's default remote, which is ambiguous
// across multiple checkouts. prReporting (default true) toggles the persistent PR report comment.
// Some harnesses hand `args` through as a JSON-encoded string rather than the parsed object.
const ARGS = typeof args === 'string' ? JSON.parse(args) : args
const PR_NUMBER = ARGS.prNumber
const REPO_SLUG = ARGS.repoSlug
const REPO_PATH = ARGS.repoPath
const REPO_CONTEXT = (REPO_SLUG || REPO_PATH)
  ? `Repo context: ${REPO_PATH ? `local checkout at ${REPO_PATH} (cd there for git operations)` : ''}${REPO_PATH && REPO_SLUG ? ', ' : ''}${REPO_SLUG ? `GitHub repo ${REPO_SLUG} (pass --repo ${REPO_SLUG} to every gh command — do not rely on cwd's default remote)` : ''}.`
  : ''

const MAX_ROUNDS = 4
// A Workflow agent() call can't spawn a further subagent of its own, so a single agent told to
// "follow the supervised-forge skill" (which requires spawning and consulting a persistent
// reviewer) silently degrades to self-review. Fix rounds instead drive the milestone/review-gate
// loop from this script directly, dispatching a genuinely separate, independent agent() per gate.
const MAX_FIX_ROUNDS_PER_GATE = 2
const PR_REPORTING = ARGS.prReporting !== false
const REPORT_MARKER = '<!-- review-lite-workflow-report -->'
const REPORT_RUN_ID = `review-lite-pr${PR_NUMBER}`

if (!Number.isInteger(PR_NUMBER) || PR_NUMBER < 1) throw new Error('prNumber must be a positive integer')

const FINDING_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
    area: { type: 'string' },
    file: { type: 'string' },
    description: { type: 'string', minLength: 1, maxLength: 240 },
    failureScenario: { type: 'string', minLength: 1 },
    evidence: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
    finders: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
  required: ['severity', 'description', 'failureScenario', 'evidence', 'finders'],
}

const PANEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { findings: { type: 'array', items: FINDING_ITEM_SCHEMA } },
  required: ['findings'],
}

const ROSTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    experts: {
      type: 'array',
      minItems: 2,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          role: { type: 'string', minLength: 1 },
          focus: { type: 'string', minLength: 1 },
        },
        required: ['role', 'focus'],
      },
    },
  },
  required: ['experts'],
}

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    done: { type: 'boolean' },
    findings: { type: 'array', items: FINDING_ITEM_SCHEMA },
  },
  required: ['done', 'findings'],
}

const REMOTE_HEAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { headSha: { type: 'string', minLength: 1 } },
  required: ['headSha'],
}

const BRANCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { branch: { type: 'string', minLength: 1 } },
  required: ['branch'],
}

const GROUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    milestones: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1 },
          findings: { type: 'array', minItems: 1, items: FINDING_ITEM_SCHEMA },
        },
        required: ['title', 'findings'],
      },
    },
  },
  required: ['milestones'],
}

const IMPLEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    commitSha: { type: 'string', minLength: 1 },
    summary: { type: 'string' },
    validationOutput: { type: 'string' },
  },
  required: ['commitSha', 'summary', 'validationOutput'],
}

const FIX_COMMIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { commitSha: { type: 'string', minLength: 1 } },
  required: ['commitSha'],
}

const FIX_REVIEW_FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
    file: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['severity', 'description'],
}

const FIX_REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { findings: { type: 'array', items: FIX_REVIEW_FINDING_SCHEMA } },
  required: ['findings'],
}

const PUSH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    headSha: { type: 'string' },
    checksPassed: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['success', 'headSha', 'checksPassed', 'summary'],
}

const FIX_VERIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verified: { type: 'boolean' },
    headSha: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['verified', 'headSha', 'summary'],
}

const SCOUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 500 },
    observations: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 300 }, maxItems: 8 },
  },
  required: ['summary', 'observations'],
}

const REPORT_UPDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    updated: { type: 'boolean' },
    commentId: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['updated', 'commentId', 'summary'],
}

// Plain-data workflow state handed to the report agent, which renders the markdown. No timestamps
// here — script-side clock access is not portable.
const report = {
  runId: REPORT_RUN_ID,
  status: 'Starting',
  lastMilestone: 'Workflow started',
  currentPhase: 'Startup',
  startingSha: '',
  finalSha: '',
  panel: [],
  findings: [],
  findingsStatus: 'pending',
  commits: [],
  checksPassed: null,
  scoutUpdates: [],
  failure: '',
}

let reportCommentId = null
let reportingAvailable = PR_REPORTING
let reportFailures = 0
let reportQueue = Promise.resolve()

function severityBreakdown(findings) {
  if (!findings.length) return 'none'
  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 }
  for (const finding of findings) counts[finding.severity] = (counts[finding.severity] || 0) + 1
  return Object.entries(counts).filter(([, count]) => count > 0).map(([severity, count]) => `${count} ${severity}`).join(', ')
}

async function writeReportComment(reason) {
  if (!reportingAvailable) return
  try {
    const result = await agent(`Maintain the live progress-report comment on PR #${PR_NUMBER}.

${REPO_CONTEXT}

Using gh, find the PR comment containing the marker ${REPORT_MARKER} (list the PR's comments via the GitHub API, paginating). If none exists, create it; otherwise update it in place — there is exactly one report comment, never a new one per update.

Rewrite the body as a concise status report built from the workflow state below: start with the marker line on its own line, then a '## Review-lite workflow report' heading, current status, last milestone, current phase, starting head and current verified head SHAs, the panel roster, the latest review verdict (severity breakdown, plus each finding's severity/file/description with finder attribution), verified-fix commits with check status, and the scout observations (most recent first). Add an 'Updated at' timestamp — you have clock access, the workflow script does not. Keep the body under 60000 characters. Reason for this update: ${reason}.

Workflow state:
${JSON.stringify({ ...report, scoutUpdates: report.scoutUpdates.slice(-6) }, null, 2)}

Write the rendered body to a scratch file, then post it with a command that reads the body from that file — never pass "@path" as a literal --body string, since gh does not expand it and will post the literal "@path" text as the comment. To create the comment, use \`gh pr comment ${PR_NUMBER} --body-file <path>\`. To edit the existing comment by id, use \`gh api -X PATCH repos/{owner}/{repo}/issues/comments/<id> -f body=@<path>\` (the api subcommand's -f/-F flags are what support the @path idiom — gh pr comment's --body does not). After posting, re-fetch the comment and confirm its body starts with the marker line, not a literal file path.

Return updated=true with the comment id on success, updated=false otherwise.`, {
      label: 'report:update',
      schema: REPORT_UPDATE_SCHEMA,
    })
    if (result === null || !result.updated) throw new Error(result === null ? 'report agent failed' : result.summary)
    reportCommentId = result.commentId
    reportFailures = 0
    log(`PR report updated: ${reason} (comment ${reportCommentId})`)
  } catch (error) {
    reportFailures++
    log(`[warn] PR report update failed (${reason}): ${error instanceof Error ? error.message : String(error)}`)
    if (reportFailures >= 3) {
      reportingAvailable = false
      log('[warn] Disabling PR reporting after 3 consecutive failures')
    }
  }
}

// Serializes report writes so concurrent milestones cannot interleave comment updates.
function updateReport(reason) {
  reportQueue = reportQueue.then(() => writeReportComment(reason))
  return reportQueue
}

async function runScoutPass(phaseName, tick, isSettled) {
  const result = await agent(`Act as a read-only progress scout for review-lite PR #${PR_NUMBER}. This is progress report ${tick} during ${phaseName}.

${REPO_CONTEXT}

Inspect the actual checkout and any relevant sub-agent artifacts or runtime metadata created during ${phaseName}. During review, focus on observable panel/reviewer activity. During fixes, also inspect git status, changed files and diff statistics, relevant source/tests, running checks, commits, and the remote PR head. Do not edit files, commit, push, post to GitHub, or claim partial work is complete. Report only factual observations; omit anything uncertain.

Known panel:
${JSON.stringify(report.panel, null, 2)}

Current actionable findings:
${JSON.stringify(report.findings, null, 2)}

Return a compact summary and up to 8 observations.`, {
    phase: report.currentPhase,
    label: `${phaseName}:scout:${tick}`,
    schema: SCOUT_SCHEMA,
  })

  // The phase can finish while this pass was in flight — a "yep, it's done" observation only
  // duplicates the completion report that's about to be written, so drop it rather than post it.
  if (isSettled()) {
    log(`${phaseName}: scout pass ${tick} finished after the phase settled — dropping its (now redundant) observation`)
    return result !== null
  }

  report.scoutUpdates.push({
    phase: phaseName,
    tick,
    summary: result === null ? 'Scout report unavailable.' : result.summary,
    observations: result === null ? [] : result.observations,
  })
  await updateReport(`${phaseName} scout report ${tick}`)
  return result !== null
}

// Runs scout passes back-to-back while the operation is in flight — each pass is an agent run that
// takes minutes, which provides the pacing (no script-side timers; they are not portable).
async function withPhaseScout(phaseName, operation) {
  report.currentPhase = phaseName
  report.status = `${phaseName} in progress`

  let settled = false
  let scoutFailures = 0
  const operationPromise = Promise.resolve().then(operation).finally(() => { settled = true })
  const scoutPromise = reportingAvailable ? (async () => {
    let tick = 1
    while (!settled && reportingAvailable && scoutFailures < 3 && tick <= 20) {
      try {
        scoutFailures = (await runScoutPass(phaseName, tick, () => settled)) ? 0 : scoutFailures + 1
      } catch (error) {
        scoutFailures++
        log(`[warn] ${phaseName} scout report ${tick} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      tick++
    }
  })() : Promise.resolve()

  try {
    return await operationPromise
  } finally {
    await scoutPromise
  }
}

function expertPrompt(prNumber, expert) {
  return `Follow the pr-review skill to review PR #${prNumber}, but don't post inline comments — report your findings to the workflow supervisor instead.

${REPO_CONTEXT}

Provide actual evidence for every claim. Do not rely on unlikely hypotheticals. If unsure, search the codebase or fetch relevant docs. Return promptly after covering your assigned focus.

Your expert role: ${expert.role}
Your focus areas: ${expert.focus}

For every finding include severity, concise description, concrete failure scenario, and evidence. Identify it as found by your exact expert role.`
}

async function runYoloPanel(prNumber, round) {
  const roster = await agent(`Follow the yolo-council-review skill to compose the tailored expert panel for PR #${prNumber}. Fetch the PR, linked issues, diff, original goal, and acceptance criteria. Choose 2-6 distinct, non-overlapping expert roles according to the skill. Return only the roster; do not spawn reviewers, synthesize findings, post to GitHub, or ask for approval.

${REPO_CONTEXT}`, {
    phase: 'Review',
    label: `r${round}:yolo:roster`,
    schema: ROSTER_SCHEMA,
  })
  if (roster === null) throw new Error(`Round ${round}: yolo council roster failed`)

  report.panel = roster.experts
  report.lastMilestone = 'Panel chosen'
  report.status = `Round ${round}: panel chosen`
  await updateReport(`round ${round} panel chosen`)
  log(`Round ${round} panel chosen: ${roster.experts.map(expert => expert.role).join(', ')}`)

  const reports = await parallel(roster.experts.map(expert => () => agent(expertPrompt(prNumber, expert), {
    phase: 'Review',
    label: `r${round}:yolo:${expert.role}`,
  })))
  const completedReports = reports.map((result, index) => result ? { expert: roster.experts[index], result } : null).filter(Boolean)
  if (completedReports.length === 0) throw new Error(`Round ${round}: all yolo council reviewers failed`)

  const panel = await agent(`Follow the yolo-council-review skill to synthesize these tailored expert reports for PR #${prNumber}. Critically verify evidence, fetch external documentation when needed, deduplicate overlaps, reconcile severity, and drop speculative findings. The panel already performed the primary exploration: adjudicate only material findings, disagreements, and evidence gaps; do not restart a broad review. Do not post to GitHub or ask for approval.

${REPO_CONTEXT}

${completedReports.map(({ expert, result }) => `### ${expert.role}\nFocus: ${expert.focus}\n${result}`).join('\n\n')}

Return only final structured findings with severity, area, file, concise description, concrete failureScenario, non-empty evidence, and all expert-role finders.`, {
    phase: 'Review',
    label: `r${round}:yolo:synthesis`,
    schema: PANEL_SCHEMA,
  })
  if (panel === null) throw new Error(`Round ${round}: yolo council synthesis failed`)
  log(`Round ${round} panel synthesized ${panel.findings.length} finding(s): ${severityBreakdown(panel.findings)}`)
  return panel.findings
}

async function reviewAndJudge(reviewRound, { final = false } = {}) {
  return withPhaseScout(`Review round ${reviewRound}`, async () => {
    phase('Review')
    log(final ? `Post-fix verification review after round ${MAX_ROUNDS}` : `Round ${reviewRound}/${MAX_ROUNDS}: tailored yolo-council review`)

    const yoloFindings = await runYoloPanel(PR_NUMBER, reviewRound)
    phase('Judge')
    const judged = await agent(`Judge this tailored yolo-council-review report for PR #${PR_NUMBER} (round ${reviewRound}).

${REPO_CONTEXT}

## YOLO-council-review findings
${JSON.stringify(yoloFindings, null, 2)}

Validate findings against evidence and reconcile severity conflicts. Fetch existing PR comments, prior review rounds, and linked follow-up issues. Drop a prior finding only when the current remote head proves it fixed or a linked issue explicitly defers it. done=true only if no blocker, major, or minor remains. Otherwise return every actionable finding; nits may be omitted. Preserve every source finder role.`, {
      schema: JUDGE_SCHEMA,
      label: `r${reviewRound}:judge`,
    })
    if (judged === null) throw new Error(`Round ${reviewRound}: judge failed`)
    if (!judged.done && judged.findings.length === 0) throw new Error(`Round ${reviewRound}: judge returned done=false with no actionable findings`)

    report.findings = judged.findings
    report.findingsStatus = judged.done ? 'clean' : 'actionable'
    report.lastMilestone = 'Review verdict'
    report.status = judged.done ? `Round ${reviewRound}: clean` : `Round ${reviewRound}: ${judged.findings.length} finding(s) to fix`
    await updateReport(`round ${reviewRound} review verdict`)

    log(`Round ${reviewRound} verdict: ${judged.done ? 'clean — only nits remain' : `NOT done — ${judged.findings.length} actionable finding(s): ${severityBreakdown(judged.findings)}`}`)
    for (const finding of judged.findings) {
      log(`  - [${finding.severity}] [found by: ${finding.finders.join(', ')}] ${finding.area ? `(${finding.area}) ` : ''}${finding.file ? `${finding.file}: ` : ''}${finding.description}`)
    }
    return judged
  })
}

async function postReview(reviewRound, judged, { final = false } = {}) {
  const result = await agent(`Follow the github-pr-review skill to post a review to PR #${PR_NUMBER} summarizing round ${reviewRound}'s verified findings, severity-ranked and sectioned by expert area, with complete finder attribution and inline comments where file/line evidence supports them. event: COMMENT.

${REPO_CONTEXT}

${final
  ? 'This is the post-fix verification after the round cap; no additional fix round runs automatically.'
  : judged.done
    ? 'State that only nits remain and the loop is stopping.'
    : `State that fixes will run for these ${judged.findings.length} finding(s).`}

Findings:
${JSON.stringify(judged.findings, null, 2)}`, { label: `r${reviewRound}:post` })
  if (result === null) throw new Error(`Round ${reviewRound}: failed to post review`)
  log(`Round ${reviewRound}: review posted to PR #${PR_NUMBER}`)
}

function actionableFix(findings) {
  return findings.filter(finding => finding.severity !== 'nit')
}

async function requestFixReview(label, subject, context) {
  const review = await agent(`Act as an independent correctness reviewer verifying a fix for ${subject}, per the supervised-forge skill's review-gate contract. You did not write this fix and have no prior context beyond this message. Inspect the actual commit(s) on the branch yourself — do not trust the implementer's own description of what changed. Confirm the original findings are genuinely resolved and no regression was introduced. Report concrete findings with evidence and exact file references; return no findings if it's clean.

${context}`, {
    label: `${label}:review`,
    model: 'opus',
    schema: FIX_REVIEW_SCHEMA,
    agentType: 'general-purpose',
  })
  if (review === null) throw new Error(`${label}: fix-verification review failed`)
  return review.findings
}

// A Workflow agent() call can't spawn a further subagent, so a single agent told to "resolve and
// verify per the supervised-forge skill" can't actually run the skill's persistent-reviewer
// mechanic. This dispatches a genuinely separate, independent agent() for each review pass instead.
async function runFixReviewGate(branch, label, subject, context, fixPromptPrefix) {
  let findings = actionableFix(await requestFixReview(label, subject, context))
  const fixed = []
  const fixCommits = []
  let round = 0
  while (findings.length && round < MAX_FIX_ROUNDS_PER_GATE) {
    round++
    const fix = await agent(`${fixPromptPrefix}

${REPO_CONTEXT}

Findings to resolve:
${JSON.stringify(findings, null, 2)}

Rerun the relevant validation and commit your fixes with a message starting "${label} fix r${round}:". Return the commit sha.`, {
      label: `${label}:fix:r${round}`,
      schema: FIX_COMMIT_SCHEMA,
      agentType: 'general-purpose',
    })
    if (fix === null) throw new Error(`${label}: fix round ${round} failed`)
    fixCommits.push(fix.commitSha)
    fixed.push(...findings)
    findings = actionableFix(await requestFixReview(`${label}:r${round}`, subject, context))
  }
  if (findings.length) {
    log(`${subject}: ${findings.length} finding(s) still open after ${round} fix round(s) — proceeding with residual risk`)
  }
  return { fixed, openFindings: findings, fixCommits }
}

async function runFix(round, findings) {
  const beforeFix = await agent(`Fetch PR #${PR_NUMBER} from GitHub and return its current remote head commit SHA. Do not use a local branch SHA.

${REPO_CONTEXT}`, {
    label: `r${round}:fix:before-head`,
    schema: REMOTE_HEAD_SCHEMA,
  })
  if (beforeFix === null || !beforeFix.headSha) throw new Error(`Round ${round}: could not establish the remote PR head; refusing to dispatch fixes`)

  return withPhaseScout(`Fix round ${round}`, async () => {
    phase('Fix')
    log(`Round ${round}: dispatching fixes for ${findings.length} finding(s) from ${beforeFix.headSha}`)

    const checkout = await agent(`Check out PR #${PR_NUMBER}'s branch locally (fetch first) and confirm its remote head is exactly ${beforeFix.headSha}. Do not edit or commit anything. Return the branch name.

${REPO_CONTEXT}`, {
      label: `r${round}:fix:checkout`,
      schema: BRANCH_SCHEMA,
      agentType: 'general-purpose',
    })
    if (checkout === null || !checkout.branch) throw new Error(`Round ${round}: could not check out PR #${PR_NUMBER}'s branch at the expected head ${beforeFix.headSha}`)
    const branch = checkout.branch

    const grouped = await agent(`Group these PR #${PR_NUMBER} review findings into cohesive fix milestones — batch findings touching the same area/file/concern together, keep unrelated concerns separate. Return each milestone's exact findings unchanged (do not drop or reword them); do not implement anything yet.

${REPO_CONTEXT}

Findings:
${JSON.stringify(findings, null, 2)}`, {
      label: `r${round}:fix:group`,
      schema: GROUP_SCHEMA,
    })
    if (grouped === null || !grouped.milestones.length) throw new Error(`Round ${round}: could not group findings into fix milestones`)
    log(`Round ${round}: grouped into ${grouped.milestones.length} fix milestone(s)`)

    const commits = []
    const stillOpen = []
    for (const [index, milestone] of grouped.milestones.entries()) {
      const tag = `r${round}.${index + 1}`
      const impl = await agent(`On branch ${branch} (PR #${PR_NUMBER}), resolve this review milestone "${milestone.title}".

${REPO_CONTEXT}

Findings to resolve:
${JSON.stringify(milestone.findings, null, 2)}

Run the relevant tests, lint, typecheck, and other validation. Commit your work with a message starting "Fix ${tag}: ${milestone.title}". Return the commit sha, a concise summary, and the raw validation command output.`, {
        label: `${tag}:implement`,
        schema: IMPLEMENT_SCHEMA,
        agentType: 'general-purpose',
      })
      if (impl === null) throw new Error(`Round ${round}: fix milestone ${tag} implementation failed`)
      commits.push({ sha: impl.commitSha, title: `Fix ${tag}: ${milestone.title}` })

      const gate = await runFixReviewGate(branch, tag,
        `fix milestone ${tag} ("${milestone.title}") on PR #${PR_NUMBER} branch ${branch}, commit ${impl.commitSha}`,
        `Original findings this milestone was meant to resolve:
${JSON.stringify(milestone.findings, null, 2)}

Raw validation output from the implementer:
${impl.validationOutput}`,
        `On branch ${branch}, resolve these findings for fix milestone "${milestone.title}" (PR #${PR_NUMBER}).`)
      for (const sha of gate.fixCommits) commits.push({ sha, title: `Fix ${tag} follow-up: ${milestone.title}` })
      if (gate.openFindings.length) stillOpen.push(...gate.openFindings)
      log(`${tag}: fix review gate ${gate.openFindings.length ? `left ${gate.openFindings.length} open finding(s)` : 'clean'} (${gate.fixed.length} fixed)`)
    }

    if (stillOpen.length) {
      log(`Round ${round}: ${stillOpen.length} finding(s) still open after all fix milestones — pushing regardless; they'll resurface in the next review round`)
    }

    const pushResult = await agent(`On branch ${branch} (PR #${PR_NUMBER}), push the branch to the remote. Query GitHub afterward and confirm the remote head equals your local HEAD and differs from ${beforeFix.headSha}. Return success, the pushed head sha, and whether checks (lint/typecheck/tests/CI as applicable) passed.

${REPO_CONTEXT}`, {
      label: `r${round}:fix:push`,
      schema: PUSH_SCHEMA,
    })
    if (pushResult === null || !pushResult.success || !pushResult.headSha || pushResult.headSha === beforeFix.headSha) {
      throw new Error(`Round ${round}: push did not verify a changed remote head: ${pushResult ? pushResult.summary : 'push agent failed'}`)
    }

    const fixVerification = await agent(`Independently verify the pushed result for PR #${PR_NUMBER} using GitHub, not the local checkout. Confirm the current remote head is exactly ${pushResult.headSha}, differs from ${beforeFix.headSha}, belongs to PR #${PR_NUMBER}, and that these commits exactly describe the pushed range:
${JSON.stringify(commits, null, 2)}
Return verified=false on any mismatch.

${REPO_CONTEXT}`, {
      label: `r${round}:fix:verify-remote`,
      schema: FIX_VERIFICATION_SCHEMA,
    })
    if (fixVerification === null || !fixVerification.verified || fixVerification.headSha !== pushResult.headSha) {
      throw new Error(`Round ${round}: independent remote verification failed; refusing to start another review round`)
    }

    report.commits = [...new Map([...report.commits, ...commits].map(commit => [commit.sha, commit])).values()]
    report.checksPassed = pushResult.checksPassed
    report.finalSha = pushResult.headSha
    report.findingsStatus = stillOpen.length ? 'partially-fixed' : 'fixed'
    report.lastMilestone = 'Fix verified'
    report.status = `Round ${round}: fix verified`
    await updateReport(`round ${round} fix verified`)
    log(`Round ${round}: verified fixes committed and pushed at ${pushResult.headSha}`)
    return { afterHeadSha: pushResult.headSha, commits, openFindings: stillOpen }
  })
}

async function initializeReport() {
  if (!PR_REPORTING) return
  await updateReport('workflow started')
}

await initializeReport()
log(`Starting lightweight YOLO review-fix loop for PR #${PR_NUMBER}, max ${MAX_ROUNDS} fix round(s), PR reporting ${PR_REPORTING ? 'enabled' : 'disabled'}`)

let round = 0
let verdict = { done: false, findings: [] }

try {
  while (!verdict.done && round < MAX_ROUNDS) {
    round++
    verdict = await reviewAndJudge(round)
    await postReview(round, verdict)
    if (verdict.done) break
    await runFix(round, verdict.findings)
  }

  if (!verdict.done && round === MAX_ROUNDS) {
    const verificationRound = MAX_ROUNDS + 1
    verdict = await reviewAndJudge(verificationRound, { final: true })
    await postReview(verificationRound, verdict, { final: true })
  }

  report.currentPhase = 'Complete'
  report.lastMilestone = 'Final outcome'
  report.status = verdict.done ? `Complete after ${round} round(s)` : `Stopped at round cap with ${verdict.findings.length} finding(s)`
  report.findings = verdict.findings
  report.findingsStatus = verdict.done ? 'clean' : 'actionable'
  await updateReport('final outcome')

  if (!verdict.done) {
    log(`Hit the ${MAX_ROUNDS}-round cap with ${verdict.findings.length} finding(s) still open after post-fix verification — stopping for human triage.`)
  } else {
    log(`Done after ${round} round(s) — only nits remain on PR #${PR_NUMBER}.`)
  }

  return { reportRunId: REPORT_RUN_ID, rounds: round, done: verdict.done, openFindings: verdict.findings, reportCommentId }
} catch (error) {
  report.currentPhase = 'Failed'
  report.status = 'Failed'
  report.lastMilestone = 'Workflow failed'
  report.failure = error instanceof Error ? error.message : String(error)
  await updateReport('workflow failed')
  log(`Workflow failed: ${report.failure}`)
  throw error
}
