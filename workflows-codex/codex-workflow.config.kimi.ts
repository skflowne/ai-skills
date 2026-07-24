// Alternate role-based provider config for running this repo's `workflows/*.js` Claude Code
// workflow scripts through codex-dynamic-workflows.
//
// It exposes the same generic work-role keys, `routes`, and `modelAliases` as
// codex-workflow.config.ts, so switching backends requires only a different --config path. Each
// role may choose the upstream pi provider and model best suited to it; authentication comes from
// pi's existing sessions and no secrets are stored here.
//
// Usage:
//   codex-workflow run workflows/issue-to-pr.js \
//     --config workflows-codex/codex-workflow.config.kimi.ts \
//     --args '{"issueNumber": 123}'

const moonshot = (model: string, thinking?: 'high') => ({
  backend: 'pi' as const,
  piProvider: 'moonshotai',
  model,
  ...(thinking ? { thinking } : {}),
  contextFiles: true,
})

export default {
  providers: {
    // General coordination and repository operations.
    general: moonshot('kimi-k2.7-code'),

    // Reasoning-heavy roles.
    design: moonshot('kimi-k3', 'high'),
    // Council synthesis waits for a reviewer fan-out, then independently validates findings.
    supervisor: { ...moonshot('kimi-k3', 'high'), agentTimeoutMs: 25 * 60 * 1000 },
    review: moonshot('kimi-k3', 'high'),
    judge: moonshot('kimi-k3', 'high'),
    // Read-only periodic PR progress scout; keep each pass bounded. It runs back-to-back for the
    // whole duration of every phase, so the cheap tier here is what makes continuous visibility
    // affordable.
    reporter: { ...moonshot('kimi-k2.5'), excludeTools: ['edit', 'write'], agentTimeoutMs: 5 * 60 * 1000 },
    // Writes the live PR report comment. Same cheap tier as the scout — the body arrives
    // pre-rendered from the workflow script, so this role only copies it through and calls gh — but
    // it needs write tools for the scratch file the body is posted from.
    report: { ...moonshot('kimi-k2.5'), agentTimeoutMs: 5 * 60 * 1000 },

    // Coding roles use Kimi K2.7 Code; test execution uses Kimi K2.5.
    implement: moonshot('kimi-k2.7-code'),
    fix: moonshot('kimi-k2.7-code'),
    // Fix orchestration runs supervised-forge (self-implement + one persistent reviewer) across
    // several milestone gates; do not abort it mid-write at the runner's default 15-minute timeout.
    orchestrator: { ...moonshot('kimi-k3', 'high'), agentTimeoutMs: 0 },
    test: moonshot('kimi-k2.5'),
  },
  default: 'general',
  // Checked before model routing; first glob match (against agent().label) wins. Kept in label
  // specificity order — the yolo/fix sub-roles before their broader `*:judge`/`*:review` fallbacks.
  routes: [
    { match: '*:fix:orchestrator', provider: 'orchestrator' },
    { match: '*:fix:checkout', provider: 'judge' },
    { match: '*:fix:group', provider: 'judge' },
    // Cross-chain conflict resolution — same role the `opus` model alias maps to, mirroring the
    // script's `model: 'opus'` hint (routes are checked before aliases, so this must match it).
    { match: '*:fix:integrate', provider: 'design' },
    { match: '*:fix:push', provider: 'judge' },
    { match: '*:fix:verify-remote', provider: 'judge' },
    { match: '*:yolo:supervisor', provider: 'supervisor' },
    { match: '*:yolo:roster', provider: 'supervisor' },
    // Merged synthesize+judge pass — still the supervisor role, not the lighter `*:judge` tier.
    { match: '*:yolo:judge', provider: 'supervisor' },
    { match: '*:yolo:*', provider: 'review' },
    { match: '*:council:*', provider: 'review' },
    { match: '*:scout:*', provider: 'reporter' },
    { match: 'report:*', provider: 'report' },
    { match: '*:judge', provider: 'judge' },
    { match: '*:review', provider: 'review' },
    { match: '*:fix', provider: 'fix' },
    { match: 'design:*', provider: 'design' },
    { match: 'implement', provider: 'implement' },
    { match: 'e2e:implement', provider: 'implement' },
    { match: 'implement:tdd-forge', provider: 'implement' },
    { match: 'e2e:run-tests', provider: 'test' },
    { match: 'final-review:rerun-tests', provider: 'test' },
  ],
  // Fallback for a Claude-style capability hint (e.g. `agent({model: 'opus'})`,
  // `meta.phases[].model`) that a label route above doesn't already cover. The cheap hints map to
  // the cheap roles so a script asking for a small model doesn't land on `general`.
  modelAliases: { opus: 'design', sonnet: 'report', haiku: 'reporter' },
}
