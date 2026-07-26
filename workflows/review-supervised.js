// Lightweight YOLO-only review/fix loop with persistent PR reporting.
// Claude Code: run as a dynamic workflow. codex-dynamic-workflows:
//   codex-workflow run workflows/review-supervised.js --config workflows-codex/codex-workflow.config.ts
//
// Written to the portable primitive subset both harnesses share — no imports, Date.now(), or
// Math.random() (Claude's workflow sandbox blocks them). All GitHub I/O, including rendering and
// timestamping the live PR report comment, is delegated to agents. Harness-specific routing and
// runner tuning (reporter/orchestrator/supervisor roles, timeouts, tool exclusions) lives in the
// codex provider config's label routes, not in this script; the model/effort hints on agents here
// apply to the Claude harness only.
//
// Cost/speed design notes:
// - The panel synthesis agent also judges (done + actionable findings). A separate judge pass
//   re-did the same evidence verification and paid the findings JSON one more round trip.
// - The expert roster is composed once and reused for later rounds — the PR doesn't change shape
//   between fix iterations of the same run.
// - Hitting the round cap triggers a targeted re-judge of the still-open findings against the
//   pushed head, not a fresh full-panel review round.
// - Fix milestones the grouper marks independent are implemented in parallel, each in its own git
//   worktree + temp branch (plain git commands, so it stays portable and honors repoPath), then one
//   integration agent cherry-picks the chains onto the PR branch and runs full validation.
// - Mechanical agents (checkout, push, remote verification, scouting, report writes) run on cheap
//   tiers; findings JSON is passed compact, never pretty-printed.
// - The round's PR review comment posts concurrently with the fix round it announces.
//
// PR identity is pinned, never guessed: prNumber is validated strictly, an up-front agent resolves
// it to its exact head branch (failing the run on any mismatch, before the first report write),
// and the checkout/push/verification agents cross-check that pin instead of re-resolving.

export const meta = {
  name: 'review-supervised',
  description: 'Loop a tailored yolo-council-review, judge findings, and orchestrate fixes until only nits remain (max 4 rounds)',
  whenToUse: 'Launch via the run-workflow skill, not directly — it preflights the working tree, which this workflow cannot do for itself. args MUST be an object: { prNumber: <positive integer>, repoSlug: "owner/name", repoPath: "/abs/path", allowDirtyTree: false, prReporting: true }. Passing a bare string ("5") makes prNumber undefined. There is no baseBranch arg: the PR determines its own head branch.',
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
const ARGS = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { throw new Error('args arrived as a string that is not valid JSON') } })()
  : args
if (ARGS == null || typeof ARGS !== 'object') throw new Error('args must be an object like { prNumber: 123 }')
// Exact integer, or an all-digits string from a harness that stringifies numbers. Anything else
// fails here — the workflow never lets an agent guess which PR was meant.
const PR_NUMBER = typeof ARGS.prNumber === 'string' && /^[0-9]+$/.test(ARGS.prNumber) ? Number(ARGS.prNumber) : ARGS.prNumber
if (!Number.isInteger(PR_NUMBER) || PR_NUMBER < 1) throw new Error(`prNumber must be a positive integer (got ${JSON.stringify(ARGS.prNumber)})`)
const REPO_SLUG = ARGS.repoSlug
// The user's own checkout. Read-only: the source `git worktree add` runs from, and where gh
// lookups happen before a worktree exists. Nothing here may move its HEAD or touch its tree.
const REPO_PATH = ARGS.repoPath
// Explicit acknowledgement that the checkout has uncommitted changes and the run may proceed
// anyway. Absent, a dirty tree is refused rather than silently stashed. issue-to-pr must forward
// this to its review child: that nested call is non-interactive, so a refusal there would abort
// the run after the PR is already open.
const ALLOW_DIRTY_TREE = ARGS.allowDirtyTree === true
// There is deliberately no baseBranch arg. This workflow works from a PR number alone -- the PR
// determines its own head branch, so there is nothing to resolve and nothing to confirm.

// Built per-path, not once: after setup every prompt must point agents at the run's worktree
// rather than the user's checkout. A single top-level const would keep saying "cd to REPO_PATH".
const repoContext = (path) => (REPO_SLUG || path)
  ? `Repo context: ${path ? `local checkout at ${path} (cd there for git operations)` : ''}${path && REPO_SLUG ? ', ' : ''}${REPO_SLUG ? `GitHub repo ${REPO_SLUG} (pass --repo ${REPO_SLUG} to every gh subcommand that accepts it — do not rely on cwd's default remote). \`gh api\` has no --repo flag and resolves the {owner}/{repo} placeholders from the cwd's remote, so spell the repo out in the path instead: repos/${REPO_SLUG}/...` : ''}.`
  : ''
// Reassigned once the run's worktree exists; every prompt after setup picks up the new value.
let REPO_CONTEXT = repoContext(REPO_PATH)

// The diff range the panel reviews, pinned from the repository itself rather than left to each
// agent. Set once the worktree exists (see setup:diff-range) and read at prompt-build time.
//
// Why this is not left to `gh pr diff`: GitHub caches a PR's merge base and does not always
// recompute it when the base branch advances. When it goes stale, `gh pr diff` returns commits
// that are already merged into the base as though they were the PR's own work, and the panel
// spends the review on code nobody proposed. A merge-base computed locally is ground truth, and
// stays correct whether or not the branch is behind its base.
let DIFF_CONTEXT = ''
const diffContext = (mergeBaseSha, headSha) => `Authoritative diff for this PR: the range \`${mergeBaseSha}...${headSha}\`. Read it from the run's worktree — \`git diff ${mergeBaseSha}...${headSha}\` for the change, \`git log ${mergeBaseSha}..${headSha}\` for its commits. Do NOT use \`gh pr diff\` or GitHub's "Files changed" view to decide what this PR changed: GitHub's cached merge base goes stale when the base branch advances, so both can present already-merged base commits as this PR's work. Anything outside that range is not this PR's change — do not review it and do not raise findings against it.`

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
// The marker keeps its pre-rename value on purpose: it is how the report agent finds the existing
// report comment on a PR, so changing it would orphan comments posted by earlier runs and create a
// duplicate report instead of editing the old one in place.
const REPORT_MARKER = '<!-- review-lite-workflow-report -->'
const REPORT_RUN_ID = `review-supervised-pr${PR_NUMBER}`

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
    // Root-cause classification from the council skills' design-soundness lens. Optional here so
    // agents that only regroup findings (rather than judge them) are not forced to invent one.
    rootCause: { type: 'string', enum: ['local-bug', 'wrong-seam'] },
    // One-sentence invariant the finding is really protecting. Required by the skill for any
    // wrong-seam finding; a wrong-seam cluster that cannot name its invariant is a local-bug.
    invariant: { type: 'string' },
  },
  required: ['severity', 'description', 'failureScenario', 'evidence', 'finders'],
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

const PR_RESOLVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    found: { type: 'boolean' },
    number: { type: 'number' },
    headRefName: { type: 'string' },
    baseRefName: { type: 'string' },
    headSha: { type: 'string' },
    state: { type: 'string' },
    // True when the head branch lives in a fork rather than this repository. The fix rounds push, so
    // this decides whether the run can proceed at all — see the refusal below.
    isCrossRepository: { type: 'boolean' },
  },
  required: ['found'],
}

const CHECKOUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    branch: { type: 'string', minLength: 1 },
    headSha: { type: 'string', minLength: 1 },
  },
  required: ['branch', 'headSha'],
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
          // True only when the milestone shares no file/concern with any other milestone — it
          // gates whether the milestone is implemented in a parallel worktree chain.
          independent: { type: 'boolean' },
          findings: { type: 'array', minItems: 1, items: FINDING_ITEM_SCHEMA },
        },
        required: ['title', 'independent', 'findings'],
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

const INTEGRATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    commits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sha: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
        },
        required: ['sha', 'title'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['success', 'commits', 'summary'],
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
    // Tri-state, not boolean: the push agent reports immediately after pushing, when CI has
    // usually only just been queued — forcing true/false there would report "not passing" for
    // checks that merely haven't finished.
    checksStatus: { type: 'string', enum: ['passed', 'failed', 'pending'] },
    summary: { type: 'string' },
  },
  required: ['success', 'headSha', 'checksStatus', 'summary'],
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
  checksStatus: null,
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
// Scout budget. Per-pass cost is controlled by routing scouts to a cheap tier and by skipping the
// report write when a pass observed nothing new, but the binding constraint is a *count*, not a
// cost: a workflow may spawn at most 1000 agents, and every scout pass is one agent plus (usually) a
// second for the report write it triggers. A per-phase-only cap multiplies by the number of phases —
// 4 review rounds + 4 fix rounds + 1 verification at 60 each is ~540 scouts and ~540 report writes,
// which exhausts the cap on telemetry alone and starves the actual review.
//
// So the run-wide total is the real limit and the per-phase cap only stops one long phase from
// eating it. Both are logged when hit; a silently truncated trail reads as "nothing was happening".
const MAX_SCOUT_TICKS_PER_PHASE = 20
const MAX_SCOUT_TICKS_TOTAL = 80
let scoutTicksUsed = 0

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
    '## Review-supervised workflow report',
    '',
    // Bullets, not bare lines: GitHub joins consecutive plain lines into one paragraph.
    `- **Status:** ${report.status}`,
    `- **Phase:** ${report.currentPhase} · **Last milestone:** ${report.lastMilestone}`,
    `- **Head:** ${report.startingSha || '_unknown_'} → ${report.finalSha || '_no verified fix yet_'}`,
    report.checksStatus === null ? null : `- **Checks:** ${{ passed: 'passed', failed: 'not passing', pending: 'pending' }[report.checksStatus] || report.checksStatus}`,
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

1. Write the body to a scratch file, e.g. /tmp/review-supervised-report-${PR_NUMBER}.md. Use a heredoc quoted as <<'MARKDOWN' so the shell expands nothing inside it.
${reportCommentId
  ? `2. Edit comment id ${reportCommentId} in place:
   \`gh api -X PATCH ${GH_API_REPO}/issues/comments/${reportCommentId} -F body=@/tmp/review-supervised-report-${PR_NUMBER}.md\`
   Do not list the PR's comments and do not create a new one — that id is known to be correct.`
  : `2. Find the existing report comment:
   \`gh api --paginate ${GH_API_REPO}/issues/${PR_NUMBER}/comments --jq '.[] | select(.body | contains("${REPORT_MARKER}")) | .id'\`
   If that prints an id, edit it in place:
   \`gh api -X PATCH ${GH_API_REPO}/issues/comments/<id> -F body=@/tmp/review-supervised-report-${PR_NUMBER}.md\`
   If it prints nothing, create the comment:
   \`gh pr comment ${PR_NUMBER}${GH_REPO_FLAG} --body-file /tmp/review-supervised-report-${PR_NUMBER}.md\`
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
      // The body arrives pre-rendered, so this agent only copies it through and runs two gh
      // commands — the cheapest tier handles that. The verify step above plus the 3-failure
      // fallback below guard against a botched post.
      model: 'haiku',
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

// phaseName is the human label shown in the PR report ("Fix round 2"); phaseGroup is the declared
// meta.phases title the agent is filed under in /workflows. They are separate on purpose: using the
// per-round label as the progress group spawns a fresh, one-agent group box for every round.
async function runScoutPass(phaseName, phaseGroup, tick, isSettled) {
  // The full findings list only orients the scout; re-sending it on every tick pays for the same
  // JSON dozens of times per phase. After the first pass a count is enough.
  const findingsContext = tick === 1
    ? `Current actionable findings:
${report.findings.length ? report.findings.map(finding => `- [${finding.severity}] ${finding.file ? `${finding.file}: ` : ''}${truncate(finding.description, MAX_DESCRIPTION_CHARS)}`).join('\n') : '- none'}`
    : `Actionable findings currently being addressed: ${report.findings.length}.`

  const result = await agent(`Act as a read-only progress scout for review-supervised PR #${PR_NUMBER}. This is progress report ${tick} during ${phaseName}.

${REPO_CONTEXT}

Inspect the actual checkout and any relevant sub-agent artifacts or runtime metadata created during ${phaseName}. During review, focus on observable panel/reviewer activity. During fixes, also inspect git status, changed files and diff statistics, relevant source/tests, running checks, commits, and the remote PR head. Do not edit files, commit, push, post to GitHub, or claim partial work is complete. Report only factual observations; omit anything uncertain.

Known panel: ${report.panel.length ? report.panel.map(expert => expert.role).join(', ') : 'not chosen yet'}

${findingsContext}

Return a summary of at most ${MAX_SUMMARY_CHARS} characters and at most ${MAX_SCOUT_OBSERVATIONS} observations of at most ${MAX_OBSERVATION_CHARS} characters each. Anything longer is truncated.`, {
    phase: phaseGroup,
    label: `${phaseName}:scout:${tick}`,
    schema: SCOUT_SCHEMA,
    // Observing and describing state is a cheap job, and it runs continuously for the whole phase.
    // Keep the tier low so full-duration visibility does not cost reasoning-model tokens.
    // (codex routes `*:scout:*` to its own cheap `reporter` role and ignores these.)
    model: 'haiku',
    effort: 'low',
  })

  // A failed pass has nothing worth publishing — paying a report write to post "unavailable" would
  // only add noise. The caller's failure counter handles repeated failures.
  if (result === null) {
    log(`${phaseName}: scout pass ${tick} returned nothing — skipping the report write`)
    return false
  }

  // The phase can finish while this pass was in flight — a "yep, it's done" observation only
  // duplicates the completion report that's about to be written, so drop it rather than post it.
  if (isSettled()) {
    log(`${phaseName}: scout pass ${tick} finished after the phase settled — dropping its (now redundant) observation`)
    return true
  }

  // The schema no longer caps these (a cap there fails the whole call); enforce the size here.
  const next = {
    summary: truncate(result.summary, MAX_SUMMARY_CHARS),
    observations: result.observations.slice(0, MAX_SCOUT_OBSERVATIONS).map(observation => truncate(observation, MAX_OBSERVATION_CHARS)),
  }

  // Each report write pays the full rendered body twice (prompt + output). A quiet stretch of a
  // long fix phase would otherwise rewrite an identical comment every tick.
  const last = report.scoutUpdates[report.scoutUpdates.length - 1]
  if (last && last.phase === phaseName && last.summary === next.summary && JSON.stringify(last.observations) === JSON.stringify(next.observations)) {
    log(`${phaseName}: scout pass ${tick} observed nothing new — skipping the report write`)
    return true
  }

  report.scoutUpdates.push({ phase: phaseName, tick, ...next })
  await updateReport(`${phaseName} scout report ${tick}`)
  return true
}

// Runs scout passes back-to-back while the operation is in flight — each pass is an agent run that
// takes minutes, which provides the pacing (no script-side timers; they are not portable).
// phaseGroup must be one of meta.phases' titles — scouts are filed under it so they join the phase
// they are observing instead of each round opening its own group. report.currentPhase keeps the
// per-round label, which is what the PR report body wants to show.
async function withPhaseScout(phaseName, phaseGroup, operation) {
  report.currentPhase = phaseName
  report.status = `${phaseName} in progress`

  let settled = false
  let scoutFailures = 0
  const operationPromise = Promise.resolve().then(operation).finally(() => { settled = true })
  const scoutPromise = reportingAvailable ? (async () => {
    let tick = 1
    while (!settled && reportingAvailable && scoutFailures < 3 && tick <= MAX_SCOUT_TICKS_PER_PHASE && scoutTicksUsed < MAX_SCOUT_TICKS_TOTAL) {
      scoutTicksUsed++
      try {
        scoutFailures = (await runScoutPass(phaseName, phaseGroup, tick, () => settled)) ? 0 : scoutFailures + 1
      } catch (error) {
        scoutFailures++
        log(`[warn] ${phaseName} scout report ${tick} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      tick++
    }
    // Never truncate the trail silently — "no more observations" and "the budget ran out" look
    // identical in the PR report otherwise.
    if (!settled && reportingAvailable && scoutFailures < 3) {
      if (scoutTicksUsed >= MAX_SCOUT_TICKS_TOTAL) {
        log(`${phaseName}: run-wide scout budget (${MAX_SCOUT_TICKS_TOTAL} passes) exhausted — the phase continues, but no further progress observations will be posted for the rest of the run`)
      } else if (tick > MAX_SCOUT_TICKS_PER_PHASE) {
        log(`${phaseName}: per-phase scout cap (${MAX_SCOUT_TICKS_PER_PHASE} passes) reached — the phase continues without further progress observations`)
      }
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

${DIFF_CONTEXT}

Provide actual evidence for every claim. Do not rely on unlikely hypotheticals. If unsure, search the codebase or fetch relevant docs. Return promptly after covering your assigned focus.

Your expert role: ${expert.role}
Your focus areas: ${expert.focus}

For every finding include severity, concise description, concrete failure scenario, and evidence. Identify it as found by your exact expert role.`
}

// The tailored panel doesn't change shape between fix iterations of the same PR, so the roster
// agent (and its full PR/diff/issues fetch) runs once and later rounds reuse the result.
let cachedRoster = null

async function runYoloPanel(prNumber, round) {
  let roster = cachedRoster
  if (roster) {
    log(`Round ${round}: reusing the round-1 panel: ${roster.experts.map(expert => expert.role).join(', ')}`)
  } else {
    roster = await agent(`Follow the yolo-council-review skill to compose the tailored expert panel for PR #${prNumber}. Fetch the PR, linked issues, diff, original goal, and acceptance criteria. Choose 2-6 distinct, non-overlapping expert roles according to the skill. Return only the roster; do not spawn reviewers, synthesize findings, post to GitHub, or ask for approval.

${REPO_CONTEXT}

${DIFF_CONTEXT}`, {
      phase: 'Review',
      label: `r${round}:yolo:roster`,
      schema: ROSTER_SCHEMA,
    })
    if (roster === null) throw new Error(`Round ${round}: yolo council roster failed`)
    cachedRoster = roster

    report.panel = roster.experts
    report.lastMilestone = 'Panel chosen'
    report.status = `Round ${round}: panel chosen`
    await updateReport(`round ${round} panel chosen`)
    log(`Round ${round} panel chosen: ${roster.experts.map(expert => expert.role).join(', ')}`)
  }

  const reports = await parallel(roster.experts.map(expert => () => agent(expertPrompt(prNumber, expert), {
    phase: 'Review',
    label: `r${round}:yolo:${expert.role}`,
  })))
  const completedReports = reports.map((result, index) => result ? { expert: roster.experts[index], result } : null).filter(Boolean)
  if (completedReports.length === 0) throw new Error(`Round ${round}: all yolo council reviewers failed`)

  // Synthesis and judging are one agent: a separate judge re-verified the same evidence the
  // synthesizer just verified, with the findings JSON paid through one extra round trip.
  phase('Judge')
  const judged = await agent(`Follow the yolo-council-review skill to synthesize these tailored expert reports for PR #${prNumber}, then judge the result (round ${round}). Critically verify evidence, fetch external documentation when needed, deduplicate overlaps, reconcile severity, and drop speculative findings. The panel already performed the primary exploration: adjudicate only material findings, disagreements, and evidence gaps; do not restart a broad review. Also fetch existing PR comments, prior review rounds, and linked follow-up issues; drop a prior finding only when the current remote head proves it fixed or a linked issue explicitly defers it. Do not post to GitHub or ask for approval.

${REPO_CONTEXT}

${DIFF_CONTEXT}

Drop any finding whose evidence sits outside the diff range above — it belongs to code already merged into the base branch, not to this PR.

${completedReports.map(({ expert, result }) => `### ${expert.role}\nFocus: ${expert.focus}\n${result}`).join('\n\n')}

Set done=true only if no blocker, major, or minor remains. Otherwise return every actionable finding with severity, area, file, concise description, concrete failureScenario, non-empty evidence, and all expert-role finders; nits may be omitted.

Apply the skill's mandatory root-cause classification before returning: cluster the surviving findings by shared root cause and set 'rootCause' on every finding to 'local-bug' or 'wrong-seam'. Every 'wrong-seam' finding must also carry 'invariant' — the one-sentence invariant that has no single owner. Do not downgrade a cluster to 'local-bug' because the patch would be smaller or the round is late.`, {
    phase: 'Judge',
    label: `r${round}:yolo:judge`,
    schema: JUDGE_SCHEMA,
  })
  if (judged === null) throw new Error(`Round ${round}: yolo council synthesis/judge failed`)
  if (!judged.done && judged.findings.length === 0) throw new Error(`Round ${round}: judge returned done=false with no actionable findings`)
  return judged
}

async function reviewAndJudge(reviewRound) {
  // Scouts file under Review even though the operation ends in Judge: they spend nearly all of
  // their passes watching the panel, and splitting them across two groups would fragment the trail.
  return withPhaseScout(`Review round ${reviewRound}`, 'Review', async () => {
    phase('Review')
    log(`Round ${reviewRound}/${MAX_ROUNDS}: tailored yolo-council review`)

    const judged = await runYoloPanel(PR_NUMBER, reviewRound)

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

// Post-fix verification once the round cap is hit. A fresh full-panel round at that point would be
// the single most expensive phase re-run only to answer a narrow question — whether the findings
// that were still open got fixed — so this re-judges exactly those findings against the pushed head.
async function finalReJudge(verificationRound, openFindings) {
  return withPhaseScout(`Verification round ${verificationRound}`, 'Judge', async () => {
    phase('Judge')
    log(`Post-fix verification after round ${MAX_ROUNDS}: re-judging ${openFindings.length} finding(s) against the pushed head`)

    const judged = await agent(`Verify the post-fix state of PR #${PR_NUMBER}. The fix-round cap is reached, so this is a targeted verification of previously-open findings, not a fresh review.

${REPO_CONTEXT}

Previously-open findings:
${JSON.stringify(openFindings)}

For each finding, inspect the current remote head${report.finalSha ? ` (expected ${report.finalSha})` : ''}, the commits pushed since the finding was raised, existing PR comments, and linked follow-up issues, and decide whether it is genuinely resolved. Drop a finding only when the remote head proves it fixed or a linked issue explicitly defers it. Set done=true only if no blocker, major, or minor remains. Otherwise return every still-open actionable finding unchanged in substance; preserve every source finder role.`, {
      label: `r${verificationRound}:final-judge`,
      schema: JUDGE_SCHEMA,
    })
    if (judged === null) throw new Error('Post-fix verification: judge failed')
    if (!judged.done && judged.findings.length === 0) throw new Error('Post-fix verification: judge returned done=false with no actionable findings')

    report.findings = judged.findings
    report.findingsStatus = judged.done ? 'clean' : 'actionable'
    report.lastMilestone = 'Post-fix verification'
    report.status = judged.done ? 'Post-fix verification: clean' : `Post-fix verification: ${judged.findings.length} finding(s) still open`
    await updateReport('post-fix verification verdict')

    log(`Post-fix verification verdict: ${judged.done ? 'clean — only nits remain' : `NOT done — ${judged.findings.length} finding(s) still open: ${severityBreakdown(judged.findings)}`}`)
    return judged
  })
}

// Posting the verdict is reporting, not workflow state — a flaky gh call must never mark the run
// Failed (least of all after fixes are already pushed and verified), so failures warn here instead
// of throwing at any call site.
async function postReview(reviewRound, judged, { final = false } = {}) {
  try {
    const result = await agent(`Follow the github-pr-review skill to post a review to PR #${PR_NUMBER} summarizing round ${reviewRound}'s verified findings, severity-ranked and sectioned by expert area, with complete finder attribution. Put every finding in one consolidated review body and do not post inline comments. Include a resolution plan grouped into coherent chunks sized for one agent to implement and validate; each chunk must state its scope, dependencies, acceptance criteria, and focused validation. event: COMMENT.

${REPO_CONTEXT}

${final
  ? 'This is the post-fix verification after the round cap; no additional fix round runs automatically.'
  : judged.done
    ? 'State that only nits remain and the loop is stopping.'
    : `State that fixes will run for these ${judged.findings.length} finding(s).`}

Findings:
${JSON.stringify(judged.findings)}`, {
      // Explicit: this call is deliberately not awaited before runFix starts, so by the time it
      // spawns the global phase() has usually already moved to Fix — and the verdict post would be
      // filed under the fix round it announces rather than the judgement it reports.
      phase: 'Judge',
      label: `r${reviewRound}:post`,
    })
    if (result === null) throw new Error('post agent failed')
    log(`Round ${reviewRound}: review posted to PR #${PR_NUMBER}`)
  } catch (error) {
    log(`[warn] Round ${reviewRound}: review post failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function actionableFix(findings) {
  return findings.filter(finding => finding.severity !== 'nit')
}

// The review-gate and serial/parallel milestone helpers below are mirrored (with PR-fix-specific
// contracts: findings JSON, commit-sha tracking for push verification) in
// workflows/supervised-implement.js. The sandbox has no imports and workflow() nesting is
// one level deep — already spent by issue-to-pr — so the shape is duplicated deliberately;
// propagate structural changes to the twin by hand.
async function requestFixReview(label, subject, context) {
  const review = await agent(`Act as an independent correctness reviewer verifying a fix for ${subject}, per the supervised-forge skill's review-gate contract. You did not write this fix and have no prior context beyond this message. Inspect the actual commit(s) on the branch yourself — do not trust the implementer's own description of what changed. Confirm the original findings are genuinely resolved and no regression was introduced. Report concrete findings with evidence and exact file references; return no findings if it's clean.

${REPO_CONTEXT}

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
// Each review pass returns fresh finding objects that can't be identity-matched to the previous
// pass's, so a per-finding "fixed" count would count anything still open twice. The gate therefore
// reports fix rounds run + findings still open.
async function runFixReviewGate(label, subject, context, fixPromptPrefix) {
  let findings = actionableFix(await requestFixReview(label, subject, context))
  const fixCommits = []
  let round = 0
  while (findings.length && round < MAX_FIX_ROUNDS_PER_GATE) {
    round++
    const fix = await agent(`${fixPromptPrefix}

${REPO_CONTEXT}

Findings to resolve:
${JSON.stringify(findings)}

Rerun the relevant validation and commit your fixes with a message starting "${label} fix r${round}:". Return the commit sha.`, {
      label: `${label}:fix:r${round}`,
      schema: FIX_COMMIT_SCHEMA,
      agentType: 'general-purpose',
    })
    if (fix === null) throw new Error(`${label}: fix round ${round} failed`)
    fixCommits.push(fix.commitSha)
    findings = actionableFix(await requestFixReview(`${label}:r${round}`, subject, `${context}

Fix round ${round} has since committed fixes for earlier findings on top — review the current state including those fix-up commits, not just any originally-cited commit.`))
  }
  if (findings.length) {
    log(`${subject}: ${findings.length} finding(s) still open after ${round} fix round(s) — proceeding with residual risk`)
  }
  return { fixRounds: round, openFindings: findings, fixCommits }
}

// Serial milestone: implement and gate directly on the PR branch in the run's worktree.
async function runSerialMilestone(branch, tag, milestone) {
  const impl = await agent(`On branch ${branch} (PR #${PR_NUMBER}), resolve this review milestone "${milestone.title}".

${REPO_CONTEXT}

Findings to resolve:
${JSON.stringify(milestone.findings)}

Run the relevant tests, lint, typecheck, and other validation. Commit your work with a message starting "Fix ${tag}: ${milestone.title}". Return the commit sha, a concise summary, and the raw validation command output.`, {
    label: `${tag}:implement`,
    schema: IMPLEMENT_SCHEMA,
    agentType: 'general-purpose',
  })
  if (impl === null) throw new Error(`Fix milestone ${tag} implementation failed`)
  const commits = [{ sha: impl.commitSha, title: `Fix ${tag}: ${milestone.title}` }]

  const gate = await runFixReviewGate(tag,
    `fix milestone ${tag} ("${milestone.title}") on PR #${PR_NUMBER} branch ${branch}, commit ${impl.commitSha} plus any fix-up commits on top of it`,
    `Original findings this milestone was meant to resolve:
${JSON.stringify(milestone.findings)}

Raw validation output from the implementer:
${impl.validationOutput}`,
    `On branch ${branch}, resolve these findings for fix milestone "${milestone.title}" (PR #${PR_NUMBER}).`)
  for (const sha of gate.fixCommits) commits.push({ sha, title: `Fix ${tag} follow-up: ${milestone.title}` })
  log(`${tag}: fix review gate ${gate.openFindings.length ? `left ${gate.openFindings.length} open finding(s)` : 'clean'} after ${gate.fixRounds} fix round(s)`)
  return { commits, openFindings: gate.openFindings }
}

// Parallel milestone: the whole implement + review-gate chain runs on its own temp branch in a git
// worktree the agents create with plain git commands (portable across harnesses, and correct even
// when the workflow's cwd is not the target checkout — repoPath decides where the repo is). The
// chain's commits are cherry-picked onto the PR branch by the integration agent afterwards.
async function runParallelMilestone(branch, baseSha, tag, milestone) {
  const chainBranch = `rfl/pr${PR_NUMBER}/${tag}`
  const impl = await agent(`Resolve review milestone "${milestone.title}" for PR #${PR_NUMBER}. Other milestones are being fixed in parallel, so do not touch branch ${branch} or this run's worktree at ${WORKTREE_PATH}: run \`git worktree add <fresh temp dir> -b ${chainBranch} ${baseSha}\` and do all work inside that worktree. If ${chainBranch} is left over from an aborted run, delete it first (\`git branch -D ${chainBranch}\`; if that fails because a stale worktree still has it checked out, find it with \`git worktree list\`, \`git worktree remove --force\` it, then delete the branch). If a git command fails with a lock (index.lock) error, another parallel agent is mid-operation — wait a moment and retry.

${REPO_CONTEXT}

Findings to resolve:
${JSON.stringify(milestone.findings)}

Run whatever validation is feasible inside the worktree (set up dependencies there if the project needs them); full-project validation runs again at integration. Commit your work with a message starting "Fix ${tag}: ${milestone.title}", then run \`git worktree remove --force <that dir>\` (the branch and its commits survive) and return the commit sha, a concise summary, and the raw validation command output.`, {
    label: `${tag}:implement`,
    schema: IMPLEMENT_SCHEMA,
    agentType: 'general-purpose',
  })
  if (impl === null) throw new Error(`Fix milestone ${tag} implementation failed`)

  const gate = await runFixReviewGate(tag,
    `fix milestone ${tag} ("${milestone.title}") on temp branch ${chainBranch} (parallel fix chain for PR #${PR_NUMBER})`,
    `The chain's commits live on branch ${chainBranch}, based on ${baseSha}. Inspect them read-only from the run's worktree at ${WORKTREE_PATH} (e.g. git log/diff ${baseSha}..${chainBranch}) — do not check that branch out.

Original findings this milestone was meant to resolve:
${JSON.stringify(milestone.findings)}

Raw validation output from the implementer:
${impl.validationOutput}`,
    `Resolve these findings for fix milestone "${milestone.title}" (PR #${PR_NUMBER}) on temp branch ${chainBranch}. Other milestones are being fixed in parallel, so do not touch this run's worktree at ${WORKTREE_PATH}: run \`git worktree add <fresh temp dir> ${chainBranch}\` (if that fails because ${chainBranch} is checked out in a stale worktree from an earlier failed attempt, \`git worktree list\` and \`git worktree remove --force\` the stale one first; on a git lock error, another parallel agent is mid-operation — wait a moment and retry), do all work inside that worktree, and run \`git worktree remove --force <that dir>\` after committing.`)
  return { tag, milestone, chainBranch, openFindings: gate.openFindings, fixRounds: gate.fixRounds }
}

async function runFix(round, findings) {
  return withPhaseScout(`Fix round ${round}`, 'Fix', async () => {
    phase('Fix')

    // One mechanical agent establishes both the local checkout and the verified remote head.
    const checkout = await agent(`Sync PR #${PR_NUMBER}'s branch inside the run's worktree at ${WORKTREE_PATH} (cd there first; never operate in the user's checkout). Its head branch was already resolved as ${PR_BRANCH}: run \`gh pr view ${PR_NUMBER}${GH_REPO_FLAG} --json number,headRefName,headRefOid\` yourself, and if it fails or reports a different number or branch, return exactly what it reported and stop — never fall back to another PR or branch. Otherwise fetch, check out ${PR_BRANCH}, and confirm the local HEAD equals the PR's current remote head; if they differ, hard-reset the local branch to the remote head. Do not edit or commit anything. Return the branch name exactly as headRefName reports it and the remote head sha as reported by GitHub — never a local-only sha.

${REPO_CONTEXT}`, {
      label: `r${round}:fix:checkout`,
      schema: CHECKOUT_SCHEMA,
      agentType: 'general-purpose',
      model: 'haiku',
      effort: 'low',
    })
    if (checkout === null || !checkout.branch || !checkout.headSha) throw new Error(`Round ${round}: could not check out PR #${PR_NUMBER}'s branch at a verified remote head; refusing to dispatch fixes`)
    if (checkout.branch !== PR_BRANCH) throw new Error(`Round ${round}: checkout reported branch "${checkout.branch}" but PR #${PR_NUMBER} is pinned to ${PR_BRANCH} — refusing to dispatch fixes`)
    const branch = checkout.branch
    const baseSha = checkout.headSha
    if (!report.startingSha) report.startingSha = baseSha
    log(`Round ${round}: dispatching fixes for ${findings.length} finding(s) from ${baseSha}`)

    const grouped = await agent(`Group these PR #${PR_NUMBER} review findings into cohesive fix milestones sized for one agent to complete in one focused implementation-and-validation run. Each milestone must own one coherent responsibility and produce a reviewable diff. Batch findings that share a root cause, invariant, or dependency boundary; split work that spans unrelated subsystems or requires broad repository context; merge fragments that cannot be implemented or validated independently. Order dependent milestones explicitly and do not create catch-all milestones such as "address remaining findings." Mark a milestone independent=true only when fixing it will not touch any file or concern that any other milestone touches — independent milestones are implemented in parallel and then merged, so when in doubt use independent=false. Return each milestone's exact findings unchanged (do not drop or reword them); do not implement anything yet.

${REPO_CONTEXT}

Findings:
${JSON.stringify(findings)}`, {
      label: `r${round}:fix:group`,
      schema: GROUP_SCHEMA,
      // Light judgment, but the independent flags gate parallel execution and a wrong "true"
      // costs an integration conflict — keep it one tier above the cheapest.
      model: 'sonnet',
      effort: 'low',
    })
    if (grouped === null || !grouped.milestones.length) throw new Error(`Round ${round}: could not group findings into fix milestones`)

    const entries = grouped.milestones.map((milestone, index) => ({ milestone, tag: `r${round}.${index + 1}` }))
    const parallelEntries = entries.filter(entry => entry.milestone.independent)
    // One independent milestone gains nothing from worktree indirection — parallelism needs two.
    const runInParallel = parallelEntries.length >= 2
    const serialEntries = runInParallel ? entries.filter(entry => !entry.milestone.independent) : entries
    log(`Round ${round}: grouped into ${entries.length} fix milestone(s)${runInParallel ? ` — ${parallelEntries.length} in parallel worktree chains, ${serialEntries.length} serial` : ''}`)

    const commits = []
    const stillOpen = []

    if (runInParallel) {
      const chains = await parallel(parallelEntries.map(entry => () => runParallelMilestone(branch, baseSha, entry.tag, entry.milestone)))
      if (chains.some(chain => chain === null)) throw new Error(`Round ${round}: a parallel fix milestone failed`)
      for (const chain of chains) {
        stillOpen.push(...chain.openFindings)
        log(`${chain.tag}: fix review gate ${chain.openFindings.length ? `left ${chain.openFindings.length} open finding(s)` : 'clean'} after ${chain.fixRounds} fix round(s)`)
      }

      const integrated = await agent(`On branch ${branch} (PR #${PR_NUMBER}) in the run's worktree at ${WORKTREE_PATH}, integrate these parallel fix chains by cherry-picking each chain's range onto ${branch}, in the order listed:
${chains.map(chain => `- ${chain.tag} "${chain.milestone.title}": git cherry-pick ${baseSha}..${chain.chainBranch}`).join('\n')}

${REPO_CONTEXT}

The chains were all built from ${baseSha} against concerns judged disjoint, so conflicts should be rare; resolve any that appear in the spirit of the original findings rather than aborting:
${JSON.stringify(findings)}

After integrating, run the project's full validation (tests, lint, typecheck as applicable) on ${branch}. Do not push. Delete the temp chain branches (git branch -D) only after validation passes — they are the only copy of each chain's work until then. If a cherry-pick proves impossible or validation fails, leave the chain branches in place and restore the branch before returning (\`git cherry-pick --abort\` if one is in progress, then \`git reset --hard ${baseSha}\`), and return success=false with the reason. On success return success=true plus every commit (sha and title) now in ${baseSha}..HEAD, oldest first — cherry-picking rewrites shas, so report the shas actually on ${branch}.`, {
        label: `r${round}:fix:integrate`,
        schema: INTEGRATE_SCHEMA,
        agentType: 'general-purpose',
        // Cross-chain conflict resolution plus full validation — worth a strong tier, but not the
        // session default. (codex routes `*:fix:integrate` to the same tier its opus alias maps to.)
        model: 'opus',
      })
      if (integrated === null || !integrated.success || !integrated.commits.length) throw new Error(`Round ${round}: parallel fix integration failed${integrated ? `: ${integrated.summary}` : ''}`)
      commits.push(...integrated.commits)
      log(`Round ${round}: integrated ${parallelEntries.length} parallel chain(s) as ${integrated.commits.length} commit(s) on ${branch}`)
    }

    for (const entry of serialEntries) {
      const result = await runSerialMilestone(branch, entry.tag, entry.milestone)
      commits.push(...result.commits)
      stillOpen.push(...result.openFindings)
    }

    if (stillOpen.length) {
      log(`Round ${round}: ${stillOpen.length} finding(s) still open after all fix milestones — pushing regardless; they'll resurface in the next review round`)
    }

    const pushResult = await agent(`On branch ${branch} (PR #${PR_NUMBER}), push the branch to the remote. If gh reports PR #${PR_NUMBER} missing or its head branch as anything other than ${branch}, return success=false without pushing anywhere else. Query GitHub afterward and confirm the remote head equals your local HEAD and differs from ${baseSha}. Return success, the pushed head sha, and checksStatus: "passed" or "failed" from the checks that have completed (lint/typecheck/tests/CI as applicable), or "pending" if checks are still queued or running — do not wait for them to finish.

${REPO_CONTEXT}`, {
      label: `r${round}:fix:push`,
      schema: PUSH_SCHEMA,
      model: 'haiku',
      effort: 'low',
    })
    if (pushResult === null || !pushResult.success || !pushResult.headSha || pushResult.headSha === baseSha) {
      throw new Error(`Round ${round}: push did not verify a changed remote head: ${pushResult ? pushResult.summary : 'push agent failed'}`)
    }

    const fixVerification = await agent(`Independently verify the pushed result for PR #${PR_NUMBER} using GitHub, not the local checkout. Confirm the current remote head is exactly ${pushResult.headSha}, differs from ${baseSha}, belongs to PR #${PR_NUMBER} on head branch ${branch}, and that the commits in the pushed range ${baseSha}..${pushResult.headSha} are exactly these shas:
${JSON.stringify(commits)}
Match on shas only — the titles listed are the script's informational approximations and may differ from the real commit subjects; a title mismatch alone is not a verification failure. Return verified=false on any sha mismatch, missing or extra commit, or if PR #${PR_NUMBER} cannot be fetched — never verify against a different PR or branch.

${REPO_CONTEXT}`, {
      label: `r${round}:fix:verify-remote`,
      schema: FIX_VERIFICATION_SCHEMA,
      model: 'haiku',
      effort: 'low',
    })
    if (fixVerification === null || !fixVerification.verified || fixVerification.headSha !== pushResult.headSha) {
      throw new Error(`Round ${round}: independent remote verification failed; refusing to start another review round`)
    }

    report.commits = [...new Map([...report.commits, ...commits].map(commit => [commit.sha, commit])).values()]
    report.checksStatus = pushResult.checksStatus
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

log(`Starting lightweight YOLO review-fix loop for PR #${PR_NUMBER}, max ${MAX_ROUNDS} fix round(s), PR reporting ${PR_REPORTING ? 'enabled' : 'disabled'}`)

// Pin PR #N to its exact head branch before anything else runs — including the first report write,
// so a mistyped PR number fails fast instead of posting a report comment somewhere. Later
// git/GitHub agents cross-check against this pin rather than re-resolving with room to guess.
const resolvedPr = await agent(`Run exactly this command and relay its result: \`gh pr view ${PR_NUMBER}${GH_REPO_FLAG} --json number,state,headRefName,baseRefName,headRefOid,isCrossRepository\`. If it succeeds, return found=true plus number, headRefName, baseRefName, headSha (the headRefOid), state, and isCrossRepository verbatim. If it fails for any reason, return found=false — do not retry with different arguments, search for similarly-numbered PRs, try other repos or remotes, or substitute a branch.

${REPO_CONTEXT}`, {
  label: 'resolve-pr',
  schema: PR_RESOLVE_SCHEMA,
  model: 'haiku',
  effort: 'low',
})
if (resolvedPr === null || resolvedPr.found !== true || resolvedPr.number !== PR_NUMBER || !resolvedPr.headRefName) {
  throw new Error(`PR #${PR_NUMBER} did not resolve to an exact match${REPO_SLUG ? ` in ${REPO_SLUG}` : ''} — stopping instead of guessing`)
}
// The loop pushes fix commits to the PR's head branch, so anything but an open PR is a wrong
// target no matter how exact the number match is.
if (resolvedPr.state && resolvedPr.state.toUpperCase() !== 'OPEN') {
  throw new Error(`PR #${PR_NUMBER} is ${resolvedPr.state} — stopping instead of reviewing/pushing to a non-open PR`)
}
// This is a review/FIX loop: every round commits and pushes to the PR's head branch. For a fork PR
// that branch lives in someone else's repository, which the run almost certainly cannot push to and
// should not assume it may. Failing here is the honest outcome — the alternative is discovering it
// after the fixes exist, where `git push` with no upstream resolves to `origin` and creates a stray
// branch on the upstream repo that is not the PR's head and updates nothing.
if (resolvedPr.isCrossRepository === true) {
  throw new Error(`PR #${PR_NUMBER}'s head branch ${resolvedPr.headRefName} lives in a fork, and this workflow pushes fix commits to the PR's head branch — it cannot do that across repositories. Review it read-only instead (e.g. the council-review or pr-review skills), or re-run this against a PR whose head branch is in ${REPO_SLUG || 'this repository'}.`)
}
const PR_BRANCH = resolvedPr.headRefName
// The PR's own base ref, used only to compute the review's diff range. Never checked out, never
// pushed to, and deliberately not a workflow arg — the PR already decides what it targets.
const PR_BASE_BRANCH = resolvedPr.baseRefName || ''
report.startingSha = resolvedPr.headSha || ''
log(`Resolved PR #${PR_NUMBER}: head branch ${PR_BRANCH}${PR_BASE_BRANCH ? ` onto ${PR_BASE_BRANCH}` : ''}${resolvedPr.state ? ` (${resolvedPr.state})` : ''} at ${resolvedPr.headSha || 'unknown sha'}`)

// The fix rounds commit and push, so they get a dedicated worktree rather than the user's
// checkout. Created from the PR's own head branch — this workflow works from a PR number alone, so
// there is no base branch to choose and nothing to confirm. One agent does it (it needs judgment
// for fork heads and stale worktrees) but does not get the final word on whether it complied: it
// returns the raw facts and the script enforces them below.
const worktreeResult = await agent(`Set up an isolated worktree to run review fixes for PR #${PR_NUMBER} on head branch ${PR_BRANCH}. The user's own checkout must be left exactly as you found it: never run \`git checkout\`, \`git switch\`, \`git reset\`, or \`git stash\` in it.

1. Record the starting state of the checkout and return it: \`git rev-parse --show-toplevel\` as repoRoot, \`git rev-parse --abbrev-ref HEAD\` as repoBranchBefore, \`git rev-parse HEAD\` as repoHeadBefore, and each path from \`git status --porcelain\` in dirtyPaths (empty array when clean).
2. ${ALLOW_DIRTY_TREE
  ? 'The caller has acknowledged that the tree may be dirty, so continue — but leave those changes exactly as they are.'
  : 'If dirtyPaths is not empty, STOP NOW: return what you have and create nothing. Do not stash, commit, or discard anything.'}
3. Run \`git fetch origin\`.
4. Create a worktree for the PR head in a fresh temp directory OUTSIDE the repository tree: \`git worktree add <temp dir> ${PR_BRANCH}\`. If ${PR_BRANCH} has no local ref yet, create it tracking the remote head instead: \`git worktree add <temp dir> -b ${PR_BRANCH} origin/${PR_BRANCH}\`. If a stale worktree from an aborted run already holds ${PR_BRANCH}, \`git worktree list\` and \`git worktree remove --force\` it first. The head branch is known to live in this repository (fork PRs are refused before this step), so \`origin\` has it — if \`origin/${PR_BRANCH}\` does not resolve, stop and report that in detail rather than adding another remote or searching elsewhere for a branch of that name. Return the absolute worktree path as worktreePath.
5. Prove it: return every absolute path listed by \`git worktree list --porcelain\` in worktreePaths, \`git rev-parse --abbrev-ref HEAD\` run inside the new worktree as worktreeBranch, and the checkout's \`git rev-parse HEAD\` re-read afterwards as repoHeadAfter.

${REPO_CONTEXT}`,
  {
    label: 'setup:worktree',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        worktreePath: { type: 'string' },
        detail: { type: 'string' },
        // Evidence the script enforces below.
        repoRoot: { type: 'string' },
        repoBranchBefore: { type: 'string' },
        repoHeadBefore: { type: 'string' },
        repoHeadAfter: { type: 'string' },
        worktreePaths: { type: 'array', items: { type: 'string' } },
        worktreeBranch: { type: 'string' },
        dirtyPaths: { type: 'array', items: { type: 'string' } },
      },
      required: [],
    },
    agentType: 'general-purpose',
  })
if (worktreeResult === null) throw new Error('setup:worktree agent failed — no worktree to run fixes in')

const DIRTY_PATHS = worktreeResult.dirtyPaths || []
// The script decides this, not the agent: stashing mutates state the user did not offer.
if (DIRTY_PATHS.length && !ALLOW_DIRTY_TREE) {
  throw new Error(`The checkout at ${worktreeResult.repoRoot || REPO_PATH || 'cwd'} has uncommitted changes — refusing to run rather than stashing them. Commit, stash, or discard them yourself, or pass allowDirtyTree: true to proceed and leave them untouched. Dirty paths: ${DIRTY_PATHS.join(', ')}`)
}

const WORKTREE_PATH = worktreeResult.worktreePath
if (!WORKTREE_PATH) throw new Error('setup:worktree returned no worktree path — refusing to fall back to the user\'s checkout')

// Enforcement. Each check is the difference between "the agent was asked to isolate" and "the run
// is isolated": without them a setup that did a plain checkout still reads as success.
const reportedWorktrees = worktreeResult.worktreePaths || []
if (!reportedWorktrees.includes(WORKTREE_PATH)) {
  throw new Error(`setup:worktree reported ${WORKTREE_PATH} but \`git worktree list\` does not contain it (${reportedWorktrees.join(', ') || 'no worktrees listed'}) — the run is not isolated, refusing to continue`)
}
const repoRoot = worktreeResult.repoRoot || REPO_PATH
if (repoRoot && (WORKTREE_PATH === repoRoot || WORKTREE_PATH.startsWith(`${repoRoot}/`))) {
  throw new Error(`Worktree ${WORKTREE_PATH} is inside the checkout at ${repoRoot} — it must live outside the repository tree, refusing to continue`)
}
// Fix rounds push to this branch, so the wrong branch here means pushing to the wrong PR.
if (worktreeResult.worktreeBranch && worktreeResult.worktreeBranch !== PR_BRANCH) {
  throw new Error(`Worktree at ${WORKTREE_PATH} has ${worktreeResult.worktreeBranch} checked out, not PR #${PR_NUMBER}'s head branch ${PR_BRANCH} — refusing to push fixes to the wrong branch`)
}
if (worktreeResult.repoHeadBefore && worktreeResult.repoHeadAfter && worktreeResult.repoHeadBefore !== worktreeResult.repoHeadAfter) {
  throw new Error(`Setup moved the checkout's HEAD from ${worktreeResult.repoHeadBefore} to ${worktreeResult.repoHeadAfter} — it must be left untouched. Restore it with \`git checkout ${worktreeResult.repoBranchBefore || worktreeResult.repoHeadBefore}\` before rerunning`)
}

// Everything past this point works in the worktree, so every later prompt must say so.
REPO_CONTEXT = repoContext(WORKTREE_PATH)
log(`Worktree verified: ${WORKTREE_PATH} on ${PR_BRANCH}${worktreeResult.detail ? ` — ${worktreeResult.detail}` : ''}; checkout left on ${worktreeResult.repoBranchBefore || 'its original branch'} at ${worktreeResult.repoHeadBefore || 'its original HEAD'}`)
if (DIRTY_PATHS.length) {
  log(`Note: ${DIRTY_PATHS.length} uncommitted change(s) in the checkout are left untouched: ${DIRTY_PATHS.join(', ')}`)
}

// Pin what "this PR changed" to a merge base computed from the repository, before any reviewer
// runs. Left implicit, agents reach for `gh pr diff`, which trusts GitHub's cached merge base --
// and a PR whose base branch has advanced since it was opened can have already-merged base commits
// reported as its own. The panel then reviews code the author never wrote.
// Re-pinned before every review round, not once at setup. The head sha moves each time a fix round
// pushes, and a range frozen at the pre-fix head is worse than no pin at all: the old sha stays a
// valid ancestor, so `git diff` still succeeds and silently returns the un-fixed diff, while the
// accompanying "anything outside that range is not this PR's change" instruction tells the panel to
// ignore the very commits it is meant to be re-reviewing. Round 2 would re-report round 1's findings
// verbatim and the loop would burn every round without converging.
async function pinDiffRange(headShaForDiff, label) {
  if (!PR_BASE_BRANCH) {
    log(`PR #${PR_NUMBER} reported no base branch — reviewers will fall back to GitHub's view of the diff, which may include already-merged base commits`)
    return
  }

  const diffRange = await agent(`Determine the exact diff range for PR #${PR_NUMBER} (head branch ${PR_BRANCH}, base branch ${PR_BASE_BRANCH}). Work only in the run's worktree at ${WORKTREE_PATH} — cd there first, and never run git commands that write in any other checkout.

1. \`git fetch origin\` — the base ref must be current or the merge base is wrong.
2. \`git merge-base origin/${PR_BASE_BRANCH} ${headShaForDiff}\` — return the full sha as mergeBaseSha. If the base ref is missing locally, fetch it explicitly (\`git fetch origin ${PR_BASE_BRANCH}\`) and retry; if it still fails, return mergeBaseSha as an empty string and explain in detail.
3. Using that sha as <merge-base>: return the last line of \`git diff --stat <merge-base>...${headShaForDiff}\` as diffStat, and the output of \`git diff --name-only <merge-base>...${headShaForDiff}\` as changedFiles.

Report exactly what the commands printed. Do not infer the range from \`gh pr diff\`, the GitHub UI, or the PR's baseRefOid — those are the values this step exists to bypass. Do not edit, commit, or push anything.

${REPO_CONTEXT}`, {
    label,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mergeBaseSha: { type: 'string' },
        changedFiles: { type: 'array', items: { type: 'string' } },
        diffStat: { type: 'string' },
        detail: { type: 'string' },
      },
      required: ['mergeBaseSha'],
    },
    model: 'haiku',
    effort: 'low',
  })
  const mergeBaseSha = diffRange?.mergeBaseSha?.trim() || ''
  if (/^[0-9a-f]{7,40}$/.test(mergeBaseSha)) {
    DIFF_CONTEXT = diffContext(mergeBaseSha, headShaForDiff)
    const fileCount = diffRange.changedFiles?.length
    log(`Review diff pinned to ${mergeBaseSha.slice(0, 12)}...${headShaForDiff.slice(0, 12)} (merge base with origin/${PR_BASE_BRANCH})${typeof fileCount === 'number' ? `: ${fileCount} file(s) changed` : ''}${diffRange.diffStat ? ` — ${diffRange.diffStat.trim()}` : ''}`)
  } else {
    // Not fatal: the reviewers can still compute the range themselves. What must not happen is a
    // silent fall back to `gh pr diff`, so the instruction to avoid it survives either way. The head
    // is named as a sha when we have one, so this fallback tracks the round too.
    DIFF_CONTEXT = `Authoritative diff for this PR: compute it in the run's worktree with \`git merge-base origin/${PR_BASE_BRANCH} ${headShaForDiff}\` and review \`git diff <merge-base>...${headShaForDiff}\`. Do NOT use \`gh pr diff\` or GitHub's "Files changed" view to decide what this PR changed: GitHub's cached merge base goes stale when the base branch advances, so both can present already-merged base commits as this PR's work.`
    log(`Could not pin the review diff range (merge base with origin/${PR_BASE_BRANCH} unresolved${diffRange?.detail ? `: ${diffRange.detail}` : ''}) — reviewers are instructed to compute it themselves rather than trust \`gh pr diff\``)
  }
}

await pinDiffRange(resolvedPr.headSha || PR_BRANCH, 'setup:diff-range')

await initializeReport()

let round = 0
let verdict = { done: false, findings: [] }

try {
  while (!verdict.done && round < MAX_ROUNDS) {
    round++
    // Every previous round ended by pushing and independently verifying a new head, so re-pin the
    // range to it before the panel runs. report.finalSha is only set from a verified push, so this
    // never advances the range onto an unverified sha.
    if (round > 1 && report.finalSha) await pinDiffRange(report.finalSha, `r${round}:diff-range`)
    verdict = await reviewAndJudge(round)
    if (verdict.done) {
      await postReview(round, verdict)
      break
    }
    // Posting the round's review to GitHub gates nothing the fixes depend on, so it runs
    // alongside the fix round (postReview itself downgrades failures to warnings).
    const postPromise = postReview(round, verdict)
    await runFix(round, verdict.findings)
    await postPromise
  }

  if (!verdict.done && round === MAX_ROUNDS) {
    const verificationRound = MAX_ROUNDS + 1
    verdict = await finalReJudge(verificationRound, verdict.findings)
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

  // Success path only, and only after every fix round has pushed — the commits are on the remote
  // by now, so removing the worktree loses nothing. Deliberately outside the catch: on failure the
  // worktree may hold unpushed work, so it stays put and its path is reported for triage.
  const cleaned = await agent(`Run \`git worktree remove --force ${WORKTREE_PATH}\` from the checkout at ${REPO_PATH || 'the repository root'}. Branch ${PR_BRANCH} and its commits must survive — only the worktree directory goes away. Do not delete the branch. Do not check out, reset, or otherwise modify the checkout you run this from. Report whether the removal succeeded.

${repoContext(REPO_PATH)}`,
    {
      label: 'cleanup:worktree',
      schema: { type: 'object', additionalProperties: false, properties: { removed: { type: 'boolean' }, detail: { type: 'string' } }, required: ['removed'] },
      model: 'haiku',
      effort: 'low',
    })
  // A stranded worktree is untidy, not a failed run — the fixes are already pushed. Surface the
  // path instead of failing a run whose actual work succeeded.
  if (cleaned === null || !cleaned.removed) {
    log(`Worktree at ${WORKTREE_PATH} could not be removed — remove it manually with \`git worktree remove --force ${WORKTREE_PATH}\`${cleaned?.detail ? ` (${cleaned.detail})` : ''}`)
  } else {
    log(`Worktree removed: ${WORKTREE_PATH} (branch ${PR_BRANCH} untouched)`)
  }

  return { reportRunId: REPORT_RUN_ID, rounds: round, done: verdict.done, openFindings: verdict.findings, reportCommentId, worktreePath: cleaned?.removed ? null : WORKTREE_PATH }
} catch (error) {
  report.currentPhase = 'Failed'
  report.status = 'Failed'
  report.lastMilestone = 'Workflow failed'
  report.failure = error instanceof Error ? error.message : String(error)
  await updateReport('workflow failed')
  log(`Workflow failed: ${report.failure}`)
  // The worktree is intentionally left in place: it may hold committed-but-unpushed fix work that
  // is the only copy. Report the path so a human can inspect it and clean up.
  if (typeof WORKTREE_PATH === 'string' && WORKTREE_PATH) {
    log(`Run worktree left in place for triage: ${WORKTREE_PATH} (remove with \`git worktree remove --force ${WORKTREE_PATH}\` once you are done with it)`)
  }
  throw error
}
