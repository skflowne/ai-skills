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

Post all verified findings in **one Pull Request Review** through the [Pull Request Reviews API](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request):

```
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

Do not post inline comments, one review per finding, or a sequence of top-level PR comments. Put the canonical [pr-review](../pr-review/SKILL.md#review-output-contract) result in one review `body`. Always submit it as a normal comment with `event: "COMMENT"`; never use `"REQUEST_CHANGES"` or `"APPROVE"`.

### Preferred: Node.js + gh

Use the helper script. Build the JSON in code or write it to a temporary file; do not use shell heredocs. Omit `comments` so the review is a single post:

```javascript
node -e "
const { spawnSync } = require('node:child_process');
const payload = JSON.stringify({
  event: 'COMMENT',
  body: '## Findings\\n\\n### Major — stale state can overwrite a newer save\\n`src/foo.ts:42` ...\\n\\n## Resolution chunks\\n\\n### Chunk 1 — centralize write ordering\\n...',
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

Reference the issue number in the consolidated review body (`Tracked in #<n>.`).

Every PR follow-up issue title must use the format `[PR#<number> FU] <title>` (for example, `[PR#42 FU] Add browser coverage`).

Follow-up issues must also be sized for one agent. When several dependent chunks are needed, follow the parent/child orchestration guidance in [create-issue](../create-issue/SKILL.md).

## Review body structure

Follow the canonical [review output contract](../pr-review/SKILL.md#review-output-contract).

For a clear review, post `No findings.` plus only material `Validation` or `Limitations` lines. Do not add headings, expert verdicts, empty plans, `None` placeholders, dropped-candidate explanations, or a summary of what passed review.

When findings exist, use this order and omit every empty section:

1. **Findings** — verified issues only, ordered by severity. Include severity, concise description, realistic failure scenario, evidence, and `path:line` where applicable. The scenario must state trigger, mechanism, impact, and plausibility. Drop structural smells and hypotheticals that cannot meet that standard.
2. **Resolution chunks** — current-PR work grouped by shared root cause, invariant, and dependency boundary. Reference finding IDs rather than repeating evidence or impact. Each chunk states only its outcome, owned scope, dependencies, acceptance criteria, and focused validation.
3. **Follow-up issues** — links to verified work that should not be completed in the current PR.

Each chunk must be actionable by one agent in one focused run. Split unrelated ownership or broad context; merge fragments that cannot be implemented or validated independently. Do not add a second fix-plan or classification section: the chunks are the plan, and classification belongs inline as compact metadata.

## Finding severity labels

Use consistently in the review body:

- **Blocker** — must fix before merge
- **Major** — likely bug or significant gap
- **Minor** — follow-up, test gap, inconsistency
- **Nit** — style, optional polish

## Common pitfalls

| Pitfall | Fix |
|---------|-----|
| Finding points to unchanged code | Cite the unchanged `path:line` in the review body and explain how the PR exposes the issue |
| Wrong line number | Read file at PR head: `git show origin/<branch>:path` |
| Several findings share one cause | Keep distinct findings, but assign them to one resolution chunk |

## Council-review handoff

When the user approves the fix plan after a council review:

1. Read this skill.
2. Build one review body containing all verified findings and agent-sized resolution chunks; do not build inline comments.
3. Post the body once via `post-pr-review.mjs` with `event: "COMMENT"`, never `"REQUEST_CHANGES"`.
4. Create follow-up issues only for work outside the current PR; size each for one agent and link `#<issue>` in the review body.
