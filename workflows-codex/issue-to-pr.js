// pi/codex-dynamic-workflows port of ../workflows/issue-to-pr.js.
// Run with: codex-workflow run workflows-codex/issue-to-pr.js --config workflows-codex/codex-workflow.config.ts
//
// The original resolves siblings via the Claude Code plugin namespace ("skills:implement-issue-flow").
// codex-dynamic-workflows has no plugin/marketplace layer, so nested workflow() calls here use
// {scriptPath} instead. Defaults point at this same directory (single-machine setup); override via
// args if these files ever move or get invoked from a checkout elsewhere.

export const meta = {
  name: 'issue-to-pr',
  description: 'Implement a GitHub issue end to end, then loop council + yolo-council review/fix until only nits remain',
  phases: [
    { title: 'Implement' },
    { title: 'Review loop' },
  ],
}

const IMPLEMENT_ISSUE_FLOW_PATH = args.implFlowPath ?? '/home/skflowne/projects/ai-skills/workflows-codex/implement-issue-flow.js'
const REVIEW_FIX_LOOP_PATH = args.reviewLoopPath ?? '/home/skflowne/projects/ai-skills/workflows-codex/review-fix-loop.js'

phase('Implement')
const implemented = await workflow({ scriptPath: IMPLEMENT_ISSUE_FLOW_PATH }, { issueNumber: args.issueNumber })
log(`Implementation done — PR #${implemented.prNumber} opened (${implemented.prUrl})`)

if (!implemented.testsPassed) {
  log(`Warning: tests were not green going into the review loop — ${implemented.testSummary}`)
}

phase('Review loop')
const reviewed = await workflow({ scriptPath: REVIEW_FIX_LOOP_PATH }, {
  prNumber: implemented.prNumber,
  repoSlug: args.repoSlug,
  repoPath: args.repoPath,
})

return {
  ...implemented,
  reviewRounds: reviewed.rounds,
  reviewDone: reviewed.done,
  openFindings: reviewed.openFindings,
}
