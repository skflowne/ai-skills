---
name: github-pr-review
description: "Post GitHub PR reviews (summary + inline comments), create follow-up issues, and fetch PR/issue context via gh CLI. Use when posting council-review findings, leaving inline PR comments, opening follow-up issues, or any gh pull-request review workflow."
---

# GitHub PR review

Mechanics for interacting with GitHub via `gh`. For review *content* standards, see [pr-review](../pr-review/SKILL.md). For multi-agent orchestration, see [council-review](../council-review/SKILL.md).

**Prerequisites:** `gh` authenticated (`gh auth status`). Run commands from the git repo root.

## Fetch context

```bash
gh pr view <number> --json title,body,number,state,baseRefName,headRefName,headRefOid,url,files,commits,closingIssuesReferences
gh pr diff <number>
gh issue view <number> --json title,body,number,state
```

Resolve inline-comment line numbers from the PR branch (not `main` if they differ):

```bash
git fetch origin <head-branch>
git show origin/<head-branch>:<path>   # inspect file at PR head
```

Or use the PR files API for patch context:

```bash
gh api repos/{owner}/{repo}/pulls/<number>/files --jq ".[] | {path: .filename, patch: .patch}"
```

## Post a review (summary + inline comments)

`gh pr comment` only adds a top-level comment. **Inline review comments** require the [Pull Request Reviews API](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request):

```
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

Each inline comment needs:

| Field | Value |
|-------|-------|
| `path` | File path in the repo |
| `line` | Line number on the **new** side of the diff |
| `side` | `"RIGHT"` (added/changed lines) |
| `body` | Comment markdown |

The payload also needs `commit_id` (PR head SHA) and `event`: `"COMMENT"` (neutral), `"APPROVE"`, or `"REQUEST_CHANGES"`.

### Preferred: Node.js + gh

Use the helper script — no temp JSON files, no heredocs:

```bash
node .agents/skills/github-pr-review/scripts/post-pr-review.mjs <pr-number> <<'PAYLOAD'
{
  "event": "COMMENT",
  "body": "## Review summary\n\nApprove — no blockers.",
  "comments": [
    {
      "path": "src/foo.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "**Minor** — explanation here."
    }
  ]
}
PAYLOAD
```

Or build the payload in Node and pipe to the script:

```javascript
node -e "
const { spawnSync } = require('node:child_process');
const payload = JSON.stringify({
  event: 'COMMENT',
  body: '## Summary\n\nApprove.',
  comments: [{ path: 'src/foo.ts', line: 42, side: 'RIGHT', body: 'Note' }],
});
spawnSync('node', ['.agents/skills/github-pr-review/scripts/post-pr-review.mjs', '62'], {
  input: payload, stdio: ['pipe', 'inherit', 'inherit'],
});
"
```

The script auto-fetches `headRefOid` and `owner/repo` from `gh`.

### Alternative: gh api with a body file

```bash
gh api repos/{owner}/{repo}/pulls/<number>/reviews --input review.json
```

Use `--body-file` for issue bodies; avoid inlining long multi-line `--body` text.

### Verify comments landed

```bash
gh api repos/{owner}/{repo}/pulls/<number>/comments --jq ".[] | {path: .path, line: .line, body: .body[0:60]}"
```

Review summary URL: `gh pr view <number> --json reviews --jq '.reviews[-1].url'`

## Create a follow-up issue

When council review finds non-blocking gaps, use [github-issue-create](../github-issue-create/SKILL.md) (not raw `gh` heredocs):

```bash
node .agents/skills/github-issue-create/scripts/create-github-issue.mjs --title "..." --body-file issue-body.md
```

Or JSON with a parent link:

```json
{
  "title": "...",
  "bodyFile": "issue-body.md",
  "commentOn": 82,
  "commentOnBody": "Follow-up from council review of PR #<pr>: #{issue}"
}
```

Reference the issue number in the PR review summary and inline comments (`Tracked in #<n>.`).

## Comment severity labels

Use consistently in inline `body` text:

- **Blocker** — must fix before merge
- **Major** — likely bug or significant gap
- **Minor** — follow-up, test gap, inconsistency
- **Nit** — style, optional polish

## Common pitfalls

| Pitfall | Fix |
|---------|-----|
| Comment on unchanged file line not in diff | Mention in summary `body` only, or comment on a nearby changed line in a related file |
| Wrong line number | Read file at PR head: `git show origin/<branch>:path` |
| `boundingBox` / zoom in e2e | See review content; post on the test file with correct PR-head line |

## Council-review handoff

When the user approves the fix plan after a council review:

1. Read this skill.
2. Build `comments` array from verified findings (path, line, severity, body, issue link).
3. Post via `post-pr-review.mjs`.
4. Create follow-up issue if gaps remain; link `#<issue>` in summary and inline comments.
