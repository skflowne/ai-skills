// Provider config for the codex-dynamic-workflows ports of this repo's Claude Code workflows
// (review-fix-loop.js / implement-issue-flow.js / issue-to-pr.js in this same directory).
//
// Routes everything through the `pi` backend using pi's own already-authenticated Anthropic
// session (`piProvider: 'anthropic'` — see `pi --list-models`). No apiKeyEnv/baseUrl/secrets
// in this file at all; pi resolves credentials itself the same way it does interactively.
//
// Usage:
//   codex-workflow run workflows-codex/issue-to-pr.js \
//     --config workflows-codex/codex-workflow.config.ts \
//     --args '{"issueNumber": 123}'
//
// Requires (see ../CLAUDE.md of codex-dynamic-workflows for the full prerequisite list):
//   - Bun installed (workflow bodies execute in a Bun child process)
//   - `pi` CLI installed and logged in (`pi --list-models` should list anthropic/* models)
//   - `gh` authenticated (`gh auth status`) — these workflows drive PRs/issues via gh
//   - ~/.agents/skills discoverable by pi (global symlink to this ai-skills repo) so
//     `/skill:pr-review`, `/skill:orchestrate`, etc. resolve — see docs/skills.md in
//     @earendil-works/pi-coding-agent for pi's skill-discovery rules.

export default {
  providers: {
    'pi-default': {
      backend: 'pi',
      piProvider: 'anthropic',
      model: 'claude-sonnet-5',
      contextFiles: true, // load the target repo's own AGENTS.md/CLAUDE.md, like Claude Code does
    },

    // Routes agent({model:'opus'}) calls — the design/initial-review/final-review phases in
    // implement-issue-flow.js — to a stronger model. 'opus' is a routing alias only: pi is
    // always sent the concrete id in `model` below, never the raw 'opus' string.
    'pi-opus': {
      backend: 'pi',
      piProvider: 'anthropic',
      model: 'claude-opus-4-8',
      models: ['opus'],
      thinking: 'high',
      contextFiles: true,
    },
  },
  default: 'pi-default',
}
