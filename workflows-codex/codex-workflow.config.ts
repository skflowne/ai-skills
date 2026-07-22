// Default role-based provider config for this repo's codex-dynamic-workflows ports.
//
// Workflow scripts select generic work roles (`provider: 'design'`, `provider: 'review'`, etc.)
// rather than capability tiers or concrete model IDs. Untagged calls use `default: 'general'`.
// The alternate Kimi config exposes exactly the same role keys, so switching backends requires
// only a different --config path.
//
// All routes in this file use one upstream pi provider namespace: `openai-codex`. Authentication
// comes from pi's existing authenticated session; this file contains no keys or other secrets.
//
// Usage:
//   codex-workflow run workflows-codex/issue-to-pr.js \
//     --config workflows-codex/codex-workflow.config.ts \
//     --args '{"issueNumber": 123}'

const codex = (model: string, thinking?: 'medium' | 'high') => ({
  backend: 'pi' as const,
  piProvider: 'openai-codex',
  model,
  ...(thinking ? { thinking } : {}),
  contextFiles: true,
})

export default {
  providers: {
    general: codex('gpt-5.6-sol', 'medium'),
    design: codex('gpt-5.6-sol', 'medium'),
    // Council synthesis waits for a reviewer fan-out, then independently validates findings.
    supervisor: { ...codex('gpt-5.6-sol', 'high'), agentTimeoutMs: 25 * 60 * 1000 },
    review: codex('gpt-5.6-terra', 'medium'),
    judge: codex('gpt-5.6-terra', 'medium'),
    implement: codex('gpt-5.6-terra', 'medium'),
    fix: codex('gpt-5.6-terra', 'medium'),
    // Fix orchestration is mutation-capable and may supervise long-running child agents.
    // Do not abort it mid-write at the runner's default 15-minute timeout.
    orchestrator: { ...codex('gpt-5.6-sol', 'high'), agentTimeoutMs: 0 },
    test: codex('gpt-5.4-mini'),
  },
  default: 'general',
}
