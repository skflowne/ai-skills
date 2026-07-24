#!/usr/bin/env node
// Validates the skill directories in this repo.
// Collects every problem found, prints one line per problem, exits 1 if any.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Top-level directories that are not skills.
const EXCLUDED_DIRS = new Set(["scripts", "workflows", "workflows-codex"]);

const KEY_LINE = /^([A-Za-z0-9_.-]+)\s*:\s?(.*)$/;

const problems = [];

function addProblem(filePath, message) {
    problems.push({
        path: relative(REPO_ROOT, filePath) || filePath,
        message,
        order: problems.length,
    });
}

function stripQuotes(value) {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed;
}

/**
 * Parse a `---`-delimited YAML frontmatter block using line scanning.
 * Returns null when there is no frontmatter block.
 * Each entry: { value, multiline }.
 */
function parseFrontmatter(content) {
    const lines = content.replace(/^﻿/, "").split(/\r?\n/);
    if (lines.length === 0 || lines[0].trim() !== "---") return null;

    let end = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
            end = i;
            break;
        }
    }
    if (end === -1) return null;

    const entries = new Map();
    for (let i = 1; i < end; i++) {
        const match = KEY_LINE.exec(lines[i]);
        if (!match) continue; // continuation / blank / list item handled below
        const key = match[1];
        const rawValue = match[2];

        // A block scalar always continues onto following lines.
        let multiline = /^[|>]/.test(rawValue.trim());

        // Otherwise look ahead: any indented, non-empty line before the next
        // top-level `key:` (or the closing `---`) is a value continuation.
        for (let j = i + 1; j < end; j++) {
            const next = lines[j];
            if (next.trim() === "") continue;
            if (KEY_LINE.test(next)) break; // next top-level key
            if (!/^\s/.test(next)) break; // unindented (e.g. a `# comment`)
            multiline = true;
            break;
        }

        entries.set(key, { value: stripQuotes(rawValue), multiline });
    }
    return entries;
}

function validateSkill(dirName) {
    const skillPath = join(REPO_ROOT, dirName, "SKILL.md");
    if (!existsSync(skillPath)) {
        addProblem(join(REPO_ROOT, dirName), "missing SKILL.md");
        return;
    }

    let content;
    try {
        content = readFileSync(skillPath, "utf8");
    } catch (error) {
        addProblem(skillPath, `could not be read: ${error.message}`);
        return;
    }

    const frontmatter = parseFrontmatter(content);
    if (frontmatter === null) {
        addProblem(skillPath, "missing or unterminated `---` YAML frontmatter block");
        return;
    }

    const name = frontmatter.get("name");
    if (!name || name.value === "") {
        addProblem(skillPath, "frontmatter `name` is missing or empty");
    } else if (name.value !== dirName) {
        addProblem(
            skillPath,
            `frontmatter \`name\` is "${name.value}" but the directory is "${dirName}"`,
        );
    }

    const description = frontmatter.get("description");
    if (!description || description.value === "") {
        addProblem(skillPath, "frontmatter `description` is missing or empty");
    } else if (description.multiline) {
        addProblem(skillPath, "frontmatter `description` must be a single line");
    }
}

const META_DECLARATION = /export\s+const\s+meta\s*=\s*\{/y;
// A key at the top level of the object literal: bare, "double" or 'single' quoted.
const META_KEY = /(?:"([^"\\]*)"|'([^'\\]*)'|([A-Za-z_$][A-Za-z0-9_$]*))\s*:/y;

// Characters after which a `/` starts a regex literal rather than a division.
// `null` covers the start of the file.
const REGEX_ALLOWED_AFTER = new Set([null, "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";"]);

/** Index of the closing quote of the string starting at `start`, or -1 if unterminated. */
function findStringEnd(content, start) {
    const quote = content[start];
    for (let i = start + 1; i < content.length; i++) {
        if (content[i] === "\\") {
            i++;
            continue;
        }
        if (content[i] === quote) return i;
    }
    return -1;
}

/** Index of the closing `/` of the regex literal starting at `start`, or -1 if there is none. */
function findRegexEnd(content, start) {
    let inClass = false;
    for (let i = start + 1; i < content.length; i++) {
        const char = content[i];
        if (char === "\\") {
            i++;
            continue;
        }
        if (char === "\n") return -1; // regex literals cannot span lines
        if (inClass) {
            if (char === "]") inClass = false;
            continue;
        }
        if (char === "[") inClass = true;
        else if (char === "/") return i;
    }
    return -1;
}

/**
 * Return the set of top-level keys of the `export const meta = { ... }` object
 * literal, or null when there is no such (terminated) declaration.
 *
 * A single scan skips comments, string literals and regex literals, so neither
 * the declaration nor the keys can be faked by a doc comment or a string, and a
 * quote inside a regex (`/don't/`) cannot desync the scan. An unterminated
 * string/regex is treated as an ordinary character rather than swallowing the
 * rest of the file.
 *
 * Keys are only recorded at depth 1 and only where a key may actually appear
 * (right after the opening `{` or a `,`), so nested objects/arrays
 * (e.g. `phases: [ { name } ]`) and value expressions (e.g. the `name :` of a
 * ternary) do not satisfy a top-level key requirement.
 */
function extractMetaKeys(content) {
    const keys = new Set();
    let inMeta = false;
    let depth = 0;
    let prev = null; // last significant character (comments and whitespace ignored)

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const next = content[i + 1];

        if (char === "/" && next === "/") {
            const newline = content.indexOf("\n", i);
            if (newline === -1) break;
            i = newline;
            continue;
        }
        if (char === "/" && next === "*") {
            const end = content.indexOf("*/", i + 2);
            if (end === -1) break;
            i = end + 1;
            continue;
        }
        if (/\s/.test(char)) continue;

        if (inMeta && depth === 1 && (prev === "{" || prev === ",")) {
            META_KEY.lastIndex = i;
            const keyMatch = META_KEY.exec(content);
            if (keyMatch) {
                keys.add(keyMatch[1] ?? keyMatch[2] ?? keyMatch[3]);
                i = META_KEY.lastIndex - 1; // resume on the `:`
                prev = ":";
                continue;
            }
        }

        if (char === '"' || char === "'" || char === "`") {
            const end = findStringEnd(content, i);
            if (end !== -1) {
                i = end;
                prev = char;
                continue;
            }
            // Unterminated: not a string literal, fall through as an ordinary character.
        }

        if (char === "/" && REGEX_ALLOWED_AFTER.has(prev)) {
            const end = findRegexEnd(content, i);
            if (end !== -1) {
                i = end;
                prev = "/";
                continue;
            }
        }

        if (!inMeta) {
            META_DECLARATION.lastIndex = i;
            if (META_DECLARATION.exec(content)) {
                inMeta = true;
                depth = 1;
                i = META_DECLARATION.lastIndex - 1; // index of the opening `{`
                prev = "{";
            } else {
                prev = char;
            }
            continue;
        }

        if (char === "{" || char === "[") depth++;
        else if (char === "}" || char === "]") {
            depth--;
            if (depth === 0) return keys;
        }
        prev = char;
    }
    return null; // missing or unterminated
}

function validateWorkflow(filePath) {
    let content;
    try {
        content = readFileSync(filePath, "utf8");
    } catch (error) {
        addProblem(filePath, `could not be read: ${error.message}`);
        return;
    }

    const metaKeys = extractMetaKeys(content);
    if (metaKeys === null) {
        addProblem(filePath, "missing or unterminated `export const meta = {` declaration");
        return;
    }

    for (const key of ["name", "description"]) {
        if (!metaKeys.has(key)) {
            addProblem(filePath, `meta object is missing \`${key}:\``);
        }
    }
}

const MANIFEST_PATH = join(REPO_ROOT, ".claude-plugin", "marketplace.json");

function validateManifest() {
    let content;
    try {
        content = readFileSync(MANIFEST_PATH, "utf8");
    } catch (error) {
        addProblem(
            MANIFEST_PATH,
            error.code === "ENOENT" ? "missing marketplace manifest" : `could not be read: ${error.message}`,
        );
        return;
    }

    let manifest;
    try {
        manifest = JSON.parse(content);
    } catch (error) {
        addProblem(MANIFEST_PATH, `is not valid JSON: ${error.message}`);
        return;
    }

    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
        addProblem(MANIFEST_PATH, "must contain a JSON object at the top level");
        return;
    }

    for (const key of ["name", "description"]) {
        const value = manifest[key];
        if (typeof value !== "string" || value.trim() === "") {
            addProblem(MANIFEST_PATH, `top-level \`${key}\` is missing or empty`);
        }
    }

    if (!Array.isArray(manifest.plugins)) {
        addProblem(MANIFEST_PATH, "top-level `plugins` is missing or is not an array");
    } else if (manifest.plugins.length === 0) {
        addProblem(MANIFEST_PATH, "top-level `plugins` array is empty");
    }
}

function findWorkflowFiles() {
    const workflowsDir = join(REPO_ROOT, "workflows");
    if (!existsSync(workflowsDir)) return [];
    return readdirSync(workflowsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
        .map((entry) => join(workflowsDir, entry.name))
        .sort();
}

function findSkillDirs() {
    return readdirSync(REPO_ROOT, { withFileTypes: true })
        .filter((entry) => {
            if (!entry.isDirectory() && !entry.isSymbolicLink()) return false;
            if (entry.isSymbolicLink() && !statSync(join(REPO_ROOT, entry.name), { throwIfNoEntry: false })?.isDirectory()) {
                return false;
            }
            if (entry.name.startsWith(".")) return false;
            if (EXCLUDED_DIRS.has(entry.name)) return false;
            return true;
        })
        .map((entry) => entry.name)
        .sort();
}

function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const skillDirs = findSkillDirs();
for (const dirName of skillDirs) {
    validateSkill(dirName);
}

const workflowFiles = findWorkflowFiles();
for (const filePath of workflowFiles) {
    validateWorkflow(filePath);
}

validateManifest();

// Deterministic output: group by path, keeping each file's problems in the
// order they were found.
problems.sort((a, b) => a.path.localeCompare(b.path) || a.order - b.order);

// The summary and final status always go to stdout; problems always to stderr.
console.log(
    `Checked ${plural(skillDirs.length, "skill")}, ${plural(workflowFiles.length, "workflow")}, and 1 marketplace manifest.`,
);

for (const problem of problems) {
    console.error(`${problem.path}: ${problem.message}`);
}

if (problems.length > 0) {
    console.log(`FAIL: ${plural(problems.length, "problem")} found.`);
    process.exit(1);
}

console.log("OK: all checks passed.");
