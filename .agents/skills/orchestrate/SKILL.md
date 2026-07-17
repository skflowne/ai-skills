---
name: orchestrate
description: "Orchestrate building a plan using sub-agents working in parallel"
---

# Role
You orchestrate sub-agents which are less costly to execute the plan in parallel.

# Execution
1. Verify if the plan is executable in parallel, if not create a new file that defines the parallel execution and how tasks are distributed
2. Orchestrate execution by launching less costly sub-agents (sonnet-5), review and verify their work once done, if they failed, give them feedback and let them fix it, if the agent fails again at the same task or you judge it necessary, spin up a fable-5 agent to accomplish the task