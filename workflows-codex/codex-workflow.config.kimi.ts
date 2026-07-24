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
    // Read-only periodic PR progress scout; keep each pass bounded.
    reporter: { ...moonshot('kimi-k2.5'), excludeTools: ['edit', 'write'], agentTimeoutMs: 5 * 60 * 1000 },

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
    { match: '*:fix:before-head', provider: 'judge' },
    { match: '*:fix:verify-remote', provider: 'judge' },
    { match: '*:yolo:supervisor', provider: 'supervisor' },
    { match: '*:yolo:roster', provider: 'supervisor' },
    { match: '*:yolo:synthesis', provider: 'supervisor' },
    { match: '*:yolo:*', provider: 'review' },
    { match: '*:council:*', provider: 'review' },
    { match: '*:scout:*', provider: 'reporter' },
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
  // Fallback for a `model: 'opus'` hint (e.g. meta.phases[].model) that a label route above
  // doesn't already cover.
  modelAliases: { opus: 'design' },
}
