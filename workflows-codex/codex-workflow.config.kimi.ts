// Alternate role-based provider config for this repo's codex-dynamic-workflows ports.
//
// It exposes the same generic work-role keys as codex-workflow.config.ts, so workflow scripts do
// not change when this config is selected. Each role may choose the upstream pi provider and model
// best suited to it; authentication comes from pi's existing sessions and no secrets are stored here.
//
// Usage:
//   codex-workflow run workflows-codex/issue-to-pr.js \
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

    // Coding roles use Kimi K2.7 Code; test execution uses Kimi K2.5.
    implement: moonshot('kimi-k2.7-code'),
    fix: moonshot('kimi-k2.7-code'),
    // Fix orchestration is mutation-capable and may supervise long-running child agents.
    // Do not abort it mid-write at the runner's default 15-minute timeout.
    orchestrator: { ...moonshot('kimi-k3', 'high'), agentTimeoutMs: 0 },
    test: moonshot('kimi-k2.5'),
  },
  default: 'general',
}
