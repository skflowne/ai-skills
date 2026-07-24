// Default role-based provider config for running this repo's `workflows/*.js` Claude Code
// workflow scripts through codex-dynamic-workflows.
//
// The workflow scripts are harness-portable: they never name a provider or a concrete model.
// `routes` maps each agent's `label` glob to a work role (`review`, `judge`, `design`, etc.); an
// unmatched label falls through to `default: 'general'`. `modelAliases` catches the rare
// Claude-style capability hint (`agent({model: 'opus'})`) that isn't already covered by a label
// route. The alternate Kimi config exposes exactly the same role keys and the same `routes` /
// `modelAliases`, so switching backends requires only a different --config path.
//
// All routes in this file use one upstream pi provider namespace: `openai-codex`. Authentication
// comes from pi's existing authenticated session; this file contains no keys or other secrets.
//
// Usage:
//   codex-workflow run workflows/issue-to-pr.js \
//     --config workflows-codex/codex-workflow.config.ts \
//     --args '{"issueNumber": 123}'

const codex = (model: string, thinking?: 'low' | 'medium' | 'high') => ({
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
    // Read-only periodic PR progress scout; keep each pass bounded. It runs back-to-back for the
    // whole duration of every phase, so the cheap tier here is what makes continuous visibility
    // affordable.
    reporter: { ...codex('gpt-5.6-luna', 'low'), excludeTools: ['edit', 'write'], agentTimeoutMs: 5 * 60 * 1000 },
    // Writes the live PR report comment. Same cheap tier as the scout — the body arrives
    // pre-rendered from the workflow script, so this role only copies it through and calls gh — but
    // it needs write tools for the scratch file the body is posted from.
    report: { ...codex('gpt-5.6-luna', 'low'), agentTimeoutMs: 5 * 60 * 1000 },
    implement: codex('gpt-5.6-terra', 'medium'),
    fix: codex('gpt-5.6-terra', 'medium'),
    // Fix orchestration runs supervised-forge (self-implement + one persistent reviewer) across
    // several milestone gates; do not abort it mid-write at the runner's default 15-minute timeout.
    orchestrator: { ...codex('gpt-5.6-sol', 'high'), agentTimeoutMs: 0 },
    test: codex('gpt-5.4-mini'),
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
