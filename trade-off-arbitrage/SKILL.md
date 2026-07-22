---
name: trade-off-arbitrage
description: Analyze a decision by delegating to two opposing expert subagents—an advocate and a skeptic—then independently arbitrate their evidence into a balanced trade-off analysis. Use for consequential, ambiguous, or contested choices with realistic alternatives.
---

# Trade-off Arbitrage

Use two independent, opposing expert perspectives to expose the strongest case for and against a decision. You, the parent model, are the **arbiter**: you decide what evidence matters, resolve disagreements, and write the final analysis. Do not delegate the final recommendation.

## 1. Frame the decision

Identify or ask concise questions about:

- the decision, realistic options, and status quo where relevant
- goals, success criteria, constraints, stakeholders, and time horizon
- what evidence is available and which uncertainties are material

State assumptions if proceeding without essential details. Do not invent facts, requirements, costs, or sources.

## 2. Launch the opposing experts

Before executing, call `subagent({ action: "list" })` and use only executable, non-disabled agents. Launch exactly two read-only advisory subagents in parallel with `context: "fresh"`. Use `researcher` when outside evidence is useful; otherwise use `delegate` or another available read-only analysis agent.

Give both experts the *same decision brief*, constraints, options, and evidence. Use role prompts equivalent to these:

### Advocate

```text
Make the strongest evidence-based case for [preferred option / the proposed change].
Compare it fairly with the alternatives, but focus on the benefits that skeptics may underweight. Identify the conditions required for it to succeed, its meaningful drawbacks, and the best rebuttal to your own position. Separate facts, estimates, and assumptions. Do not make edits or use subagents.
```

### Skeptic

```text
Make the strongest evidence-based case against [preferred option / the proposed change], including the strongest case for the most credible alternative or the status quo.
Focus on hidden costs, risks, second-order effects, opportunity cost, and failure modes that advocates may underweight. Identify what evidence would change your mind and the best rebuttal to your own position. Separate facts, estimates, and assumptions. Do not make edits or use subagents.
```

If no option is initially preferred, assign the Advocate to the option with the best apparent goal fit and the Skeptic to its strongest alternative. Name those choices explicitly. Do not let either expert silently choose a different scope.

Use a parallel invocation shaped like:

```typescript
subagent({
  tasks: [
    { agent: "researcher", task: "[Advocate prompt plus the decision brief]" },
    { agent: "researcher", task: "[Skeptic prompt plus the decision brief]" }
  ],
  context: "fresh",
  async: true
})
```

The parent must wait for both reports when this skill is invoked as a run-to-completion task. Otherwise, return control and synthesize when notified of completion. Do not modify the decision target while the experts are running.

## 3. Arbitrate independently

Critically evaluate the reports; they are inputs, not verdicts.

- Verify decisive claims using supplied evidence, direct inspection, or authoritative sources as appropriate.
- Separate evidence from rhetoric, estimates, and assumptions.
- Reconcile disagreements by identifying the differing assumptions, likelihood estimates, or priorities.
- Reject unsupported, speculative, duplicated, or irrelevant points.
- Identify shared risks and points both experts missed.
- Avoid false balance: one side can be substantially stronger.
- Do not select a winner merely because it argued more persuasively or produced more detail.

## 4. Deliver the analysis

Use this format unless the user asks otherwise:

```markdown
## Decision
[The decision and options considered.]

## Assumptions and constraints
- [Material facts, constraints, and assumptions.]

## Expert perspectives
### Case for [option]
- [Verified strongest arguments and qualifying conditions.]

### Case against / case for [alternative]
- [Verified strongest objections, alternatives, and qualifying conditions.]

## Arbiter's trade-off analysis
| Option | Positives | Negatives and risks | What it trades away | Best fit |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## Resolution
[Explain the decisive criteria, which claims survived review, and how disagreements were resolved.]

## Recommendation
[Give a clear recommendation, or a conditional recommendation when priorities or evidence genuinely determine the answer.]

## Next step
[The smallest high-value action to reduce the most important uncertainty or make the choice safely reversible.]
```

Keep the output proportional to the stakes. For high-impact decisions, favor a pilot, prototype, measurement, cost estimate, or stakeholder review before an irreversible commitment. Use weighted scoring only when criteria and weights are agreed or defensible; disclose the scale, weights, and sensitivity instead of treating a score as objective proof.
