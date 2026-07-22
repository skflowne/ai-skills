// pi/codex-dynamic-workflows port of ../workflows/review-fix-loop.js.
// Run with: codex-workflow run workflows-codex/review-fix-loop.js --config workflows-codex/codex-workflow.config.ts
// (or --config workflows-codex/codex-workflow.config.kimi.ts — same tier keys, no script changes).
//
// Changes vs. the Claude Code original:
// - Dropped `agentType` (no tool-bundle registry on this backend — see implement-issue-flow.js port).
// - `/pr-review ...` and "Follow the X skill" prose become pi's own `/skill:name` invocation
//   (docs/skills.md in @earendil-works/pi-coding-agent: "register as /skill:name commands" and
//   force a full SKILL.md load rather than relying on the model noticing the description).
//   Requires the skill to be discoverable — this repo is expected to be reachable at
//   ~/.agents/skills (pi's global skill-discovery location) or a project .agents/skills.
// - "WebFetch"/browser references are kept as-is: pi has real equivalents installed on this
//   machine (`pi list`) — web_search/web_fetch tools from pi-native-search/pi-web-access, and a
//   native `agent-browser` tool from pi-agent-browser-native (the exact name the council-review
//   / yolo-council-review skills already call out as the generic browser-tool convention).
// - Calls select generic work-role providers (`supervisor`, `review`, `judge`, `orchestrator`). Concrete backend
//   providers and model names live only in the selected config.

export const meta = {
  name: 'review-fix-loop',
  description: 'Loop council-review + yolo-council-review, judge findings, orchestrate fixes, until only nits remain (max 4 rounds)',
  phases: [
    { title: 'Review' },
    { title: 'Judge' },
    { title: 'Fix' },
  ],
}

// args: prNumber (required). repoSlug/repoPath (optional) thread explicit
// repo context into every prompt — without them, agents resolve the PR from
// cwd's default remote, which is ambiguous across multiple checkouts.
const PR_NUMBER = args.prNumber
const REPO_SLUG = args.repoSlug
const REPO_PATH = args.repoPath
const REPO_CONTEXT = (REPO_SLUG || REPO_PATH)
  ? `Repo context: ${REPO_PATH ? `local checkout at ${REPO_PATH} (cd there for git operations)` : ''}${REPO_PATH && REPO_SLUG ? ', ' : ''}${REPO_SLUG ? `GitHub repo ${REPO_SLUG} (pass --repo ${REPO_SLUG} to every gh command — do not rely on cwd's default remote)` : ''}.`
  : ''

const MAX_ROUNDS = 4

const COUNCIL_EXPERTS = [
  { role: 'Correctness & behavior reviewer', focus: 'Logic bugs, edge cases, incorrect behavior, regressions, whether the implementation matches the issue intent and acceptance criteria' },
  { role: 'UI & UX reviewer', focus: 'Run the app in a browser and test the relevant flow as a user would. Visually verify each state and interaction; report interaction design, accessibility, visual consistency, loading/error/empty states, copy clarity, friction points.' },
  { role: 'Code architecture reviewer', focus: 'Module boundaries, abstractions, duplication, coupling, naming, testability, whether patterns match the codebase, maintainability' },
  { role: 'Security reviewer', focus: 'Auth/authz gaps, input validation, injection risks, secrets exposure, unsafe dependencies, data handling, OWASP-style concerns' },
]

const FINDING_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
    area: { type: 'string' },
    file: { type: 'string' },
    description: { type: 'string', minLength: 1, maxLength: 240, description: 'Concise statement of the issue.' },
    failureScenario: { type: 'string', minLength: 1, description: 'Concrete sequence or conditions that cause harm and its impact.' },
    evidence: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, description: 'Concrete supporting evidence, such as file/line references, test output, or documentation.' },
    finders: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
  required: ['severity', 'description', 'failureScenario', 'evidence', 'finders'],
}

const PANEL_SCHEMA = {
  type: 'object',
  properties: { findings: { type: 'array', items: FINDING_ITEM_SCHEMA } },
  required: ['findings'],
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    done: { type: 'boolean' },
    findings: { type: 'array', items: FINDING_ITEM_SCHEMA },
  },
  required: ['done', 'findings'],
}

const REMOTE_HEAD_SCHEMA = {
  type: 'object',
  properties: { headSha: { type: 'string' } },
  required: ['headSha'],
}

const FIX_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    beforeHeadSha: { type: 'string' },
    afterHeadSha: { type: 'string' },
    pushed: { type: 'boolean' },
    checksPassed: { type: 'boolean' },
    resolvedFindingCount: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['success', 'beforeHeadSha', 'afterHeadSha', 'pushed', 'checksPassed', 'resolvedFindingCount', 'summary'],
}

const FIX_VERIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    verified: { type: 'boolean' },
    headSha: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['verified', 'headSha', 'summary'],
}

function severityBreakdown(findings) {
  if (!findings.length) return 'none'
  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 }
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1
  return Object.entries(counts).filter(([, n]) => n > 0).map(([sev, n]) => `${n} ${sev}`).join(', ')
}

function expertPrompt(prNumber, role, focus) {
  return `/skill:pr-review PR #${prNumber}, but don't post inline comments — report your findings to your parent agent instead.

${REPO_CONTEXT}

Provide actual evidence for every claim. Do not rely on hypotheticals that are unlikely to materialize. If unsure, search the codebase or fetch relevant docs.

Your expert role: ${role}
Your focus areas: ${focus}

When reporting an issue, identify it as found by your expert role so the synthesis preserves attribution.`
}

async function runCouncilPanel(prNumber, round) {
  log(`  [council] dispatching ${COUNCIL_EXPERTS.length} fixed experts: ${COUNCIL_EXPERTS.map(e => e.role).join(', ')}`)
  const reports = await parallel(COUNCIL_EXPERTS.map(e => () =>
    agent(expertPrompt(prNumber, e.role, e.focus), {
      phase: 'Review', label: `r${round}:council:${e.role}`, provider: 'review',
    })
  ))
  const done = reports.filter(Boolean).length
  log(`  [council] ${done}/${COUNCIL_EXPERTS.length} expert reviews back, synthesizing`)

  const panel = await agent(`/skill:council-review Synthesize these ${COUNCIL_EXPERTS.length} expert reports for PR #${prNumber} per this skill's synthesis rules: cross-check overlapping findings, dedupe, reconcile severity, fetch (via the web_fetch tool) any doc a claim hinges on, drop speculative/unevidenced findings, note disagreements resolved with evidence.

${REPO_CONTEXT}

${reports.map((r, i) => r ? `### ${COUNCIL_EXPERTS[i].role}\n${r}` : null).filter(Boolean).join('\n\n')}

Return the synthesized findings as structured items with 'severity', 'area', 'file', concise 'description' (at most 240 characters), 'failureScenario' (the concrete conditions, failure, and impact), non-empty 'evidence' (file/line references, test output, or documentation), and 'finders'. 'finders' must list every expert role that independently reported the issue; preserve the complete list when deduplicating overlapping reports.`,

    { phase: 'Review', label: `r${round}:council:synthesis`, schema: PANEL_SCHEMA, provider: 'review' })

  log(`  [council] synthesized: ${panel.findings.length} finding(s) — ${severityBreakdown(panel.findings)}`)
  return panel.findings
}

async function runYoloPanel(prNumber, round) {
  log(`  [yolo] supervisor composing the roster and dispatching reviewer sub-agents`)
  const panel = await agent(`/skill:yolo-council-review Run the complete tailored council review for PR #${prNumber}. You are the panel supervisor: fetch the PR, linked issues, diff, and original goal; compose a distinct 2-6 expert roster; then spawn one reviewer sub-agent per expert, all in parallel. The children are reviewer roles, not supervisors. Give each child the PR and issue context plus its assigned role/focus, and have it follow /skill:pr-review without posting comments.

After every reviewer returns, critically synthesize their reports yourself: verify evidence, fetch any external documentation a claim depends on, deduplicate overlaps, reconcile severity, and drop speculative findings. The panel performs the primary exploration: adjudicate only material findings, disagreements, and evidence gaps; do not restart a broad file-by-file PR review or hunt for unrelated new issues. Return promptly once those are resolved. Do not post to GitHub and do not ask for approval; this workflow handles the handoff. Return only the final synthesized findings as structured items with 'severity', 'area', 'file', concise 'description' (at most 240 characters), 'failureScenario' (the concrete conditions, failure, and impact), non-empty 'evidence' (file/line references, test output, or documentation), and 'finders', not the roster or child transcripts. For each finding, 'finders' must list every expert role that independently reported it, preserving the complete list when deduplicating overlaps.

${REPO_CONTEXT}`,
    { phase: 'Review', label: `r${round}:yolo:supervisor`, schema: PANEL_SCHEMA, provider: 'supervisor' })

  if (panel === null) throw new Error(`Round ${round}: yolo council supervisor failed`)
  log(`  [yolo] supervisor synthesized: ${panel.findings.length} finding(s) — ${severityBreakdown(panel.findings)}`)
  return panel.findings
}

log(`Starting review-fix loop for PR #${PR_NUMBER}, max ${MAX_ROUNDS} round(s)`)

let round = 0
let verdict = { done: false, findings: [] }

while (!verdict.done && round < MAX_ROUNDS) {
  round++
  phase('Review')
  log(`— Round ${round}/${MAX_ROUNDS}: council + yolo-council reviews running in parallel —`)

  const [councilFindings, yoloFindings] = await parallel([
    () => runCouncilPanel(PR_NUMBER, round),
    () => runYoloPanel(PR_NUMBER, round),
  ])
  log(`Round ${round}: both panels done — council ${councilFindings.length} finding(s), yolo ${yoloFindings.length} finding(s), judging now`)

  phase('Judge')
  verdict = await agent(`Merge and judge these two independent review reports for PR #${PR_NUMBER} (round ${round}).

${REPO_CONTEXT}

## Council-review findings
${JSON.stringify(councilFindings, null, 2)}

## YOLO-council-review findings
${JSON.stringify(yoloFindings, null, 2)}

Dedupe overlapping findings across both panels and reconcile severity conflicts with evidence. Before finalizing, fetch what's already been posted on PR #${PR_NUMBER} (existing review comments, prior review rounds, and any linked follow-up issues). Drop a previously raised finding only when the current remote PR head contains evidence that it was fixed, or when a linked follow-up issue explicitly defers it; a review comment by itself is not proof that the finding is addressed. done=true only if everything remaining is a nit (no blocker/major/minor). Otherwise done=false, and return every blocker/major/minor finding (nits can be omitted from the list, but note their count in your own reasoning). Every returned finding must include 'finders', preserving the complete union of expert roles from all overlapping source findings; do not omit a finder when deduplicating or invent roles.`,
    { schema: JUDGE_SCHEMA, label: `r${round}:judge`, provider: 'judge' })
  if (verdict === null) throw new Error(`Round ${round}: judge failed`)
  if (!verdict.done && verdict.findings.length === 0) {
    throw new Error(`Round ${round}: judge returned done=false with no actionable findings`)
  }

  log(`Round ${round} verdict: ${verdict.done ? 'clean — only nits remain' : `NOT done — ${verdict.findings.length} actionable finding(s): ${severityBreakdown(verdict.findings)}`}`)
  if (verdict.findings.length) {
    for (const f of verdict.findings) log(`  - [${f.severity}] [found by: ${f.finders.join(', ')}] ${f.area ? `(${f.area}) ` : ''}${f.file ? `${f.file}: ` : ''}${f.description}`)
  }

  await agent(`/skill:github-pr-review Post a review to PR #${PR_NUMBER} summarizing round ${round}'s verified findings (severity-ranked, sectioned by expert area), with every finding's complete list of expert finders, and inline comments where file/line evidence supports it. event: COMMENT.

${REPO_CONTEXT}

${verdict.done ? 'State that only nits remain and the review loop is stopping here.' : `State that a fix round is starting now for these ${verdict.findings.length} finding(s).`}

Findings:
${JSON.stringify(verdict.findings, null, 2)}`,
    { label: `r${round}:post` })
  log(`Round ${round}: review posted to PR #${PR_NUMBER}`)

  if (verdict.done) break

  phase('Fix')
  log(`Round ${round}: recording the remote PR head before fixing`)
  const beforeFix = await agent(`Fetch PR #${PR_NUMBER} from GitHub and return its current remote head commit SHA. Do not use a local branch SHA.

${REPO_CONTEXT}`,
    { label: `r${round}:fix:before-head`, schema: REMOTE_HEAD_SCHEMA, provider: 'judge' })
  if (beforeFix === null || !beforeFix.headSha) {
    throw new Error(`Round ${round}: could not establish the remote PR head; refusing to dispatch fixes`)
  }

  log(`Round ${round}: dispatching fixes for ${verdict.findings.length} finding(s) from ${beforeFix.headSha}`)
  const fixResult = await agent(`/skill:orchestrate Resolve and verify these review findings on PR #${PR_NUMBER}'s branch. You are the final implementation orchestrator and verifier for this fix round.

${REPO_CONTEXT}

The remote PR head before this fix round is ${beforeFix.headSha}.

Requirements:
- Check out the actual PR branch and confirm its remote head before editing.
- Plan the partition before dispatching. Group findings so no two parallel sub-agents touch the same file.
- Keep child-agent returns compact: save detailed reports/logs as artifacts and return only concise summaries and artifact paths. Do not inline full transcripts or test logs.
- Review every child change yourself, integrate it, and verify every finding against the resulting code.
- Run the relevant tests, typecheck, lint, and other project checks; all required checks must pass.
- Commit and push the fixes to the PR branch.
- Query GitHub after pushing and confirm the PR's remote head equals the pushed commit. A local git SHA alone is insufficient.
- Set success=true only when all findings are resolved, checks pass, and the remote PR head changed from ${beforeFix.headSha}. Otherwise return success=false without claiming completion.
- Return only the requested compact structured result.

Findings to fix:
${JSON.stringify(verdict.findings, null, 2)}`,
    { label: `r${round}:fix:orchestrator`, schema: FIX_RESULT_SCHEMA, provider: 'orchestrator', maxAttempts: 1 })

  if (fixResult === null) {
    throw new Error(`Round ${round}: fix orchestrator failed; refusing to start another review round`)
  }
  if (fixResult.beforeHeadSha !== beforeFix.headSha) {
    throw new Error(`Round ${round}: fix orchestrator worked from unexpected head ${fixResult.beforeHeadSha}; expected ${beforeFix.headSha}`)
  }
  if (!fixResult.success || !fixResult.pushed || !fixResult.checksPassed) {
    throw new Error(`Round ${round}: fix orchestrator did not verify a successful push: ${fixResult.summary}`)
  }
  if (!fixResult.afterHeadSha || fixResult.afterHeadSha === beforeFix.headSha) {
    throw new Error(`Round ${round}: remote PR head did not change after the fix round`)
  }
  if (fixResult.resolvedFindingCount !== verdict.findings.length) {
    throw new Error(`Round ${round}: fix orchestrator resolved ${fixResult.resolvedFindingCount}/${verdict.findings.length} findings`)
  }

  const fixVerification = await agent(`Independently verify the pushed result for PR #${PR_NUMBER}. Query GitHub, not the local checkout. Confirm that the current remote PR head is exactly ${fixResult.afterHeadSha}, differs from the pre-fix head ${beforeFix.headSha}, and is part of PR #${PR_NUMBER}. Return verified=false on any mismatch. Keep the summary concise.

${REPO_CONTEXT}`,
    { label: `r${round}:fix:verify-remote`, schema: FIX_VERIFICATION_SCHEMA, provider: 'judge' })
  if (fixVerification === null || !fixVerification.verified || fixVerification.headSha !== fixResult.afterHeadSha) {
    throw new Error(`Round ${round}: independent remote verification failed; refusing to start another review round`)
  }

  log(`Round ${round}: verified fixes committed and pushed at ${fixResult.afterHeadSha}`)
}

// The final fix round must be followed by a fresh review; its pre-fix findings are stale.
if (!verdict.done && round === MAX_ROUNDS) {
  const verificationRound = MAX_ROUNDS + 1
  phase('Review')
  log(`Post-fix verification review after round ${MAX_ROUNDS}`)

  const [councilFindings, yoloFindings] = await parallel([
    () => runCouncilPanel(PR_NUMBER, verificationRound),
    () => runYoloPanel(PR_NUMBER, verificationRound),
  ])
  log(`Round ${verificationRound}: both panels done — council ${councilFindings.length} finding(s), yolo ${yoloFindings.length} finding(s), judging now`)

  phase('Judge')
  verdict = await agent(`Merge and judge these two independent review reports for PR #${PR_NUMBER} (post-fix verification after round ${MAX_ROUNDS}).

${REPO_CONTEXT}

## Council-review findings
${JSON.stringify(councilFindings, null, 2)}

## YOLO-council-review findings
${JSON.stringify(yoloFindings, null, 2)}

Dedupe overlapping findings across both panels and reconcile severity conflicts with evidence. Before finalizing, fetch what's already been posted on PR #${PR_NUMBER} (existing review comments, prior review rounds, and any linked follow-up issues). Judge the current remote PR head after the final fix round, not the pre-fix findings. Drop a previously raised finding only when the current remote PR head contains evidence that it was fixed, or when a linked follow-up issue explicitly defers it; a review comment by itself is not proof that the finding is addressed. done=true only if everything remaining is a nit (no blocker/major/minor). Otherwise done=false, and return every blocker/major/minor finding (nits can be omitted from the list, but note their count in your own reasoning). Every returned finding must include 'finders', preserving the complete union of expert roles from all overlapping source findings; do not omit a finder when deduplicating or invent roles.`,
    { schema: JUDGE_SCHEMA, label: `r${verificationRound}:judge`, provider: 'judge' })
  if (verdict === null) throw new Error(`Round ${verificationRound}: judge failed`)
  if (!verdict.done && verdict.findings.length === 0) {
    throw new Error(`Round ${verificationRound}: judge returned done=false with no actionable findings`)
  }

  log(`Round ${verificationRound} verdict: ${verdict.done ? 'clean — only nits remain' : `NOT done — ${verdict.findings.length} actionable finding(s): ${severityBreakdown(verdict.findings)}`}`)
  if (verdict.findings.length) {
    for (const f of verdict.findings) log(`  - [${f.severity}] [found by: ${f.finders.join(', ')}] ${f.area ? `(${f.area}) ` : ''}${f.file ? `${f.file}: ` : ''}${f.description}`)
  }

  await agent(`/skill:github-pr-review Post the post-fix verification review to PR #${PR_NUMBER} (severity-ranked, sectioned by expert area), with every finding's complete list of expert finders, and inline comments where file/line evidence supports it. event: COMMENT.

${REPO_CONTEXT}

State that this review verifies the result after the final fix round and that no additional fix round will run automatically.

Findings:
${JSON.stringify(verdict.findings, null, 2)}`,
    { label: `r${verificationRound}:post` })
  log(`Round ${verificationRound}: review posted to PR #${PR_NUMBER}`)
}

if (!verdict.done) {
  log(`Hit the ${MAX_ROUNDS}-round cap with ${verdict.findings.length} finding(s) still open after post-fix verification — stopping for human triage.`)
} else {
  log(`Done after ${round} round(s) — only nits remain on PR #${PR_NUMBER}.`)
}

return { rounds: round, done: verdict.done, openFindings: verdict.findings }
