export const meta = {
  name: 'fast-issue-to-pr',
  description: 'Implement a GitHub issue with TDD Forge, then loop council + yolo-council review/fix until only nits remain',
}

// These sibling workflows are resolved by their final registered name, which
// the plugin loader prefixes with this plugin's name ("skills", per
// .claude-plugin/marketplace.json).
//
// No phase()/meta.phases here: every agent() call in this script happens inside a nested
// workflow(), and a nested workflow's agents always report under their own "▸ <child-name>"
// group in /workflows — never under a phase label declared in the parent. A parent-level phase
// wrapping only workflow() calls would just be a permanently-empty category.

// Some harnesses hand `args` through as a JSON-encoded string rather than the parsed object.
const ARGS = typeof args === 'string' ? JSON.parse(args) : args

const implemented = await workflow('skills:fast-implement', { issueNumber: ARGS.issueNumber })
log(`Implementation done — PR #${implemented.prNumber} opened (${implemented.prUrl})`)

const reviewed = await workflow('skills:review-fix-loop', {
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
