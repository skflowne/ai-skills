#!/usr/bin/env node
/**
 * Post a GitHub PR review (summary + inline comments) via gh api.
 *
 * Usage:
 *   node post-pr-review.mjs <pr-number> < review.json
 *   echo '{"body":"...","comments":[...]}' | node post-pr-review.mjs 62
 *
 * Payload fields (JSON on stdin):
 *   event    - "COMMENT" | "APPROVE" | "REQUEST_CHANGES" (default: COMMENT)
 *   body     - review summary markdown (required)
 *   comments - array of { path, line, side?, body } (optional)
 *
 * commit_id and owner/repo are resolved automatically via gh.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function gh(...args) {
  return execFileSync("gh", args, { encoding: "utf-8" }).trim();
}

const prNumber = process.argv[2];
if (!prNumber || !/^\d+$/.test(prNumber)) {
  console.error("Usage: node post-pr-review.mjs <pr-number>  (JSON payload on stdin)");
  process.exit(1);
}

const stdin = readFileSync(0, "utf-8").trim();
if (!stdin) {
  console.error("Error: empty stdin — pipe or redirect a JSON payload");
  process.exit(1);
}

let input;
try {
  input = JSON.parse(stdin);
} catch (err) {
  console.error("Error: invalid JSON on stdin:", err.message);
  process.exit(1);
}

if (!input.body) {
  console.error('Error: payload must include a "body" string (review summary)');
  process.exit(1);
}

const prMeta = JSON.parse(gh("pr", "view", prNumber, "--json", "headRefOid"));
const repoMeta = JSON.parse(gh("repo", "view", "--json", "nameWithOwner"));

const payload = {
  commit_id: prMeta.headRefOid,
  event: input.event ?? "COMMENT",
  body: input.body,
  comments: (input.comments ?? []).map((c) => ({
    path: c.path,
    line: c.line,
    side: c.side ?? "RIGHT",
    body: c.body,
  })),
};

const endpoint = `repos/${repoMeta.nameWithOwner}/pulls/${prNumber}/reviews`;

const result = execFileSync(
  "gh",
  ["api", endpoint, "--input", "-"],
  { input: JSON.stringify(payload), encoding: "utf-8" },
);

const review = JSON.parse(result);
console.log(review.html_url ?? String(review.id));
