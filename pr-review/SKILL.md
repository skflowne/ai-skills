---
name: pr-review
description: "Instructions to review a given PR"
---

# Goal
Review the specified PR (if not specified, stop and ask)

# Execution
- Fetch the corresponding issue so you understand the goal and intent
- Review the code and hunt for issues related to your expertise and area of focus
- For every finding, provide a concise description, a **realistic failure scenario** meeting the standard below, and evidence (for example file/line references, a test result, or authoritative documentation). Do not report findings without all three.
- When posting findings to GitHub, follow [github-pr-review](../github-pr-review/SKILL.md): post one consolidated review body instead of inline comments, and organize the resolution plan into chunks sized for one agent. Always post the review as a normal comment (`COMMENT`), never as a request for changes (`REQUEST_CHANGES`).

# Failure scenario standard

This is the bar for every review skill in this repo. A finding without a realistic failure scenario is not a finding.

Write each scenario in three parts:

1. **Trigger** — the concrete conditions that produce it: who is doing what, with which inputs, in which state. Name a path a real user or caller actually takes, not "if someone passes null" when nothing passes null.
2. **Mechanism** — what the code then does wrong, tied to the cited `path:line`.
3. **Real-world impact** — what the person on the other end actually experiences: data silently lost or wrong, a flow they cannot complete, a wrong number they act on, another user's data exposed, a double charge, a hang. Name a consequence someone would notice, report, or be harmed by.

Then state **plausibility**: how a user reaches that state in normal use, and how often. "Every user on first load" and "only if the system clock moves backwards mid-request" are different findings and deserve different severities — say which one you have.

Reject and drop, do not hedge and report anyway:

- Scenarios that reduce to "this could cause unexpected behavior," "this is not ideal," "this may break in the future," or "a caller might misuse this."
- Triggers no real user or caller reaches, or that require inputs the type system, validation, or call sites already exclude — check the call sites before claiming it.
- Impact you can only describe with "could potentially." If you cannot state what breaks for someone, you have not verified the finding.

For findings that are not user-facing (quality, conventions, tests, docs), the same three parts apply with **the next person to change this code** as the affected party: name the realistic edit someone will make, what breaks or is silently missed when they make it, and the user-visible defect that reaches production as a result.
