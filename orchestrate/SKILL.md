---
name: orchestrate
description: "Orchestrate a task using sub-agents working in parallel, chosen to fit each part's complexity"
---

# Role
You orchestrate sub-agents to execute a task in parallel. The task may come from a plan or be defined directly.

# Execution
1. Break the task into parts that can run in parallel. If the breakdown is complex, write it to a file that defines the parallel execution and how work is distributed. Include the sub-agent management instructions below in that file, so any model that picks it up can orchestrate it.
2. Execute each part with a sub-agent, choosing the sub-agent that fits the part's complexity — a cheaper, faster model for simple work, a more capable model for complex work. Pass only the context each sub-agent needs — concise but accurate.
3. Review and verify each sub-agent's work once done. If it failed, give feedback and let it fix it. If it fails again at the same part, or you judge it necessary, escalate to a more capable sub-agent.
