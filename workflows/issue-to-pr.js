export const meta = {
  name: 'issue-to-pr',
  description: 'Implement a GitHub issue end to end with Supervised Forge, then loop a tailored yolo-council review/fix until only nits remain',
}

// These sibling workflows are resolved by their final registered name, which
// the plugin loader prefixes with this plugin's name ("skills", per
// .claude-plugin/marketplace.json) — not the bare `meta.name` from their own
// files. If that plugin name ever changes, update these two strings to match.
//
// No phase()/meta.phases here: every agent() call in this script happens inside a nested
// workflow(), and a nested workflow's agents always report under their own "▸ <child-name>"
// group in /workflows — never under a phase label declared in the parent. A parent-level phase
// wrapping only workflow() calls would just be a permanently-empty category.

// Some harnesses hand `args` through as a JSON-encoded string rather than the parsed object.
const ARGS = typeof args === 'string' ? JSON.parse(args) : args

const implemented = await workflow('skills:supervised-forge-implement', { issueNumber: ARGS.issueNumber })
log(`Implementation done — PR #${implemented.prNumber} opened (${implemented.prUrl})`)

if (!implemented.testsPassed) {
  log(`Warning: tests were not green going into the review loop — ${implemented.testSummary}`)
}

const reviewed = await workflow('skills:review-fix-loop-lite', {
  prNumber: implemented.prNumber,
  repoSlug: ARGS.repoSlug,
  repoPath: ARGS.repoPath,
})

return {
  ...implemented,
  reviewRounds: reviewed.rounds,
  reviewDone: reviewed.done,
  openFindings: reviewed.openFindings,
}
