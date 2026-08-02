---
name: pre-issue-implementation
description: Prepare a concrete, codebase-grounded implementation plan for an existing GitHub issue, simplify the plan by removing overengineering, and post the final plan to the issue with a Mermaid diagram. Use before beginning implementation of an issue.
---

# Pre-issue implementation plan

Plan an existing GitHub issue before changing code. The output of this skill is a comment on the issue, not an implementation.

## 1. Establish the target

- Require an issue number or URL. If none is provided or inferable from the current branch, stop and ask for it.
- Read the issue, linked issues or pull requests, repository instructions, and relevant discussion.
- Inspect the current code and tests far enough to identify the actual symbols, files, call paths, conventions, and constraints involved.
- Keep planning read-only: do not create a branch or edit product code.
- Separate verified facts from assumptions. Resolve cheap factual questions through repository or documentation research. Ask the user only about genuine product or architecture decisions.

## 2. Draft a concrete plan

Write an implementation plan another agent can execute without repeating the investigation. It must include:

1. **Goal and current behavior** — the intended outcome and the relevant behavior that exists today.
2. **Implementation approach** — the chosen design and why it fits existing repository patterns.
3. **Affected areas** — concrete file paths and symbols when known. Do not invent paths or names.
4. **Implementation steps** — ordered, specific changes. For each step, state what changes, where it changes, and how it connects to adjacent steps.
5. **Tests and validation** — exact behaviors to cover and the relevant test suites or commands when known.
6. **Risks and boundaries** — compatibility, migration, rollout, security, performance, or operational concerns that materially apply. State deliberate non-goals when they prevent scope creep.
7. **Mermaid diagram** — a valid fenced `mermaid` diagram showing the planned component, control, or data flow. Use the diagram type that best explains the change; do not add a decorative diagram that merely repeats the step list.

Use concrete language. Prefer concise examples when they can replace lengthy explanation, and do not repeat in prose what an example already makes clear. Do not leave placeholders such as “update logic,” “wire it up,” “handle edge cases,” or “add tests.” Name the logic, integration point, edge cases, and expected assertions.

## 3. Remove overkill

After drafting, review the entire plan before posting it. Revise it to remove:

- speculative abstractions or extension points not required by the issue,
- unrelated refactors, cleanup, dependencies, or tooling,
- duplicate validation or layers already provided by existing code,
- artificial task splitting for tightly coupled work,
- migration, compatibility, observability, or rollout work unsupported by an actual risk,
- tests that duplicate coverage without protecting new or changed behavior,
- optional enhancements disguised as requirements.

Keep necessary safeguards and regression coverage. A shorter plan is not better if it omits required behavior, integration work, or realistic failure paths.

Before posting, confirm that every remaining step is necessary for the issue's acceptance criteria, grounded in inspected code, and specific enough to implement. The posted comment must contain only the final, simplified plan; do not include discarded draft material.

## 4. Post the plan

Post the final plan as a new issue comment so the original issue description remains intact.
Treat that first plan comment as the canonical plan: if the plan is revised later, edit the original comment in place instead of posting another plan comment. Preserve or recover its comment URL or ID so updates target the correct comment.

1. Write the comment to a scratch Markdown file, preferably `.agents/tmp/pre-issue-plan-<issue>.md`.
2. Check the Markdown includes a fenced `mermaid` block and that the diagram syntax is internally consistent.
3. Post with a body file, never an inline multiline body or heredoc:

   ```bash
   gh issue comment <issue-number-or-url> --body-file .agents/tmp/pre-issue-plan-<issue>.md
   ```

4. Verify the comment appears on the intended issue and retains the Mermaid block.
5. Delete the scratch file.
6. Return the issue and comment URLs to the user.

Do not begin implementation unless the user separately asks for it.
