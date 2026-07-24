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
  ? `Repo context: ${REPO_PATH ? `local checkout at ${REPO_PATH} (cd there for git operations)` : ''}${REPO_PATH && REPO_SLUG ? ', ' : ''}${REPO_SLUG ? `GitHub repo ${REPO_SLUG} (pass --repo ${REPO_SLUG} to every gh subcommand that accepts it — do not rely on cwd's default remote). \`gh api\` has no --repo flag and resolves the {owner}/{repo} placeholders from the cwd's remote, so spell the repo out in the path instead: repos/${REPO_SLUG}/...` : ''}.`
  : ''

// gh invocation fragments the report agent must not have to derive. `gh api` takes no --repo flag,
// so a run whose cwd is not the target checkout has to carry the slug in the path itself.
const GH_REPO_FLAG = REPO_SLUG ? ` --repo ${REPO_SLUG}` : ''
const GH_API_REPO = REPO_SLUG ? `repos/${REPO_SLUG}` : 'repos/{owner}/{repo}'

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
    // No maxLength: a hard cap here fails the whole structured-output call when a reviewer writes
    // one sentence too many. Ask for concision in the prompt instead.
    description: { type: 'string', minLength: 1 },
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
    // Same reasoning as FINDING_ITEM_SCHEMA: no hard string/array caps that can fail the call.
    // The script truncates instead (see runScoutPass).
    summary: { type: 'string', minLength: 1 },
    observations: { type: 'array', items: { type: 'string', minLength: 1 } },
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
let reportRunner = null
let queuedReasons = []

// Report token budget. The report agent's cost is (prompt + rendered body) in, (body) out, once per
// update — so the body is paid for twice on every write. Keep it bounded and boring.
const MAX_SCOUT_UPDATES_SHOWN = 4
const MAX_SCOUT_OBSERVATIONS = 8
const MAX_OBSERVATION_CHARS = 300
const MAX_SUMMARY_CHARS = 500
const MAX_DESCRIPTION_CHARS = 400
// Runaway backstop only. Scouting must cover the whole phase — that is the point of it, and a long
// fix phase is exactly when visibility matters most — so this is set well above the number of
// back-to-back passes any real phase fits, not used to ration updates. Per-pass cost is controlled
// by routing scouts to a cheap tier (see the scout agent's model/effort) instead.
const MAX_SCOUT_TICKS = 60

function truncate(text, max) {
  const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function severityBreakdown(findings) {
  if (!findings.length) return 'none'
  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 }
  for (const finding of findings) counts[finding.severity] = (counts[finding.severity] || 0) + 1
  return Object.entries(counts).filter(([, count]) => count > 0).map(([severity, count]) => `${count} ${severity}`).join(', ')
}

// Rendering the body here rather than in the report agent's prompt is the main token saving: the
// agent no longer reads a pretty-printed JSON dump of the whole workflow state and writes prose
// from it, it just copies a finished body through and stamps the time.
function renderFindings(findings) {
  if (!findings.length) return '_none_'
  return findings.map(finding => {
    const where = finding.file ? ` \`${finding.file}\`` : ''
    const area = finding.area ? ` (${finding.area})` : ''
    const finders = finding.finders && finding.finders.length ? ` — _found by ${finding.finders.join(', ')}_` : ''
    return `- **${finding.severity}**${where}${area} ${truncate(finding.description, MAX_DESCRIPTION_CHARS)}${finders}`
  }).join('\n')
}

function renderReportBody() {
  const scouts = report.scoutUpdates.slice(-MAX_SCOUT_UPDATES_SHOWN).reverse()
  return [
    REPORT_MARKER,
    '',
    '## Review-lite workflow report',
    '',
    // Bullets, not bare lines: GitHub joins consecutive plain lines into one paragraph.
    `- **Status:** ${report.status}`,
    `- **Phase:** ${report.currentPhase} · **Last milestone:** ${report.lastMilestone}`,
    `- **Head:** ${report.startingSha || '_unknown_'} → ${report.finalSha || '_no verified fix yet_'}`,
    report.checksPassed === null ? null : `- **Checks:** ${report.checksPassed ? 'passed' : 'not passing'}`,
    report.failure ? `- **Failure:** ${truncate(report.failure, 1000)}` : null,
    '',
    `### Panel`,
    report.panel.length ? report.panel.map(expert => `- **${expert.role}** — ${truncate(expert.focus, 200)}`).join('\n') : '_not chosen yet_',
    '',
    `### Findings (${report.findingsStatus}) — ${severityBreakdown(report.findings)}`,
    renderFindings(report.findings),
    '',
    '### Verified fix commits',
    report.commits.length ? report.commits.map(commit => `- \`${commit.sha}\` ${commit.title}`).join('\n') : '_none_',
    '',
    `### Scout observations (most recent first)`,
    scouts.length ? scouts.map(update => [
      `**${update.phase} · report ${update.tick}** — ${update.summary}`,
      ...update.observations.map(observation => `  - ${observation}`),
    ].join('\n')).join('\n\n') : '_none_',
    '',
    '_Updated at UPDATED_AT_PLACEHOLDER._',
  ].filter(line => line !== null).join('\n')
}

async function writeReportComment(reason) {
  if (!reportingAvailable) return
  try {
    const result = await agent(`Update the live progress-report comment on PR #${PR_NUMBER} (reason: ${reason}).

${REPO_CONTEXT}

The body is already rendered below. Post it verbatim — do not summarize, reorder, reformat, or add sections — with exactly one change: replace the literal token UPDATED_AT_PLACEHOLDER with the current UTC timestamp (you have clock access, the workflow script does not).

Steps:

1. Write the body to a scratch file, e.g. /tmp/review-lite-report-${PR_NUMBER}.md. Use a heredoc quoted as <<'MARKDOWN' so the shell expands nothing inside it.
${reportCommentId
  ? `2. Edit comment id ${reportCommentId} in place:
   \`gh api -X PATCH ${GH_API_REPO}/issues/comments/${reportCommentId} -F body=@/tmp/review-lite-report-${PR_NUMBER}.md\`
   Do not list the PR's comments and do not create a new one — that id is known to be correct.`
  : `2. Find the existing report comment:
   \`gh api --paginate ${GH_API_REPO}/issues/${PR_NUMBER}/comments --jq '.[] | select(.body | contains("${REPORT_MARKER}")) | .id'\`
   If that prints an id, edit it in place:
   \`gh api -X PATCH ${GH_API_REPO}/issues/comments/<id> -F body=@/tmp/review-lite-report-${PR_NUMBER}.md\`
   If it prints nothing, create the comment:
   \`gh pr comment ${PR_NUMBER}${GH_REPO_FLAG} --body-file /tmp/review-lite-report-${PR_NUMBER}.md\`
   Then re-run the lookup to get its id. There is exactly one report comment for the whole run.`}
3. Verify: \`gh api ${GH_API_REPO}/issues/comments/<id> --jq '.body' | head -1\` must print the marker line, not a file path.

gh flag rules that this breaks on if ignored:
- \`--body\` does NOT expand a leading "@" — passing "@/tmp/file.md" posts that literal string as the comment text. Only \`gh api\`'s -f/-F flags support the @path idiom, and only -F (not -f) reads the file's raw contents.
- \`gh api\` has no --repo flag; it resolves {owner}/{repo} from the cwd's git remote, so use the repo path spelled out above.
- \`gh pr comment\` creates a new comment every time — never use it to update an existing one.

Return updated=true with the comment id on success, updated=false otherwise. Keep your summary to one short sentence.

--- BODY ---
${renderReportBody()}
--- END BODY ---`, {
      label: 'report:update',
      schema: REPORT_UPDATE_SCHEMA,
      // The body arrives pre-rendered, so this agent only has to copy it through and run two gh
      // commands — no reasoning tier needed. Not the cheapest tier though: a botched report is
      // user-visible, and three failures disable reporting for the rest of the run.
      model: 'sonnet',
      effort: 'low',
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

// Serializes report writes so concurrent milestones cannot interleave comment updates, and
// coalesces any that pile up behind an in-flight one: the body is a full render of current state,
// so N queued writes would each post the same content — one agent run covers them all.
function updateReport(reason) {
  if (!reportingAvailable) return Promise.resolve()
  queuedReasons.push(reason)
  if (!reportRunner) {
    reportRunner = (async () => {
      while (queuedReasons.length) {
        const reasons = queuedReasons
        queuedReasons = []
        const dropped = reasons.length - 1
        await writeReportComment(dropped ? `${reasons[dropped]} (+${dropped} coalesced)` : reasons[0])
      }
      reportRunner = null
    })()
  }
  return reportRunner
}

async function runScoutPass(phaseName, tick, isSettled) {
  const result = await agent(`Act as a read-only progress scout for review-lite PR #${PR_NUMBER}. This is progress report ${tick} during ${phaseName}.

${REPO_CONTEXT}

Inspect the actual checkout and any relevant sub-agent artifacts or runtime metadata created during ${phaseName}. During review, focus on observable panel/reviewer activity. During fixes, also inspect git status, changed files and diff statistics, relevant source/tests, running checks, commits, and the remote PR head. Do not edit files, commit, push, post to GitHub, or claim partial work is complete. Report only factual observations; omit anything uncertain.

Known panel: ${report.panel.length ? report.panel.map(expert => expert.role).join(', ') : 'not chosen yet'}

Current actionable findings:
${report.findings.length ? report.findings.map(finding => `- [${finding.severity}] ${finding.file ? `${finding.file}: ` : ''}${truncate(finding.description, MAX_DESCRIPTION_CHARS)}`).join('\n') : '- none'}

Return a summary of at most ${MAX_SUMMARY_CHARS} characters and at most ${MAX_SCOUT_OBSERVATIONS} observations of at most ${MAX_OBSERVATION_CHARS} characters each. Anything longer is truncated.`, {
    phase: report.currentPhase,
    label: `${phaseName}:scout:${tick}`,
    schema: SCOUT_SCHEMA,
    // Observing and describing state is a cheap job, and it runs continuously for the whole phase.
    // Keep the tier low so full-duration visibility does not cost reasoning-model tokens.
    // (codex routes `*:scout:*` to its own cheap `reporter` role and ignores these.)
    model: 'haiku',
    effort: 'low',
  })

  // The phase can finish while this pass was in flight — a "yep, it's done" observation only
  // duplicates the completion report that's about to be written, so drop it rather than post it.
  if (isSettled()) {
    log(`${phaseName}: scout pass ${tick} finished after the phase settled — dropping its (now redundant) observation`)
    return result !== null
  }

  // The schema no longer caps these (a cap there fails the whole call); enforce the size here.
  report.scoutUpdates.push({
    phase: phaseName,
    tick,
    summary: result === null ? 'Scout report unavailable.' : truncate(result.summary, MAX_SUMMARY_CHARS),
    observations: result === null ? [] : result.observations.slice(0, MAX_SCOUT_OBSERVATIONS).map(observation => truncate(observation, MAX_OBSERVATION_CHARS)),
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
    while (!settled && reportingAvailable && scoutFailures < 3 && tick <= MAX_SCOUT_TICKS) {
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
  if (!report.startingSha) report.startingSha = beforeFix.headSha

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
