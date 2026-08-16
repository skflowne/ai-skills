---
name: explore
description: "Explore a large codebase or broad technical question with proportionally sized scout-agent fanout while keeping the parent context lean. Use only when the user explicitly names and requests this skill."
---

# Explore

Use scout agents to cover broad exploration quickly without flooding the parent context. The parent owns decomposition, synthesis, and conclusions; scouts only retrieve focused evidence.

## 1. Size the exploration

Estimate breadth, coupling, uncertainty, and how independently the area can be divided. Keep delegation proportional:

- **Small, localized lookup:** inspect directly; do not create fanout merely because this skill was invoked.
- **Medium exploration:** use 1-2 scouts for distinct questions or areas.
- **Large exploration:** use 3-4 scouts with non-overlapping slices.
- **Very large, heterogeneous exploration:** start with at most 5 scouts. Add another targeted pass only for a concrete evidence gap.

Prefer fewer well-scoped scouts over a large overlapping swarm. Parallelize independent discovery, not duplicate searches.

## 2. Choose economical models

Inspect the available agents and live model mapping before launching when the harness supports it. Use the configured `scout` agent and prefer a fast, low- or medium-capability model:

- Use a low-capability model for file discovery, symbol location, pattern inventory, and other bounded retrieval.
- Use a medium-capability model for call-flow tracing, cross-module relationships, convention comparison, or moderately ambiguous questions.
- Use a high-capability model only when the exploration itself requires difficult semantic judgment and a lower tier is unlikely to succeed.

Keep the scout's default model when it already fits. Do not use an expensive model merely because the parent uses one. Escalate only the failed or contradictory slice, not the entire fanout.

## 3. Partition by useful boundaries

Give each scout one clear, read-only slice, such as:

- one subsystem or directory
- one runtime path or data flow
- tests and verification conventions
- configuration, integration points, or public contracts
- callers, dependencies, risks, or likely change surface

Include only the goal, scope, known entry points, and questions needed for that slice. Use fresh context when possible; do not copy the full parent conversation. Tell scouts not to edit files or spawn sub-agents.

## 4. Enforce compressed scout output

Every scout prompt must require **only decision-relevant findings**. Use this output contract, adjusted downward for simpler slices:

```text
Return only the key information the parent needs.
- Maximum 5-8 bullets and roughly 300-500 words.
- Cite exact file paths and line ranges for every code claim.
- Include only: important entry points, relationships/data flow, constraints or risks, and unresolved evidence gaps.
- Do not narrate your search process, repeat the task, dump large code blocks, provide generic advice, or list irrelevant files.
- If nothing relevant exists, say so in one sentence.
- Do not edit files or spawn sub-agents.
```

Disable verbose progress and unnecessary saved output where supported. Give parallel scouts unique scopes and, if artifacts are needed, unique output paths.

Example shape:

```typescript
subagent({
  tasks: [
    { agent: "scout", model: "<economical-low-or-medium-model>", task: "Map the request-entry flow for <target>. <compressed output contract>", output: false, progress: false },
    { agent: "scout", model: "<economical-low-or-medium-model>", task: "Find tests and validation conventions for <target>. <compressed output contract>", output: false, progress: false },
    { agent: "scout", model: "<economical-low-or-medium-model>", task: "Trace dependencies and likely change surface for <target>. <compressed output contract>", output: false, progress: false }
  ],
  context: "fresh",
  concurrency: 3,
  async: true
})
```

Omit the explicit `model` override when the configured scout model is already suitable. Adjust task count, concurrency, and output limits to the exploration rather than copying the example mechanically.

## 5. Synthesize without importing noise

After scouts return:

1. Deduplicate overlapping findings.
2. Resolve contradictions from cited source; launch one narrow follow-up only if necessary.
3. Personally inspect the few load-bearing files or sources before relying on decisive claims.
4. Produce one compact map of the relevant area, key evidence, remaining uncertainty, and recommended next inspection or action.
5. Do not paste raw scout reports into the answer or working context.

Stop when the user's questions are covered with enough evidence to act. Exploration is not a reason to inventory the entire repository.
