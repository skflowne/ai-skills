---
name: github-issue-create
description: "Create GitHub issues via gh CLI with a cross-platform helper script. Use when filing issues after create-issue interviews, opening follow-up issues, or any gh issue create workflow."
---

# GitHub issue create

Mechanics for creating GitHub issues via `gh`. For *what* to put in an issue (interview, architecture plan), see [create-issue](../create-issue/SKILL.md).

**Prerequisites:** `gh` authenticated (`gh auth status`). Run commands from the git repo root.

## Preferred: helper script

Use the script — no bash heredocs, no ad-hoc `gh issue create --body "..."`:

```bash
node .agents/skills/github-issue-create/scripts/create-github-issue.mjs --title "Issue title" --body-file path/to/body.md
```

Or pipe a JSON payload on **stdin** (good for follow-up comments + labels):

```bash
node .agents/skills/github-issue-create/scripts/create-github-issue.mjs < payload.json
```

`payload.json`:

```json
{
  "title": "Add Image Outpaint node",
  "bodyFile": ".agents/tmp/issue-body.md",
  "labels": ["enhancement"],
  "commentOn": 82,
  "commentOnBody": "Follow-up: #{issue} — promote AspectRatioPicker to Prompt Canvas."
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | Issue title |
| `body` | one of `body` / `bodyFile` | Markdown body inline |
| `bodyFile` | one of `body` / `bodyFile` | Path to markdown file (preferred for long bodies) |
| `labels` | no | Array of label names |
| `commentOn` | no | Parent issue number — posts a comment after create |
| `commentOnBody` | no | Comment markdown; `{issue}` → new issue number |

**Output:** JSON on stdout: `{"number":83,"url":"https://github.com/..."}`

### Typical agent workflow

1. Draft the issue body in a scratch file under `.agents/tmp/` (already gitignored):

```text
.agents/tmp/issue-body.md
```

2. Create the issue:

```bash
node .agents/skills/github-issue-create/scripts/create-github-issue.mjs --title "Your title" --body-file .agents/tmp/issue-body.md
```

3. Delete the scratch file when done (do not commit issue drafts unless the user asks).

4. Return the issue URL to the user.

### Follow-up issue (links parent)

```bash
node .agents/skills/github-issue-create/scripts/create-github-issue.mjs <<'EOF'
{
  "title": "Adopt shared AspectRatioPicker on Prompt Canvas",
  "bodyFile": ".agents/tmp/follow-up-body.md",
  "commentOn": 82,
  "commentOnBody": "Follow-up: #{issue} — shared AspectRatioPicker on Prompt Canvas."
}
EOF
```

## Verify

```bash
gh issue view <number> --json title,body,number,url,labels
gh issue list --limit 5
```

## Raw gh (fallback only)

If the script is unavailable, use `--body-file` — **never** inline multi-line `--body` text:

```bash
gh issue create --title "Title" --body-file issue-body.md
gh issue comment 82 --body-file comment.md
```

## Common pitfalls

| Pitfall | Fix |
|---------|-----|
| `gh issue create --body "..."` with long markdown | Write a file; use `--body-file` or `bodyFile` in JSON |
| Committing scratch issue drafts | Delete `.agents/tmp/*.md` after create |
| Wrong shell chaining | One command per `Shell` call when unsure |

## create-issue handoff

When the [create-issue](../create-issue/SKILL.md) interview is complete:

1. Write the architecture plan to a scratch markdown file.
2. Create via this skill's script (not ad-hoc `gh` with heredocs).
3. For follow-ups, set `commentOn` to the parent issue number.
4. Give the user the issue URL from the script's JSON output.
