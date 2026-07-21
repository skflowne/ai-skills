// Alternate provider config for the codex-dynamic-workflows ports in this directory — same shape
// and same generic tier keys ('large'/'medium'/'small') as codex-workflow.config.ts, routed to
// Kimi models instead of Codex/GPT. The workflow scripts (review-fix-loop.js /
// implement-issue-flow.js / issue-to-pr.js) are unchanged either way — only --config differs:
//
//   codex-workflow run workflows-codex/issue-to-pr.js \
//     --config workflows-codex/codex-workflow.config.kimi.ts \
//     --args '{"issueNumber": 123}'
//
// Uses pi's own already-authenticated Kimi/Moonshot session (see `pi --list-models`, providers
// "moonshotai" / "kimi-coding") — no secrets in this file. moonshotai/kimi-k2.7-code is pi's own
// interactive default model on this machine (~/.pi/agent/settings.json), reused here as "medium".

export default {
  providers: {
    // kimi-k3: largest context/output in the catalog (1M/131K) — the "large" tier.
    'kimi-large': {
      backend: 'pi',
      piProvider: 'moonshotai',
      model: 'kimi-k3',
      models: ['large'],
      thinking: 'high',
      contextFiles: true,
    },
    // kimi-k2.7-code: pi's own interactive default — general implementation/orchestration work.
    'kimi-medium': {
      backend: 'pi',
      piProvider: 'moonshotai',
      model: 'kimi-k2.7-code',
      models: ['medium'],
      contextFiles: true,
    },
    // The "-highspeed" variant only exists under the kimi-coding provider namespace (not
    // moonshotai) — same underlying account/key, just a different pi provider id.
    'kimi-small': {
      backend: 'pi',
      piProvider: 'kimi-coding',
      model: 'kimi-for-coding-highspeed',
      models: ['small'],
      contextFiles: true,
    },
  },
  default: 'kimi-medium',
}
