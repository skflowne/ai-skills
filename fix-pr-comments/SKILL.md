---
name: fix-pr-comments
description: "How to handle fixing PR after review"
---

- First summarize comments on the PR, I expect there will be clear instructions left by the reviewer
- If the resolution path of any comment is unclear or is a product decision, ask the user (also make a recommendation)
- Before you start working, check your environment, make sure not to collide with other agents and you have latest changes
- Assess how to best orchestrate the work and if necessary, divide the tasks between sub-agents, ensure each agent's context stays under 100K tokens
- Implement fixes, one commit per comment
- Reply to fixed comments with "resolved: {short concise explanation}" and resolve the thread
- Report any failures to the user