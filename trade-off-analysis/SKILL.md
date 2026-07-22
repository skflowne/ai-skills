---
name: trade-off-analysis
description: Analyze a decision, proposal, design, or set of alternatives from multiple relevant angles. Use when the user wants options compared with their benefits, drawbacks, risks, constraints, trade-offs, and a conditional recommendation.
---

# Trade-off Analysis

Help the user make a decision by comparing realistic alternatives fairly and concretely.

## 1. Frame the decision

Extract or confirm:

- the decision to be made and the available options (include the status quo when relevant)
- the desired outcome and success criteria
- constraints: time, budget, people, technical limits, policy, compatibility, and reversibility
- who is affected and their priorities
- the decision horizon: immediate, near-term, and long-term

If essential information is missing, ask concise clarifying questions before reaching a recommendation. If the user wants a quick analysis or cannot provide details, state the assumptions explicitly and proceed.

Do not invent options, requirements, costs, or evidence. Separate facts, user-provided constraints, estimates, and assumptions.

## 2. Compare the options

Choose dimensions that matter to this decision rather than using a generic checklist. Common dimensions include:

- expected value and goal fit
- implementation effort, cost, and time to benefit
- operational complexity and maintenance burden
- reliability, performance, scalability, and compatibility
- security, privacy, safety, and compliance
- user experience and accessibility
- flexibility, reversibility, vendor lock-in, and future optionality
- organizational impact: skills, ownership, coordination, and change management
- risk likelihood, severity, and mitigation

For each option, identify:

- **Positives:** what it improves and for whom
- **Negatives:** concrete costs, limitations, and failure modes
- **Trade-offs:** what must be sacrificed to gain its benefits and which conditions change the outcome
- **Best fit:** the circumstances in which it is preferable

Include a status-quo or defer option whenever it is a plausible choice. Do not create false symmetry: call out decisive differences and unknowns.

## 3. Present a decision-ready result

Use this structure unless the user requests another format:

```markdown
## Decision
[One-sentence decision being evaluated.]

## Assumptions and constraints
- [Only material assumptions and known constraints.]

## Option comparison
| Option | Positives | Negatives and risks | Key trade-off | Best fit |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## Important trade-offs
- **[Trade-off]:** choosing [option] gains [benefit] but gives up or increases [cost/risk].

## Recommendation
[Recommend an option, or make the recommendation conditional on explicit priorities or missing evidence. Explain the decisive criteria briefly.]

## Next step
[The smallest action that reduces the most important uncertainty, validates the recommendation, or enables a reversible choice.]
```

Keep the analysis proportional to the stakes. For complex or high-impact decisions, prioritize the largest uncertainties and propose validation such as a prototype, measurement, pilot, cost estimate, or stakeholder review. For low-stakes decisions, be concise and avoid unnecessary scoring.

Use weighted scoring only when criteria and weights are agreed or can be justified. Show the weights, scoring scale, and sensitivity to material assumptions; never treat a score as objective proof.

A recommendation is optional. When the evidence does not support one, say what would decide the issue instead of forcing a conclusion.
