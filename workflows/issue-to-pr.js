export const meta = {
  name: 'issue-to-pr',
  description: 'Verify issue context and existing work, implement the remaining GitHub issue scope with Supervised Forge, then loop a tailored yolo-council review/fix until only nits remain',
  whenToUse: 'Launch via the run-workflow skill, not directly — it discovers issue state and existing work, preflights the working tree, and pins the base branch once for both stages, which this workflow cannot do for itself. args MUST be an object: { issueNumber: <positive integer>, repoSlug: "owner/name", repoPath: "/abs/path", baseBranch: "main", allowDirtyTree: false }. Passing a bare string ("5") makes issueNumber undefined.',
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
const ARGS = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { throw new Error('args arrived as a string that is not valid JSON') } })()
  : args
if (ARGS == null || typeof ARGS !== 'object') throw new Error('args must be an object like { issueNumber: 123 }')

// repoSlug/repoPath go to both children: without them every agent resolves the repo from cwd's
// default remote, and implementing in one checkout while reviewing another would be the worst
// possible split. Both children validate issueNumber/prNumber strictly themselves.
const implemented = await workflow('skills:supervised-implement', {
  issueNumber: ARGS.issueNumber,
  repoSlug: ARGS.repoSlug,
  repoPath: ARGS.repoPath,
  // Resolved (and, when ambiguous, confirmed with the user) by the launch skill before this run
  // started. Absent, the child falls back to the repo's default branch — never the current HEAD.
  baseBranch: ARGS.baseBranch,
  allowDirtyTree: ARGS.allowDirtyTree,
})
log(`Implementation done — PR #${implemented.prNumber} opened (${implemented.prUrl})`)

if (!implemented.testsPassed) {
  log(`Warning: tests were not green going into the review loop — ${implemented.testSummary}`)
}

// No baseBranch here on purpose: review works from the PR number alone, which determines its own
// head branch.
//
// allowDirtyTree is hardcoded true rather than forwarded, and that is not a bypass of the human
// gate — it is the gate applied at the only point where it can mean anything. The implement stage
// above already ran the check against the same checkout, either finding it clean or carrying an
// explicit yes from launch. What the review stage would re-check is the tree as it looks minutes or
// hours later, after an implement run long enough for the user to have edited something in the
// meantime — a state nobody was ever asked about and nobody can be asked about now, since this call
// is non-interactive. A refusal there aborts the composite after the PR is already open, stranding a
// branch that never gets reviewed. Nothing is risked by continuing: the review stage creates its own
// worktree and only ever reads the checkout (`git fetch`, `git worktree add`), both of which are
// safe on a dirty tree, and it never stashes, resets, or moves HEAD.
const reviewed = await workflow('skills:review-supervised', {
  prNumber: implemented.prNumber,
  repoSlug: ARGS.repoSlug,
  repoPath: ARGS.repoPath,
  allowDirtyTree: true,
})

return {
  ...implemented,
  // The implement child's finish-gate residuals stay visible under their own key; openFindings is
  // the review loop's final verdict, which supersedes them as the branch's current state.
  implementOpenFindings: implemented.openFindings,
  openFindings: reviewed.openFindings,
  reviewRounds: reviewed.rounds,
  reviewDone: reviewed.done,
}
