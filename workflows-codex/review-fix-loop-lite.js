// Lightweight YOLO-only review/fix loop with persistent PR reporting.
// Run with: codex-workflow run workflows-codex/review-fix-loop-lite.js --config workflows-codex/codex-workflow.config.ts

export const meta = {
  name: 'review-fix-loop-lite',
  description: 'Loop a tailored yolo-council-review, judge findings, and orchestrate fixes until only nits remain (max 4 rounds)',
  phases: [
    { title: 'Review' },
    { title: 'Judge' },
    { title: 'Fix' },
  ],
}

import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PR_NUMBER = args.prNumber
const REPO_SLUG = args.repoSlug
const REPO_PATH = args.repoPath
const REPO_CONTEXT = (REPO_SLUG || REPO_PATH)
  ? `Repo context: ${REPO_PATH ? `local checkout at ${REPO_PATH} (cd there for git operations)` : ''}${REPO_PATH && REPO_SLUG ? ', ' : ''}${REPO_SLUG ? `GitHub repo ${REPO_SLUG} (pass --repo ${REPO_SLUG} to every gh command — do not rely on cwd's default remote)` : ''}.`
  : ''

const MAX_ROUNDS = 4
const PR_REPORTING = args.prReporting !== false
const PR_REPORT_INTERVAL_MINUTES = args.prReportIntervalMinutes ?? 8
const PR_REPORT_INTERVAL_MS = PR_REPORT_INTERVAL_MINUTES * 60 * 1000
const REPORT_MARKER = '<!-- review-lite-workflow-report -->'
const REPORT_RUN_ID = `review-lite-${randomUUID().slice(0, 8)}`

if (!Number.isInteger(PR_NUMBER) || PR_NUMBER < 1) throw new Error('prNumber must be a positive integer')
if (!Number.isInteger(PR_REPORT_INTERVAL_MINUTES) || PR_REPORT_INTERVAL_MINUTES < 1) {
  throw new Error('prReportIntervalMinutes must be a positive integer')
}

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

const COMMIT_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sha: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
  },
  required: ['sha', 'title'],
}

const FIX_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    beforeHeadSha: { type: 'string' },
    afterHeadSha: { type: 'string' },
    pushed: { type: 'boolean' },
    checksPassed: { type: 'boolean' },
    resolvedFindingCount: { type: 'number' },
    commits: { type: 'array', items: COMMIT_ITEM_SCHEMA },
    summary: { type: 'string' },
  },
  required: ['success', 'beforeHeadSha', 'afterHeadSha', 'pushed', 'checksPassed', 'resolvedFindingCount', 'commits', 'summary'],
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
    nestedAgents: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', minLength: 1 },
          startedAt: { type: 'string', minLength: 1 },
          finishedAt: { type: 'string', minLength: 1 },
          durationMs: { type: 'number' },
          status: { type: 'string', enum: ['completed', 'failed'] },
        },
        required: ['label', 'startedAt', 'finishedAt', 'durationMs', 'status'],
      },
    },
  },
  required: ['summary', 'observations', 'nestedAgents'],
}

const report = {
  runId: REPORT_RUN_ID,
  startedAt: Date.now(),
  updatedAt: Date.now(),
  status: 'Starting',
  lastMilestone: 'Workflow started',
  currentPhase: 'Startup',
  phaseStartedAt: Date.now(),
  startingSha: '',
  finalSha: '',
  panel: [],
  findings: [],
  findingsStatus: 'pending',
  commits: [],
  checksPassed: null,
  timings: [],
  nestedTimings: [],
  scoutUpdates: [],
  failure: '',
}

const activeAgents = new Map()
let reportRepoSlug = REPO_SLUG || ''
let reportCommentId = null
let reportingAvailable = PR_REPORTING
let reportQueue = Promise.resolve()

function iso(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().replace('.000Z', 'Z')
}

function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown'
  const seconds = Math.round(ms / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [hours ? `${hours}h` : '', minutes || hours ? `${minutes}m` : '', `${remainder}s`].filter(Boolean).join(' ')
}

function severityBreakdown(findings) {
  if (!findings.length) return 'none'
  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 }
  for (const finding of findings) counts[finding.severity] = (counts[finding.severity] || 0) + 1
  return Object.entries(counts).filter(([, count]) => count > 0).map(([severity, count]) => `${count} ${severity}`).join(', ')
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function timingRows() {
  const direct = report.timings.map(item => ({ ...item, source: 'workflow' }))
  const running = [...activeAgents.values()]
    .filter(item => !item.label.includes(':scout:'))
    .map(item => ({ ...item, source: 'workflow', status: 'running' }))
  const nested = report.nestedTimings.map(item => ({ ...item, source: 'nested' }))
  return [...direct, ...running, ...nested].sort((a, b) => a.startedAtMs - b.startedAtMs)
}

function renderReport() {
  const now = Date.now()
  const elapsed = duration(now - report.startedAt)
  const phaseElapsed = duration(now - report.phaseStartedAt)
  const lines = [
    REPORT_MARKER,
    `## Review-lite workflow report`,
    '',
    `**Run:** \`${report.runId}\`  `,
    `**Status:** ${report.status}  `,
    `**Last milestone:** ${report.lastMilestone}  `,
    `**Current phase:** ${report.currentPhase} (${phaseElapsed})  `,
    `**Started:** ${iso(report.startedAt)} · **Updated:** ${iso(report.updatedAt)} · **Elapsed:** ${elapsed}`,
  ]

  if (report.startingSha) lines.push(`**Starting head:** \`${report.startingSha}\``)
  if (report.finalSha) lines.push(`**Current verified head:** \`${report.finalSha}\``)

  if (report.panel.length) {
    lines.push('', '### Panel', ...report.panel.map(expert => `- **${expert.role}** — ${expert.focus}`))
  }

  if (report.findingsStatus !== 'pending') {
    const findingHeading = report.findingsStatus === 'fixed' ? 'Findings addressed by the verified fix' : 'Review verdict'
    lines.push('', `### ${findingHeading} — ${severityBreakdown(report.findings)}`)
    if (report.findings.length) {
      lines.push(...report.findings.map(finding => `- **${finding.severity}:** ${finding.file ? `\`${finding.file}\` — ` : ''}${finding.description}`))
    } else {
      lines.push('- No actionable blocker, major, or minor findings remain.')
    }
  }

  if (report.commits.length || report.checksPassed !== null) {
    lines.push('', '### Verified fix')
    if (report.commits.length) lines.push(...report.commits.map(commit => `- \`${commit.sha.slice(0, 12)}\` ${commit.title}`))
    if (report.checksPassed !== null) lines.push(`- Checks passed: **${report.checksPassed ? 'yes' : 'no'}**`)
  }

  if (report.scoutUpdates.length) {
    lines.push('', '### Live observations')
    for (const update of report.scoutUpdates.slice(-6).reverse()) {
      lines.push(`- **${iso(update.at)} · ${update.phase} +${duration(update.elapsedMs)}:** ${update.summary}`)
      for (const observation of update.observations) lines.push(`  - ${observation}`)
    }
  }

  const timings = timingRows()
  if (timings.length) {
    lines.push('', '<details>', '<summary>Agent timings</summary>', '', '| Agent | Source | Started | Finished | Duration | Status |', '|---|---|---:|---:|---:|---|')
    for (const item of timings) {
      lines.push(`| ${markdownCell(item.label)} | ${item.source} | ${iso(item.startedAtMs)} | ${item.finishedAtMs ? iso(item.finishedAtMs) : 'running'} | ${duration(item.durationMs ?? now - item.startedAtMs)} | ${item.status} |`)
    }
    lines.push('', '</details>')
  }

  if (report.failure) lines.push('', '### Failure', report.failure)
  lines.push('', '_Live observations are provisional; milestone results are authoritative._')
  return lines.join('\n').slice(0, 64000)
}

async function gh(argsList) {
  const result = await execFileAsync('gh', argsList, { cwd, maxBuffer: 16 * 1024 * 1024 })
  return String(result.stdout).trim()
}

async function ensureReportComment() {
  if (!reportingAvailable || reportCommentId !== null) return
  if (!reportRepoSlug) reportRepoSlug = await gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  if (!report.startingSha) {
    report.startingSha = await gh(['pr', 'view', String(PR_NUMBER), '--repo', reportRepoSlug, '--json', 'headRefOid', '--jq', '.headRefOid'])
    report.finalSha = report.startingSha
  }

  const raw = await gh(['api', `repos/${reportRepoSlug}/issues/${PR_NUMBER}/comments`, '--paginate', '--slurp'])
  const parsed = JSON.parse(raw || '[]')
  const comments = Array.isArray(parsed[0]) ? parsed.flat() : parsed
  const existing = comments.find(comment => typeof comment.body === 'string' && comment.body.includes(REPORT_MARKER))
  if (existing) {
    reportCommentId = existing.id
    return
  }

  const created = JSON.parse(await gh(['api', '--method', 'POST', `repos/${reportRepoSlug}/issues/${PR_NUMBER}/comments`, '-f', `body=${renderReport()}`]))
  reportCommentId = created.id
}

async function writeReportComment(reason) {
  if (!reportingAvailable) return
  try {
    report.updatedAt = Date.now()
    await ensureReportComment()
    await gh(['api', '--method', 'PATCH', `repos/${reportRepoSlug}/issues/comments/${reportCommentId}`, '-f', `body=${renderReport()}`])
    log(`[${iso()}] PR report updated: ${reason} (comment ${reportCommentId})`)
  } catch (error) {
    reportCommentId = null
    log(`[${iso()}] [warn] PR report update failed and will be rediscovered at the next milestone: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function updateReport(reason) {
  reportQueue = reportQueue.then(() => writeReportComment(reason))
  return reportQueue
}

async function timedAgent(prompt, options) {
  const label = options.label || 'agent'
  const startedAtMs = Date.now()
  activeAgents.set(label, { label, startedAtMs })
  log(`[${iso(startedAtMs)}] agent started: ${label}`)
  let status = 'failed'
  try {
    const result = await agent(prompt, options)
    status = result === null ? 'failed' : 'completed'
    return result
  } finally {
    const finishedAtMs = Date.now()
    activeAgents.delete(label)
    report.timings.push({ label, startedAtMs, finishedAtMs, durationMs: finishedAtMs - startedAtMs, status })
    log(`[${iso(finishedAtMs)}] agent ${status}: ${label} (${duration(finishedAtMs - startedAtMs)})`)
  }
}

function mergeNestedTimings(items) {
  for (const item of items) {
    const startedAtMs = Date.parse(item.startedAt)
    const finishedAtMs = Date.parse(item.finishedAt)
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(finishedAtMs)) continue
    const key = `${item.label}:${startedAtMs}`
    if (report.nestedTimings.some(existing => existing.key === key)) continue
    report.nestedTimings.push({ ...item, key, startedAtMs, finishedAtMs })
  }
}

async function runScoutPass(phaseName, phaseStartedAt, tick, { publish = true } = {}) {
  const active = [...activeAgents.values()].map(item => ({ label: item.label, startedAt: iso(item.startedAtMs), elapsed: duration(Date.now() - item.startedAtMs) }))
  const result = await timedAgent(`Act as a read-only progress scout for review-lite PR #${PR_NUMBER}. This is periodic report ${tick}, anchored to the start of ${phaseName} at ${iso(phaseStartedAt)}.

${REPO_CONTEXT}

Inspect the actual checkout and any relevant .pi-subagents artifacts or runtime metadata created since ${iso(phaseStartedAt)}. During review, focus on observable panel/reviewer activity and completed child metadata. During fixes, also inspect git status, changed files and diff statistics, relevant source/tests, running checks, commits, and the remote PR head. Do not edit files, commit, push, post to GitHub, or claim partial work is complete. Report only factual observations. For nested agent timings, include only exact values supported by runtime metadata; in pi-subagents meta files, treat timestamp as completion time and derive start time from durationMs. Omit uncertain, pre-phase, or unrelated runs.

Known active workflow agents:
${JSON.stringify(active, null, 2)}

Known panel:
${JSON.stringify(report.panel, null, 2)}

Current actionable findings:
${JSON.stringify(report.findings, null, 2)}

Return a compact summary, observations, and exact completed nested-agent timings.`, {
    phase: report.currentPhase,
    label: `${phaseName}:scout:${tick}`,
    provider: 'reporter',
    schema: SCOUT_SCHEMA,
    maxAttempts: 1,
  })

  // Scout timing is operational overhead, not part of the reviewed/fix agent timeline.
  report.timings = report.timings.filter(item => item.label !== `${phaseName}:scout:${tick}`)
  if (result === null) {
    report.scoutUpdates.push({ at: Date.now(), phase: phaseName, elapsedMs: Date.now() - phaseStartedAt, summary: 'Scout report unavailable.', observations: [] })
  } else {
    mergeNestedTimings(result.nestedAgents)
    report.scoutUpdates.push({ at: Date.now(), phase: phaseName, elapsedMs: Date.now() - phaseStartedAt, summary: result.summary, observations: result.observations })
  }
  if (publish) await updateReport(`${phaseName} scout report ${tick}`)
}

function waitForOperationOrDeadline(operationPromise, ms) {
  return new Promise(resolve => {
    let finished = false
    const settle = value => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => settle(false), ms)
    operationPromise.then(() => settle(true), () => settle(true))
  })
}

async function withPhaseScout(phaseName, operation) {
  const phaseStartedAt = Date.now()
  report.currentPhase = phaseName
  report.phaseStartedAt = phaseStartedAt
  report.status = `${phaseName} in progress`

  let settled = false
  const operationPromise = Promise.resolve().then(operation).finally(() => { settled = true })
  const scoutPromise = reportingAvailable ? (async () => {
    let tick = 1
    while (!settled && reportingAvailable) {
      const deadline = phaseStartedAt + tick * PR_REPORT_INTERVAL_MS
      const operationFinished = await waitForOperationOrDeadline(operationPromise, Math.max(0, deadline - Date.now()))
      if (operationFinished || settled) break
      try {
        await runScoutPass(phaseName, phaseStartedAt, tick)
      } catch (error) {
        log(`[${iso()}] [warn] ${phaseName} scout report ${tick} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      tick = Math.floor((Date.now() - phaseStartedAt) / PR_REPORT_INTERVAL_MS) + 1
    }
  })() : Promise.resolve()

  try {
    return await operationPromise
  } finally {
    await scoutPromise
  }
}

function expertPrompt(prNumber, expert) {
  return `/skill:pr-review PR #${prNumber}, but don't post inline comments — report your findings to the workflow supervisor instead.

${REPO_CONTEXT}

Provide actual evidence for every claim. Do not rely on unlikely hypotheticals. If unsure, search the codebase or fetch relevant docs. Return promptly after covering your assigned focus.

Your expert role: ${expert.role}
Your focus areas: ${expert.focus}

For every finding include severity, concise description, concrete failure scenario, and evidence. Identify it as found by your exact expert role.`
}

async function runYoloPanel(prNumber, round) {
  const roster = await timedAgent(`/skill:yolo-council-review Compose the tailored expert panel for PR #${prNumber}. Fetch the PR, linked issues, diff, original goal, and acceptance criteria. Choose 2-6 distinct, non-overlapping expert roles according to the skill. Return only the roster; do not spawn reviewers, synthesize findings, post to GitHub, or ask for approval.

${REPO_CONTEXT}`, {
    phase: 'Review',
    label: `r${round}:yolo:roster`,
    schema: ROSTER_SCHEMA,
    provider: 'supervisor',
  })
  if (roster === null) throw new Error(`Round ${round}: yolo council roster failed`)

  report.panel = roster.experts
  report.lastMilestone = 'Panel chosen'
  report.status = `Round ${round}: panel chosen`
  await updateReport(`round ${round} panel chosen`)
  log(`[${iso()}] Round ${round} panel chosen: ${roster.experts.map(expert => expert.role).join(', ')}`)

  const reports = await parallel(roster.experts.map(expert => () => timedAgent(expertPrompt(prNumber, expert), {
    phase: 'Review',
    label: `r${round}:yolo:${expert.role}`,
    provider: 'review',
  })))
  const completedReports = reports.map((result, index) => result ? { expert: roster.experts[index], result } : null).filter(Boolean)
  if (completedReports.length === 0) throw new Error(`Round ${round}: all yolo council reviewers failed`)

  const panel = await timedAgent(`/skill:yolo-council-review Synthesize these tailored expert reports for PR #${prNumber}. Critically verify evidence, fetch external documentation when needed, deduplicate overlaps, reconcile severity, and drop speculative findings. The panel already performed the primary exploration: adjudicate only material findings, disagreements, and evidence gaps; do not restart a broad review. Do not post to GitHub or ask for approval.

${REPO_CONTEXT}

${completedReports.map(({ expert, result }) => `### ${expert.role}\nFocus: ${expert.focus}\n${result}`).join('\n\n')}

Return only final structured findings with severity, area, file, concise description, concrete failureScenario, non-empty evidence, and all expert-role finders.`, {
    phase: 'Review',
    label: `r${round}:yolo:synthesis`,
    schema: PANEL_SCHEMA,
    provider: 'supervisor',
  })
  if (panel === null) throw new Error(`Round ${round}: yolo council synthesis failed`)
  log(`[${iso()}] Round ${round} panel synthesized ${panel.findings.length} finding(s): ${severityBreakdown(panel.findings)}`)
  return panel.findings
}

async function reviewAndJudge(reviewRound, { final = false } = {}) {
  return withPhaseScout(`Review round ${reviewRound}`, async () => {
    phase('Review')
    log(`[${iso()}] ${final ? `Post-fix verification review after round ${MAX_ROUNDS}` : `Round ${reviewRound}/${MAX_ROUNDS}: tailored yolo-council review`}`)

    const yoloFindings = await runYoloPanel(PR_NUMBER, reviewRound)
    phase('Judge')
    const judged = await timedAgent(`Judge this tailored yolo-council-review report for PR #${PR_NUMBER} (round ${reviewRound}).

${REPO_CONTEXT}

## YOLO-council-review findings
${JSON.stringify(yoloFindings, null, 2)}

Validate findings against evidence and reconcile severity conflicts. Fetch existing PR comments, prior review rounds, and linked follow-up issues. Drop a prior finding only when the current remote head proves it fixed or a linked issue explicitly defers it. done=true only if no blocker, major, or minor remains. Otherwise return every actionable finding; nits may be omitted. Preserve every source finder role.`, {
      schema: JUDGE_SCHEMA,
      label: `r${reviewRound}:judge`,
      provider: 'judge',
    })
    if (judged === null) throw new Error(`Round ${reviewRound}: judge failed`)
    if (!judged.done && judged.findings.length === 0) throw new Error(`Round ${reviewRound}: judge returned done=false with no actionable findings`)

    report.findings = judged.findings
    report.findingsStatus = judged.done ? 'clean' : 'actionable'
    report.lastMilestone = 'Review verdict'
    report.status = judged.done ? `Round ${reviewRound}: clean` : `Round ${reviewRound}: ${judged.findings.length} finding(s) to fix`
    await updateReport(`round ${reviewRound} review verdict`)

    log(`[${iso()}] Round ${reviewRound} verdict: ${judged.done ? 'clean — only nits remain' : `NOT done — ${judged.findings.length} actionable finding(s): ${severityBreakdown(judged.findings)}`}`)
    for (const finding of judged.findings) {
      log(`  - [${finding.severity}] [found by: ${finding.finders.join(', ')}] ${finding.area ? `(${finding.area}) ` : ''}${finding.file ? `${finding.file}: ` : ''}${finding.description}`)
    }
    return judged
  })
}

async function postReview(reviewRound, judged, { final = false } = {}) {
  const result = await timedAgent(`/skill:github-pr-review Post a review to PR #${PR_NUMBER} summarizing round ${reviewRound}'s verified findings, severity-ranked and sectioned by expert area, with complete finder attribution and inline comments where file/line evidence supports them. event: COMMENT.

${REPO_CONTEXT}

${final
  ? 'This is the post-fix verification after the round cap; no additional fix round runs automatically.'
  : judged.done
    ? 'State that only nits remain and the loop is stopping.'
    : `State that fixes will run for these ${judged.findings.length} finding(s).`}

Findings:
${JSON.stringify(judged.findings, null, 2)}`, { label: `r${reviewRound}:post` })
  if (result === null) throw new Error(`Round ${reviewRound}: failed to post review`)
  log(`[${iso()}] Round ${reviewRound}: review posted to PR #${PR_NUMBER}`)
}

async function runFix(round, findings) {
  const beforeFix = await timedAgent(`Fetch PR #${PR_NUMBER} from GitHub and return its current remote head commit SHA. Do not use a local branch SHA.

${REPO_CONTEXT}`, {
    label: `r${round}:fix:before-head`,
    schema: REMOTE_HEAD_SCHEMA,
    provider: 'judge',
  })
  if (beforeFix === null || !beforeFix.headSha) throw new Error(`Round ${round}: could not establish the remote PR head; refusing to dispatch fixes`)

  return withPhaseScout(`Fix round ${round}`, async () => {
    phase('Fix')
    log(`[${iso()}] Round ${round}: dispatching fixes for ${findings.length} finding(s) from ${beforeFix.headSha}`)
    const fixResult = await timedAgent(`/skill:orchestrate Resolve and verify these review findings on PR #${PR_NUMBER}'s branch. You are the final implementation orchestrator and verifier for this fix round.

${REPO_CONTEXT}

The remote PR head before this fix round is ${beforeFix.headSha}.

Requirements:
- Check out the actual PR branch and confirm its remote head before editing.
- Plan the partition before dispatching; no two parallel sub-agents may touch the same file.
- Use pi-subagents for child work so runtime timing artifacts are available to the progress scout.
- Keep child returns compact and save detailed reports/logs as artifacts.
- Review and integrate every child change and verify every finding.
- Run relevant tests, typecheck, lint, and project checks.
- Commit and push fixes to the PR branch.
- Query GitHub after pushing and confirm the remote head equals the pushed commit.
- Return every commit created during this fix round as { sha, title }.
- success=true only when all findings are resolved, checks pass, and the remote head changed from ${beforeFix.headSha}.
- Return only the requested compact structured result.

Findings to fix:
${JSON.stringify(findings, null, 2)}`, {
      label: `r${round}:fix:orchestrator`,
      schema: FIX_RESULT_SCHEMA,
      provider: 'orchestrator',
      maxAttempts: 1,
    })

    if (fixResult === null) throw new Error(`Round ${round}: fix orchestrator failed; refusing to start another review round`)
    if (fixResult.beforeHeadSha !== beforeFix.headSha) throw new Error(`Round ${round}: fix orchestrator worked from unexpected head ${fixResult.beforeHeadSha}; expected ${beforeFix.headSha}`)
    if (!fixResult.success || !fixResult.pushed || !fixResult.checksPassed) throw new Error(`Round ${round}: fix orchestrator did not verify a successful push: ${fixResult.summary}`)
    if (!fixResult.afterHeadSha || fixResult.afterHeadSha === beforeFix.headSha) throw new Error(`Round ${round}: remote PR head did not change after the fix round`)
    if (fixResult.resolvedFindingCount !== findings.length) throw new Error(`Round ${round}: fix orchestrator resolved ${fixResult.resolvedFindingCount}/${findings.length} findings`)
    if (!fixResult.commits.length) throw new Error(`Round ${round}: fix orchestrator returned no commits for a changed remote head`)

    const fixVerification = await timedAgent(`Independently verify the pushed result for PR #${PR_NUMBER} using GitHub, not the local checkout. Confirm the current remote head is exactly ${fixResult.afterHeadSha}, differs from ${beforeFix.headSha}, belongs to PR #${PR_NUMBER}, and that these commits exactly describe the pushed range:
${JSON.stringify(fixResult.commits, null, 2)}
Return verified=false on any mismatch.

${REPO_CONTEXT}`, {
      label: `r${round}:fix:verify-remote`,
      schema: FIX_VERIFICATION_SCHEMA,
      provider: 'judge',
    })
    if (fixVerification === null || !fixVerification.verified || fixVerification.headSha !== fixResult.afterHeadSha) {
      throw new Error(`Round ${round}: independent remote verification failed; refusing to start another review round`)
    }

    if (reportingAvailable) {
      try {
        await runScoutPass(`Fix round ${round}`, report.phaseStartedAt, 'final', { publish: false })
      } catch (error) {
        log(`[${iso()}] [warn] Final fix timing collection failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    report.commits = [...new Map([...report.commits, ...fixResult.commits].map(commit => [commit.sha, commit])).values()]
    report.checksPassed = fixResult.checksPassed
    report.finalSha = fixResult.afterHeadSha
    report.findingsStatus = 'fixed'
    report.lastMilestone = 'Fix verified'
    report.status = `Round ${round}: fix verified`
    await updateReport(`round ${round} fix verified`)
    log(`[${iso()}] Round ${round}: verified fixes committed and pushed at ${fixResult.afterHeadSha}`)
    return fixResult
  })
}

async function initializeReport() {
  if (!PR_REPORTING) return
  await updateReport('workflow started')
}

await initializeReport()
log(`[${iso()}] Starting lightweight YOLO review-fix loop for PR #${PR_NUMBER}, max ${MAX_ROUNDS} fix round(s), PR reporting ${PR_REPORTING ? `every ${PR_REPORT_INTERVAL_MINUTES}m` : 'disabled'}`)

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
  report.phaseStartedAt = Date.now()
  report.lastMilestone = 'Final outcome'
  report.status = verdict.done ? `Complete after ${round} round(s)` : `Stopped at round cap with ${verdict.findings.length} finding(s)`
  report.findings = verdict.findings
  report.findingsStatus = verdict.done ? 'clean' : 'actionable'
  await updateReport('final outcome')

  if (!verdict.done) {
    log(`[${iso()}] Hit the ${MAX_ROUNDS}-round cap with ${verdict.findings.length} finding(s) still open after post-fix verification — stopping for human triage.`)
  } else {
    log(`[${iso()}] Done after ${round} round(s) — only nits remain on PR #${PR_NUMBER}.`)
  }

  return { reportRunId: REPORT_RUN_ID, rounds: round, done: verdict.done, openFindings: verdict.findings, reportCommentId }
} catch (error) {
  report.currentPhase = 'Failed'
  report.phaseStartedAt = Date.now()
  report.status = 'Failed'
  report.lastMilestone = 'Workflow failed'
  report.failure = error instanceof Error ? error.message : String(error)
  await updateReport('workflow failed')
  log(`[${iso()}] Workflow failed after ${duration(Date.now() - report.startedAt)}: ${report.failure}`)
  throw error
}
