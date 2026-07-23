// pi/codex-dynamic-workflows port of ../workflows/fast-issue-to-pr.js.
// Run with: codex-workflow run workflows-codex/fast-issue-to-pr.js --config workflows-codex/codex-workflow.config.ts
//
// The bundled launcher injects this workflow directory so nested scripts stay colocated when the
// skill is installed or copied elsewhere. Direct invocations must pass args.workflowDir.

export const meta = {
  name: 'fast-issue-to-pr',
  description: 'Implement a GitHub issue with TDD Forge, then loop council + yolo-council review/fix until only nits remain',
  phases: [
    { title: 'Fast implement' },
    { title: 'Review loop' },
  ],
}

if (typeof args.workflowDir !== 'string') {
  throw new Error('fast-issue-to-pr requires args.workflowDir; use codex-workflow/run.sh to launch it')
}

const IMPLEMENT_FLOW_PATH = `${args.workflowDir}/fast-implement.js`
const REVIEW_FIX_LOOP_PATH = `${args.workflowDir}/review-fix-loop.js`

phase('Fast implement')
const implemented = await workflow({ scriptPath: IMPLEMENT_FLOW_PATH }, { issueNumber: args.issueNumber })
log(`Implementation done — PR #${implemented.prNumber} opened (${implemented.prUrl})`)


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
