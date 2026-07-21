// Default provider config for the codex-dynamic-workflows ports of this repo's Claude Code
// workflows (review-fix-loop.js / implement-issue-flow.js / issue-to-pr.js in this directory).
//
// Routes through the `pi` backend's `openai-codex` provider — pi's own already-authenticated
// Codex/ChatGPT OAuth session (see `pi --list-models`, provider "openai-codex"). No apiKeyEnv/
// baseUrl/secrets in this file; pi resolves credentials itself the same way it does interactively.
//
// The workflow scripts use generic tier keys (`agent({model:'large'|'small'})`, untagged calls
// fall through to `default` = "medium"), never a concrete model id — see codex-workflow.config.kimi.ts
// for a same-shape alternate that routes those same tier keys to Kimi models instead. Swap backends
// with `--config`, no script changes needed.
//
// Usage:
//   codex-workflow run workflows-codex/issue-to-pr.js \
//     --config workflows-codex/codex-workflow.config.ts \
//     --args '{"issueNumber": 123}'
//
// Requires (see ../CLAUDE.md of codex-dynamic-workflows for the full prerequisite list):
//   - Bun installed (workflow bodies execute in a Bun child process)
//   - `pi` CLI installed and logged in (`pi --list-models` should list openai-codex/* models)
//   - `gh` authenticated (`gh auth status`) — these workflows drive PRs/issues via gh
//   - ~/.agents/skills discoverable by pi (global symlink to this ai-skills repo) so
//     `/skill:pr-review`, `/skill:orchestrate`, etc. resolve — see docs/skills.md in
//     @earendil-works/pi-coding-agent for pi's skill-discovery rules.
//   - pi's pi-native-search / pi-web-access / pi-agent-browser-native extensions give it real
//     web_search/web_fetch tools and a native `agent-browser` tool — the prompts below assume
//     these (`pi list` shows them installed already on this machine).

export default {
  providers: {
    // Tier picks: gpt-5.6-terra is pi's current top-generation Codex model (large); gpt-5.4 is the
    // prior generation, a step down in cost/capability (medium/default); gpt-5.4-mini is the
    // explicitly "mini" variant (small) — for cheap, high-volume, or purely mechanical calls
    // (writing/fixing code under a reviewer's supervision, running tests). Adjust freely — these
    // are just labels in one file, not load-bearing anywhere else.
    'codex-large': {
      backend: 'pi',
      piProvider: 'openai-codex',
      model: 'gpt-5.6-terra',
      models: ['large'],
      thinking: 'high',
      contextFiles: true,
    },
    'codex-medium': {
      backend: 'pi',
      piProvider: 'openai-codex',
      model: 'gpt-5.4',
      models: ['medium'],
      contextFiles: true,
    },
    'codex-small': {
      backend: 'pi',
      piProvider: 'openai-codex',
      model: 'gpt-5.4-mini',
      models: ['small'],
      contextFiles: true,
    },
  },
  default: 'codex-medium',
}
