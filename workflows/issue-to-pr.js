export const meta = {
  name: 'issue-to-pr',
  description: 'Implement a GitHub issue end to end with Supervised Forge, then loop a tailored yolo-council review/fix until only nits remain',
  phases: [
    { title: 'Implement' },
    { title: 'Review loop' },
  ],
}

// These sibling workflows are resolved by their final registered name, which
// the plugin loader prefixes with this plugin's name ("skills", per
// .claude-plugin/marketplace.json) — not the bare `meta.name` from their own
// files. If that plugin name ever changes, update these two strings to match.
phase('Implement')
const implemented = await workflow('skills:supervised-forge-implement', { issueNumber: args.issueNumber })
log(`Implementation done — PR #${implemented.prNumber} opened (${implemented.prUrl})`)

if (!implemented.testsPassed) {
  log(`Warning: tests were not green going into the review loop — ${implemented.testSummary}`)
}

phase('Review loop')
const reviewed = await workflow('skills:review-fix-loop-lite', {
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
