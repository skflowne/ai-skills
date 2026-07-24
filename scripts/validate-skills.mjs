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
    problems.push(`${relative(REPO_ROOT, filePath) || filePath}: ${message}`);
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

    const content = readFileSync(skillPath, "utf8");
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

for (const dirName of findSkillDirs()) {
    validateSkill(dirName);
}

if (problems.length > 0) {
    for (const problem of problems) {
        console.error(problem);
    }
    console.error(`\n${problems.length} problem(s) found.`);
    process.exit(1);
}

console.log("All skills valid.");
