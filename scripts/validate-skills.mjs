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

/**
 * Index of the closing quote of the quoted YAML scalar starting at index 0 of
 * `text`, or -1 when the scalar is not closed on that line. Handles `\"` inside
 * a double-quoted scalar and the `''` escape inside a single-quoted one.
 */
function findScalarQuoteEnd(text) {
    const quote = text[0];
    for (let i = 1; i < text.length; i++) {
        if (quote === '"' && text[i] === "\\") {
            i++;
            continue;
        }
        if (text[i] === quote) {
            if (quote === "'" && text[i + 1] === "'") {
                i++;
                continue;
            }
            return i;
        }
    }
    return -1;
}

/** True when the raw value opens a quoted scalar that is not closed on the same line. */
function hasUnterminatedQuote(rawValue) {
    const trimmed = rawValue.trim();
    const quote = trimmed[0];
    if (quote !== '"' && quote !== "'") return false;
    return findScalarQuoteEnd(trimmed) === -1;
}

/** Drop a YAML end-of-line comment (` #...`, or a leading `#`) from a plain scalar. */
function stripComment(text) {
    const match = /(?:^|\s)#/.exec(text);
    return match ? text.slice(0, match.index) : text;
}

/**
 * Normalise a raw frontmatter value: unwrap a quoted scalar (dropping anything
 * after its closing quote, e.g. a trailing ` # comment`) or, for a plain scalar,
 * strip the end-of-line comment.
 */
function stripQuotes(value) {
    const trimmed = value.trim();
    const quote = trimmed[0];
    if (quote === '"' || quote === "'") {
        const end = findScalarQuoteEnd(trimmed);
        if (end === -1) return trimmed; // unterminated: report the raw text
        const inner = trimmed.slice(1, end);
        return quote === '"' ? inner.replace(/\\(.)/g, "$1") : inner.replace(/''/g, "'");
    }
    return stripComment(trimmed).trim();
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

        // A block scalar always continues onto following lines, and so does a
        // quoted flow scalar whose closing quote is on a later line (which YAML
        // folds into a single value, however the continuation is indented).
        let multiline = /^[|>]/.test(rawValue.trim()) || hasUnterminatedQuote(rawValue);

        // Otherwise look ahead: any indented, non-empty line before the next
        // top-level `key:` (or the closing `---`) is a value continuation.
        for (let j = i + 1; !multiline && j < end; j++) {
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
    // The multiline check comes first: a value written on the line(s) after its
    // key parses as an empty inline value, and "must be a single line" is the
    // accurate diagnostic for it.
    if (description && description.multiline) {
        addProblem(skillPath, "frontmatter `description` must be a single line");
    } else if (!description || description.value === "") {
        addProblem(skillPath, "frontmatter `description` is missing or empty");
    }
}

const META_DECLARATION = /export\s+const\s+meta\s*=\s*\{/y;
// A key at the top level of the object literal: bare, "double" or 'single' quoted.
const META_KEY = /(?:"([^"\\]*)"|'([^'\\]*)'|([A-Za-z_$][A-Za-z0-9_$]*))\s*:/y;

// Keywords after which a `/` starts a regex literal rather than a division.
const REGEX_ALLOWED_KEYWORDS = new Set([
    "return", "typeof", "case", "in", "of", "instanceof", "new", "delete",
    "void", "do", "else", "yield", "await", "throw",
]);

// Tokens after which a `/` starts a regex literal rather than a division.
// `null` covers the start of the file; `"keyword"` stands for any member of
// REGEX_ALLOWED_KEYWORDS. The tokens deliberately absent are the ones that end a
// value: `"ident"` (identifier or number), `"str"`, `"regex"`, `)` and `]`.
const REGEX_ALLOWED_AFTER = new Set([
    null, "keyword", "(", ",", "=", "=>", ":", "[", "!", "&", "|", "?", "{", "}",
    ";", "+", "-", "*", "%", "<", ">", "^", "~",
]);

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/**
 * Index of the closing quote of the string starting at `start`, or -1 if
 * unterminated. Template literals are scanned interpolation-aware, so a
 * template nested inside a `${ ... }` (and any quote or brace in that
 * expression) cannot close the outer template early.
 */
function findStringEnd(content, start) {
    const quote = content[start];
    if (quote === "`") return findTemplateEnd(content, start);
    for (let i = start + 1; i < content.length; i++) {
        if (content[i] === "\\") {
            i++;
            continue;
        }
        if (content[i] === quote) return i;
    }
    return -1;
}

/** Index of the backtick closing the template literal starting at `start`, or -1. */
function findTemplateEnd(content, start) {
    for (let i = start + 1; i < content.length; i++) {
        const char = content[i];
        if (char === "\\") {
            i++;
            continue;
        }
        if (char === "`") return i;
        if (char === "$" && content[i + 1] === "{") {
            const end = findInterpolationEnd(content, i + 1);
            if (end === -1) return -1;
            i = end;
        }
    }
    return -1;
}

/**
 * Index of the `}` closing the interpolation whose `{` is at `start`, or -1.
 * Runs the same token-level skipping as `extractMetaKeys` (comments, strings,
 * nested templates, regex literals) so only real braces move the depth.
 */
function findInterpolationEnd(content, start) {
    let depth = 0;
    let prev = null; // start of an expression: a `/` here is a regex

    for (let i = start; i < content.length; i++) {
        const char = content[i];
        const next = content[i + 1];

        if (char === "/" && next === "/") {
            const newline = content.indexOf("\n", i);
            if (newline === -1) return -1;
            i = newline;
            continue;
        }
        if (char === "/" && next === "*") {
            const end = content.indexOf("*/", i + 2);
            if (end === -1) return -1;
            i = end + 1;
            continue;
        }
        if (/\s/.test(char)) continue;

        if (char === '"' || char === "'" || char === "`") {
            const end = findStringEnd(content, i);
            if (end === -1) return -1; // unterminated: bail out rather than desync
            i = end;
            prev = "str";
            continue;
        }

        if (char === "/" && REGEX_ALLOWED_AFTER.has(prev)) {
            const end = findRegexEnd(content, i);
            if (end !== -1) {
                i = end;
                prev = "regex";
                continue;
            }
        }

        if (IDENT_START.test(char)) {
            let end = i + 1;
            while (end < content.length && IDENT_PART.test(content[end])) end++;
            prev = REGEX_ALLOWED_KEYWORDS.has(content.slice(i, end)) ? "keyword" : "ident";
            i = end - 1;
            continue;
        }

        if (char === "=" && next === ">") {
            i++;
            prev = "=>";
            continue;
        }

        if (char === "{") depth++;
        else if (char === "}") {
            depth--;
            if (depth === 0) return i;
        }
        prev = char;
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
 * quote inside a regex (`/don't/`) cannot desync the scan, wherever that regex
 * appears (`=> /re/`, `return /re/`, ...). An unterminated
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
                prev = "str";
                continue;
            }
            // Unterminated: not a string literal, fall through as an ordinary character.
        }

        if (char === "/" && REGEX_ALLOWED_AFTER.has(prev)) {
            const end = findRegexEnd(content, i);
            if (end !== -1) {
                i = end;
                prev = "regex";
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
                continue;
            }
        }

        // Consume whole identifiers/keywords so `prev` is a token, not a letter:
        // `return /re/` must be seen as a regex, `x / y` as a division.
        if (IDENT_START.test(char)) {
            let end = i + 1;
            while (end < content.length && IDENT_PART.test(content[end])) end++;
            prev = REGEX_ALLOWED_KEYWORDS.has(content.slice(i, end)) ? "keyword" : "ident";
            i = end - 1;
            continue;
        }

        if (char === "=" && next === ">") {
            i++;
            prev = "=>";
            continue;
        }

        if (!inMeta) {
            prev = char;
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
// order they were found. The path comparison is a plain codepoint comparison
// (not localeCompare) so ordering matches discovery order and does not depend
// on the runtime locale or ICU build.
problems.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.order - b.order));

// The summary and final status always go to stdout; problems always to stderr.
console.log(
    `Checked ${plural(skillDirs.length, "skill")}, ${plural(workflowFiles.length, "workflow")}, and 1 marketplace manifest.`,
);

for (const problem of problems) {
    console.error(`${problem.path}: ${problem.message}`);
}

if (problems.length > 0) {
    console.log(`FAIL: ${plural(problems.length, "problem")} found.`);
    // Set exitCode rather than calling process.exit(1): writes to piped
    // stdout/stderr are async on POSIX and process.exit() would drop any
    // still-queued output, truncating the problem list.
    process.exitCode = 1;
} else {
    console.log("OK: all checks passed.");
}
