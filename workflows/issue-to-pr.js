export const meta = {
  name: 'issue-to-pr',
  description: 'Implement a GitHub issue end to end, then loop council + yolo-council review/fix until only nits remain',
  phases: [
    { title: 'Implement' },
    { title: 'Review loop' },
  ],
}

phase('Implement')
const implemented = await workflow('implement-issue-flow', { issueNumber: args.issueNumber })
log(`Implementation done — PR #${implemented.prNumber} opened (${implemented.prUrl})`)

if (!implemented.testsPassed) {
  log(`Warning: tests were not green going into the review loop — ${implemented.testSummary}`)
}

phase('Review loop')
const reviewed = await workflow('review-fix-loop', {
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
