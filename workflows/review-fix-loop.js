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

const ROSTER_SCHEMA = {
  type: 'object',
  properties: {
    experts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { role: { type: 'string' }, focus: { type: 'string' } },
        required: ['role', 'focus'],
      },
    },
  },
  required: ['experts'],
}

function severityBreakdown(findings) {
  if (!findings.length) return 'none'
  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 }
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1
  return Object.entries(counts).filter(([, n]) => n > 0).map(([sev, n]) => `${n} ${sev}`).join(', ')
}

function expertPrompt(prNumber, role, focus) {
  return `/pr-review PR #${prNumber}, but don't post inline comments — report your findings to your parent agent instead.

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
      phase: 'Review', label: `r${round}:council:${e.role}`, agentType: 'general-purpose',
    })
  ))
  const done = reports.filter(Boolean).length
  log(`  [council] ${done}/${COUNCIL_EXPERTS.length} expert reviews back, synthesizing`)

  const panel = await agent(`Synthesize these ${COUNCIL_EXPERTS.length} council-review expert reports for PR #${prNumber} per the council-review skill's synthesis rules: cross-check overlapping findings, dedupe, reconcile severity, WebFetch any doc a claim hinges on, drop speculative/unevidenced findings, note disagreements resolved with evidence.

${REPO_CONTEXT}

${reports.filter(Boolean).map((r, i) => `### ${COUNCIL_EXPERTS[i].role}\n${r}`).join('\n\n')}

Return the synthesized findings as structured items with 'severity', 'area', 'file', concise 'description' (at most 240 characters), 'failureScenario' (the concrete conditions, failure, and impact), non-empty 'evidence' (file/line references, test output, or documentation), and 'finders'. 'finders' must list every expert role that independently reported the issue; preserve the complete list when deduplicating overlapping reports.`,

    { phase: 'Review', label: `r${round}:council:synthesis`, schema: PANEL_SCHEMA, agentType: 'general-purpose' })

  log(`  [council] synthesized: ${panel.findings.length} finding(s) — ${severityBreakdown(panel.findings)}`)
  return panel.findings
}

async function runYoloPanel(prNumber, round) {
  const roster = await agent(`Follow the yolo-council-review skill's panel-composition rules for PR #${prNumber}: fetch the PR, its issue(s), and diff; compose a tailored 2-6 expert roster from the goal (not a generic default). Return the roster only.

${REPO_CONTEXT}`,
    { phase: 'Review', label: `r${round}:yolo:roster`, schema: ROSTER_SCHEMA, agentType: 'general-purpose' })

  log(`  [yolo] composed roster: ${roster.experts.map(e => e.role).join(', ')}`)

  const reports = await parallel(roster.experts.map(e => () =>
    agent(expertPrompt(prNumber, e.role, e.focus), {
      phase: 'Review', label: `r${round}:yolo:${e.role}`, agentType: 'general-purpose',
    })
  ))
  const done = reports.filter(Boolean).length
  log(`  [yolo] ${done}/${roster.experts.length} expert reviews back, synthesizing`)

  const panel = await agent(`Synthesize these ${roster.experts.length} yolo-council-review expert reports for PR #${prNumber} per the yolo-council-review skill's synthesis rules: cross-check overlapping findings, dedupe, reconcile severity, WebFetch any doc a claim hinges on, drop speculative/unevidenced findings, attribute by the expert areas assigned (not a fixed taxonomy).

${REPO_CONTEXT}

${reports.filter(Boolean).map((r, i) => `### ${roster.experts[i].role}\n${r}`).join('\n\n')}

Return the synthesized findings as structured items with 'severity', 'area', 'file', concise 'description' (at most 240 characters), 'failureScenario' (the concrete conditions, failure, and impact), non-empty 'evidence' (file/line references, test output, or documentation), and 'finders'. 'finders' must list every expert role that independently reported the issue; preserve the complete list when deduplicating overlapping reports.`,

    { phase: 'Review', label: `r${round}:yolo:synthesis`, schema: PANEL_SCHEMA, agentType: 'general-purpose' })

  log(`  [yolo] synthesized: ${panel.findings.length} finding(s) — ${severityBreakdown(panel.findings)}`)
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

Dedupe overlapping findings across both panels, reconcile severity conflicts with evidence. Before finalizing, fetch what's already been posted on PR #${PR_NUMBER} (existing review comments, prior review rounds, and any linked follow-up issues) — drop findings that were already raised and already addressed or already tracked, unless there's new evidence that changes the picture. done=true only if everything remaining is a nit (no blocker/major/minor). Otherwise done=false, and return every blocker/major/minor finding (nits can be omitted from the list, but note their count in your own reasoning). Every returned finding must include 'finders', preserving the complete union of expert roles from all overlapping source findings; do not omit a finder when deduplicating or invent roles.`,

    { schema: JUDGE_SCHEMA, label: `r${round}:judge`, agentType: 'general-purpose' })

  log(`Round ${round} verdict: ${verdict.done ? 'clean — only nits remain' : `NOT done — ${verdict.findings.length} actionable finding(s): ${severityBreakdown(verdict.findings)}`}`)
  if (verdict.findings.length) {
    for (const f of verdict.findings) log(`  - [${f.severity}] [found by: ${f.finders.join(', ')}] ${f.area ? `(${f.area}) ` : ''}${f.file ? `${f.file}: ` : ''}${f.description}`)
  }

  await agent(`Follow the github-pr-review skill to post a review to PR #${PR_NUMBER} summarizing round ${round}'s verified findings (severity-ranked, sectioned by expert area), with every finding's complete list of expert finders, and inline comments where file/line evidence supports it. event: COMMENT.

${REPO_CONTEXT}

${verdict.done ? 'State that only nits remain and the review loop is stopping here.' : `State that a fix round is starting now for these ${verdict.findings.length} finding(s).`}

Findings:
${JSON.stringify(verdict.findings, null, 2)}`,
    { label: `r${round}:post`, agentType: 'general-purpose' })
  log(`Round ${round}: review posted to PR #${PR_NUMBER}`)

  if (verdict.done) break

  phase('Fix')
  log(`Round ${round}: dispatching fixes for ${verdict.findings.length} finding(s)`)
  await agent(`Follow the orchestrate skill to resolve these review findings on PR #${PR_NUMBER}'s branch (checkout the PR branch first if not already on it). Plan the partition BEFORE dispatching — group findings so no two parallel sub-agents touch the same file, then dispatch each group to a sub-agent sized to its complexity. Commit and push the fixes to the PR branch when done, so the next review round sees the updated diff on GitHub.

${REPO_CONTEXT}

Findings to fix:
${JSON.stringify(verdict.findings, null, 2)}`,
    { label: `r${round}:fix`, agentType: 'general-purpose' })
  log(`Round ${round}: fixes committed and pushed`)
}

if (!verdict.done) {
  log(`Hit the ${MAX_ROUNDS}-round cap with ${verdict.findings.length} finding(s) still open — stopping for human triage.`)
} else {
  log(`Done after ${round} round(s) — only nits remain on PR #${PR_NUMBER}.`)
}

return { rounds: round, done: verdict.done, openFindings: verdict.findings }
