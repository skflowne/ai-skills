// pi/codex-dynamic-workflows port of ../workflows/fast-issue-to-pr.js.
// Run with: codex-workflow run workflows-codex/fast-issue-to-pr.js --config workflows-codex/codex-workflow.config.ts
//
// The nested workflow paths default to this directory and can be overridden through args when
// running from another checkout.

export const meta = {
  name: 'fast-issue-to-pr',
  description: 'Implement a GitHub issue with the dual-forge process, then loop council + yolo-council review/fix until only nits remain',
  phases: [
    { title: 'Fast implement' },
    { title: 'Review loop' },
  ],
}

const IMPLEMENT_FLOW_PATH = args.implFlowPath ?? '/home/skflowne/projects/ai-skills/workflows-codex/fast-implement.js'
const REVIEW_FIX_LOOP_PATH = args.reviewLoopPath ?? '/home/skflowne/projects/ai-skills/workflows-codex/review-fix-loop.js'

phase('Fast implement')
const implemented = await workflow({ scriptPath: IMPLEMENT_FLOW_PATH }, { issueNumber: args.issueNumber })
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
