export const meta = {
  name: 'fast-issue-to-pr',
  description: 'Implement a GitHub issue with TDD Forge, then loop council + yolo-council review/fix until only nits remain',
  phases: [
    { title: 'Fast implement' },
    { title: 'Review loop' },
  ],
}

// These sibling workflows are resolved by their final registered name, which
// the plugin loader prefixes with this plugin's name ("skills", per
// .claude-plugin/marketplace.json).
phase('Fast implement')
const implemented = await workflow('skills:fast-implement', { issueNumber: args.issueNumber })
log(`Implementation done — PR #${implemented.prNumber} opened (${implemented.prUrl})`)


phase('Review loop')
const reviewed = await workflow('skills:review-fix-loop', {
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
