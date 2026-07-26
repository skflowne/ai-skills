---
name: pr-review
description: "Instructions to review a given PR"
---

# Goal
Review the specified PR (if not specified, stop and ask)

# Execution
- Fetch the corresponding issue so you understand the goal and intent
- Review the code and hunt for issues related to your expertise and area of focus
- For every finding, provide a concise description, a concrete failure scenario explaining why it is bad, and evidence (for example file/line references, a test result, or authoritative documentation). Do not report findings without all three.
- When posting findings to GitHub, follow [github-pr-review](../github-pr-review/SKILL.md): post one consolidated review body instead of inline comments, and organize the resolution plan into chunks sized for one agent.
