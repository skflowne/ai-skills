---
name: codegraph-evaluation
description: "Evaluate CodeGraph during real repository work, including its availability, index health, successful invocations, useful discoveries, limitations, fallback searches, and worktree initialization. Use only when the user explicitly names and requests this skill."
---

# CodeGraph Evaluation

Evaluate CodeGraph through the actual task rather than a synthetic demo. Use it first where repository guidance requires it, record every invocation, and report both what it found and where narrower tools were still necessary.

## Preflight

1. Check whether the CodeGraph tool is available.
2. Check for `.codegraph/codegraph.db` from the repository or current worktree root and record its initial byte size when present.
3. Distinguish these states in the report:
   - tool unavailable;
   - tool available but repository not indexed;
   - tool and index available.
4. Do not claim CodeGraph was evaluated when calls could not reach an index.

Some projects do not initialize CodeGraph in newly created Paseo worktrees. Fix the durable cause by updating the repository's `paseo.json` worktree setup script to run CodeGraph initialization or sync. Use the `paseo.json` files in the `locus` or `ai-usage` projects as examples. Commit that configuration change to `main`; an already-created worktree still requires manual CodeGraph initialization and then a rebase onto `main`.

Respect repository rules around index ownership. Outside an explicit CodeGraph evaluation or setup request, do not initialize a missing index without user approval.

## Evaluation procedure

1. Start with CodeGraph exploration before broad file reads, `rg`, or `find` for architecture, behavior, symbol location, call paths, and blast radius.
2. Prefer focused natural-language questions or related symbol bundles. For example, ask for a UI entry point, its client boundary, its router mutation, persistence effects, and shared test helpers as one flow when those concerns are related.
3. Record every invocation, including:
   - sequence number;
   - exact question or symbol bundle;
   - success or failure;
   - useful files, symbols, or call paths returned;
   - truncation, irrelevant matches, or missing material;
   - any follow-up `read`, `rg`, or `find` and why it was needed.
4. Treat CodeGraph output as repository context, not infallible proof. Verify ambiguous or incomplete results with the narrowest targeted tool.
5. Use narrow reads or targeted `rg` only after CodeGraph exploration when filling known gaps. Common gaps include truncated JSX tails, Markdown discovery, and exact E2E spec lookup returning production symbols instead.
6. At the end, record the index's final byte size when useful and summarize the tool's practical value for the task.

## Reporting

Write the complete report under `.codegraph-evals/` and commit it with the task. Prefix each short kebab-case filename with the report creation time as a compact UTC timestamp (`YYYYMMDDTHHMMSSZ`), followed by the task and every known GitHub identifier:

- `20260729T174237Z-issue-123-planning-ritual-resume.md`
- `20260729T174237Z-pr-456-planner-regression-review.md`
- `20260729T174237Z-issue-123-pr-456-persistence-fix.md` when both are known

Keep the task portion specific enough that concurrent implementation and fix-chunk evaluations do not collide. Never overwrite an unrelated report; use the current creation timestamp and, if a collision remains, refine the task slug or add a numeric suffix. Create the directory when needed.

Also include the concise summary in the PR description or final task report and link to the committed report. Use this shape in the report file:

```markdown
## CodeGraph evaluation

- Tool available: yes/no
- Index: `.codegraph/codegraph.db` (initially <bytes> bytes)
- Invocations: <successful>/<total> succeeded
- Most useful for:
  - <symbol, boundary, flow, or blast-radius discovery>
- Limitations:
  - <specific truncation, discovery, or relevance problem>
- Fallbacks:
  - <narrow read or targeted search used after exploration, with reason>

### Per-call report

| # | Query | Result | Useful discovery | Gap / fallback |
|---|---|---|---|---|
| 1 | ... | Success | ... | ... |
```

A representative successful evaluation may report that all 11 invocations succeeded, the index at `.codegraph/codegraph.db` initially measured 11,804,672 bytes, and CodeGraph was most useful for locating `PlanningRitualModal`, the `PlannerClient` resume boundary, `dayPlanRouter.completePlanning`, persistence blast radius, and shared E2E helpers. It should also state observed limitations: JSX tails were frequently truncated, Markdown discovery was ineffective, and exact E2E spec queries often returned production symbols instead. Record that narrow reads and targeted `rg` were used only after CodeGraph exploration to fill those gaps. Keep the complete per-call evidence in the `.codegraph-evals/` report and link it from the PR description.
