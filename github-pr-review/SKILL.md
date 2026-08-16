---
name: github-pr-review
description: "Post GitHub PR findings as one consolidated review, create follow-up issues, and fetch PR/issue context via gh CLI. Use only when the user explicitly names and requests this skill."
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

Resolve finding locations from the PR branch (not `main` if they differ):

```bash
git fetch origin <head-branch>
git show origin/<head-branch>:<path>   # inspect file at PR head
```

Or use the PR files API for patch context:

```bash
gh api repos/{owner}/{repo}/pulls/<number>/files --jq ".[] | {path: .filename, patch: .patch}"
```

## Post one consolidated review

Post the canonical review body in **one Pull Request Review** through the [Pull Request Reviews API](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request):

```
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

Do not post inline comments, multiple reviews, or a sequence of top-level PR comments. Put the complete canonical output in the review `body`. Always submit the review as a normal comment with `event: "COMMENT"`; never use `"REQUEST_CHANGES"` or `"APPROVE"`.

### Preferred: Node.js + gh

Use the helper script. Build the JSON in code or write it to a temporary file; do not use shell heredocs. Omit `comments` so the review is a single post:

```javascript
node -e "
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const payload = JSON.stringify({
  event: 'COMMENT',
  body: readFileSync('review-body.md', 'utf8'),
});
spawnSync('node', ['.agents/skills/github-pr-review/scripts/post-pr-review.mjs', '62'], {
  input: payload, stdio: ['pipe', 'inherit', 'inherit'],
});
"
```

The script auto-fetches `headRefOid` and `owner/repo` from `gh`.

### Verify the review landed

```bash
gh pr view <number> --json reviews --jq '.reviews[-1] | {url: .url, body: .body}'
```

## Prepare the review body

Render the findings and resolution plan using the canonical [review output contract](../pr-review/SKILL.md#review-output-contract). Link any GitHub follow-up issues from its follow-up-work section.

## Council-review handoff

When the user approves the fix plan after a council review:

1. Read this skill and the canonical [pr-review](../pr-review/SKILL.md) contract.
2. For follow-up work, apply [create-issue](../create-issue/SKILL.md) for content and decomposition, then [github-issue-create](../github-issue-create/SKILL.md) for creation mechanics and title conventions.
3. Render the canonical review output as one body, linking every created `#<issue>`; do not build inline comments.
4. Post the completed body once via `post-pr-review.mjs` with `event: "COMMENT"`, never `"REQUEST_CHANGES"`.
