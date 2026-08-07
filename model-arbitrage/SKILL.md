---
name: model-arbitrage
description: "Send one identical prompt to two model runs in parallel, then arbitrate their answers into a single final answer that attributes what came from whom and records what was discarded. Use only when the user explicitly names and requests this skill."
---

# Model Arbitrage

Two model runs answer the same prompt independently. You, the parent agent, are the **arbiter**: you judge the two answers, merge what survives, and write the final answer yourself. Never forward one model's answer as the result, and never delegate the arbitration.

## 1. Settle the prompt and the two models

The prompt is whatever the user asked to arbitrate. Pass it to both models **verbatim and identical** — same wording, same context, same attachments. Do not tailor either copy, do not tell either model that another model is running, and do not hint at a preferred answer.

If the user did not say which models should answer, ask with `AskUserQuestion` before spawning anything. Offer the model identifiers this harness exposes on the `Agent` tool — typically `opus`, `sonnet`, `haiku`, `fable` — as one multi-select question ("Which models should answer?"). Requirements:

- Two runs. The two models may be **the same or different** — the same model twice is a valid choice and yields two independent samples. If the user picks exactly one model, run it twice rather than asking again; only re-ask if they pick more than two or none.
- If the user names a model this harness cannot spawn (e.g. an external CLI like `codex` or `gemini`), either drive it through the equivalent bundled helper or say plainly that it is unavailable and ask for a substitute. Do not silently swap in a different model.

If the prompt itself is ambiguous, resolve that with the user *before* spawning — a bad prompt sent twice just buys two bad answers.

## 2. Spawn both, in parallel

Both `Agent` calls go in a **single message** so they run concurrently. Same prompt, same agent type; `model` may differ or match:

```typescript
Agent({ subagent_type: "general-purpose", model: "<model A>", description: "...", prompt: "<the prompt, verbatim>" })
Agent({ subagent_type: "general-purpose", model: "<model B>", description: "...", prompt: "<the prompt, verbatim>" })
```

Label the two runs **A** and **B** from the start and keep those labels through to the final output — when both runs use the same model, the label is the only thing that tells them apart.

Append the same closing instruction to both copies:

```text
Answer this on your own. Report your answer, your reasoning, the evidence behind each substantive claim (file/line references, command output, test results, or authoritative sources), your confidence, and anything you were unsure about or could not verify. Do not spawn sub-agents.
```

Keep both runs **read-only by default**, even for implementation tasks: have them return the proposed change (diff or plan) rather than write it, and apply the arbitrated version yourself. Only let them edit when the task genuinely requires it, and then give each `isolation: "worktree"` so they cannot collide.

Wait for both before arbitrating. If one fails or returns nothing, say so, arbitrate on what you have, and mark the missing side explicitly in the final output — do not quietly present a single-model answer as arbitrated.

## 3. Arbitrate

Both reports are evidence, not verdicts.

- Verify every decisive claim yourself — read the file, run the command, fetch the doc. An unverifiable claim does not enter the final answer.
- Judge on evidence and correctness, never on length, confidence, polish, or which model you like.
- Where they agree, check whether they agree for a *good* reason; two runs can share the same wrong assumption — especially two runs of the same model, where agreement is weak evidence.
- Where they conflict, resolve it with evidence and name the assumption that made them diverge. Say so if the evidence does not settle it.
- Take the best parts of each — the final answer may be a merge, one model's answer, or neither.
- If both are wrong or incomplete, answer it yourself and record that.

## 4. Deliver

Lead with the answer. Attribution and the discard ledger come at the end, and both are mandatory.

```markdown
[The final arbitrated answer, written by you, in whatever form the task calls for.]

---

## Attribution
- **Both runs agreed:** [what they converged on and that survived verification]
- **A ({model}) only:** [what came uniquely from run A]
- **B ({model}) only:** [what came uniquely from run B]
- **Arbiter:** [what you added, corrected, or verified beyond either report]

## Discarded
| Claim / suggestion | From | Why discarded |
|---|---|---|
| ... | A ({model}) | [wrong, unverifiable, out of scope, duplicated, speculative] |

## Unresolved
- [Conflicts the evidence did not settle, and what would settle them. Omit if none.]
```

Keep the ledger honest and proportional: every substantive point a run made that did not reach the final answer belongs in **Discarded** with a reason. Skip trivial phrasing differences. If one run contributed nothing that survived, say that outright. Always name the model beside each run label, even when both are the same model.
