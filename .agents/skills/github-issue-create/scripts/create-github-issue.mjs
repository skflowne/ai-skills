#!/usr/bin/env node
/**
 * Create a GitHub issue via gh CLI (cross-platform; avoids PowerShell heredocs).
 *
 * Usage:
 *   node create-github-issue.mjs < payload.json
 *   node create-github-issue.mjs --title "..." --body-file issue.md
 *
 * JSON payload (stdin) fields:
 *   title          - required
 *   body           - markdown body (optional if bodyFile is set)
 *   bodyFile       - path to markdown file (wins over body)
 *   labels         - string[] (optional)
 *   commentOn      - parent issue number; posts commentOnBody after create (optional)
 *   commentOnBody  - comment markdown; `{issue}` replaced with new issue number
 *
 * Prints JSON: { "number": 83, "url": "https://github.com/..." }
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function gh(...args) {
  return execFileSync("gh", args, { encoding: "utf-8" }).trim();
}

function parseArgs(argv) {
  const out = { title: undefined, bodyFile: undefined };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--title") {
      out.title = argv[++i];
    } else if (arg === "--body-file") {
      out.bodyFile = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node create-github-issue.mjs < payload.json
  node create-github-issue.mjs --title "..." --body-file path.md

See script header for JSON payload fields.`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return out;
}

function readBodyMarkdown(input) {
  if (input.bodyFile) {
    return readFileSync(resolve(input.bodyFile), "utf-8");
  }
  if (typeof input.body === "string" && input.body.length > 0) {
    return input.body;
  }
  console.error('Error: provide "body" or "bodyFile" in the payload');
  process.exit(1);
}

function parseIssueNumber(url) {
  const match = /\/issues\/(\d+)\s*$/.exec(url.trim());
  if (!match) {
    console.error(`Error: could not parse issue number from gh output: ${url}`);
    process.exit(1);
  }
  return Number(match[1]);
}

function loadInput() {
  const cli = parseArgs(process.argv);
  const hasCli = cli.title !== undefined || cli.bodyFile !== undefined;

  if (hasCli) {
    if (!cli.title || !cli.bodyFile) {
      console.error("Error: --title and --body-file are both required in CLI mode");
      process.exit(1);
    }
    return { title: cli.title, bodyFile: cli.bodyFile, labels: [], commentOn: undefined, commentOnBody: undefined };
  }

  const stdin = readFileSync(0, "utf-8").trim();
  if (!stdin) {
    console.error("Usage: node create-github-issue.mjs < payload.json");
    console.error("   or: node create-github-issue.mjs --title \"...\" --body-file issue.md");
    process.exit(1);
  }

  try {
    const input = JSON.parse(stdin);
    if (!input.title || typeof input.title !== "string") {
      console.error('Error: payload must include a non-empty "title" string');
      process.exit(1);
    }
    return input;
  } catch (err) {
    console.error("Error: invalid JSON on stdin:", err.message);
    process.exit(1);
  }
}

const input = loadInput();
const bodyMarkdown = readBodyMarkdown(input);

const tempDir = mkdtempSync(join(tmpdir(), "origami-issue-"));
const bodyPath = join(tempDir, "body.md");
writeFileSync(bodyPath, bodyMarkdown, "utf-8");

try {
  const createArgs = ["issue", "create", "--title", input.title, "--body-file", bodyPath];
  for (const label of input.labels ?? []) {
    createArgs.push("--label", label);
  }

  const url = gh(...createArgs);
  const number = parseIssueNumber(url);

  if (input.commentOn !== undefined && input.commentOn !== null) {
    const parent = String(input.commentOn);
    const commentBody =
      typeof input.commentOnBody === "string"
        ? input.commentOnBody.replaceAll("{issue}", String(number))
        : `Follow-up: #${number}`;

    const commentPath = join(tempDir, "comment.md");
    writeFileSync(commentPath, commentBody, "utf-8");
    gh("issue", "comment", parent, "--body-file", commentPath);
  }

  console.log(JSON.stringify({ number, url }));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
