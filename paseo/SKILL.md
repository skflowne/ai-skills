---
name: paseo
description: "Spawn and manage durable coding agents through the Paseo CLI, especially parallel agents in isolated worktree workspaces. Use only when the user explicitly names and requests this skill."
---

# Paseo

Use the `paseo` CLI to launch durable coding-agent sessions without moving or dirtying the user's checkout. Paseo owns the agent process and workspace lifecycle; the invoked skill owns the work inside each workspace.

## Preflight

1. Confirm the CLI and daemon are available:

   ```bash
   command -v paseo
   paseo status --json
   ```

2. Inspect the current repository before creating writers:

   ```bash
   git status --short --branch
   git worktree list
   paseo ls --json
   ```

   Honor the repository's agent/worktree instructions and check whether another active agent already owns the same invariant or branch.

3. Read `paseo run --help` instead of assuming flags. Paseo is versioned independently and its CLI can change. Every launch requires an explicit `--provider`; confirm the accepted provider syntax before launching.

4. Split parallel work by complete invariants, not files. Each writer must own one concern end to end. If two tasks need to own the same invariant, shared abstraction, or integration decision, do not launch them as independent parallel writers.

## Launch isolated agents

Every new task must run in a new Paseo-managed workspace. Never launch a new task directly in the user's current checkout or reuse another task's workspace. Reuse an existing workspace only for an explicit follow-up to the same task and branch, after confirming its prior agent has no active run or provider process. Keep at most one active writer in a workspace.

Create one worktree workspace per new coding task with `--new-workspace worktree`. For concurrent writers, create the workspaces sequentially to avoid concurrent Git worktree locks; use `--background` so the agents run in parallel after launch.

```bash
paseo run \
  --background \
  --json \
  --title "<short task title>" \
  --provider <provider-or-provider/model> \
  --new-workspace worktree \
  --worktree-mode branch-off \
  --worktree-slug <unique-worktree-slug> \
  --new-branch <unique-branch-name> \
  --base <explicit-base-ref> \
  --cwd <repository-root> \
  "/skill:<skill-name> <complete task brief>"
```

Use `--worktree-mode checkout-branch` with `--branch`, or `checkout-pr` with `--pr-number`, only when the new task specifically needs an existing branch or PR checkout; these modes must still be combined with `--new-workspace worktree`. Prefer `branch-off` for implementation.

Always pass `--provider`; Paseo requires an explicit provider for every launch. Use the provider requested by the user, or inspect `PI_PROVIDER` when matching the current Pi session, and ensure its syntax is accepted by `paseo run --help`. Omit `--model` and `--thinking` unless the user requests them or the task requires specific values; inspect `PI_MODEL` and `PI_REASONING_LEVEL` before explicitly matching the current Pi session.

### Task brief requirements

The child receives its invoked skill through first-token `/skill:<name>` expansion. Do not preload that leaf skill in the controller merely to dispatch it, and do not paraphrase its workflow into the task brief. A later `/skill:` mention is ordinary text, not another expansion; tell the child to read a supporting skill only when its role needs one.

Pass a compact task envelope containing:

- target issue, PR, or finding and the exact base/working relationship;
- complete owned invariant, scope, and neighboring scope;
- acceptance evidence and required validation;
- repository constraints and protected files;
- durable decisions plus explicit authorization overrides; and
- this instruction when Paseo already created the workspace:

  > Paseo has already created the dedicated worktree and branch. Use this workspace; do not create a nested worktree.

Task facts must be complete enough for fresh-context work, but reusable policy belongs to the invoked skill or its canonical reference. Pass durable artifact paths rather than transcripts or repeated raw logs.

If the repository has `paseo.json`, Paseo may run its workspace setup hook. The agent must still verify the workspace has the required dependencies and setup artifacts; it must not assume the hook succeeded or reuse another checkout's dependency layout.

## Monitor and hand off

Capture the `agentId`, workspace path, and branch from each JSON launch result. Verify the sessions after spawning:

```bash
paseo inspect <agent-id> --json
paseo logs <agent-id>
```

Do not poll continuously or block on `paseo wait` unless the user asked for results in the current turn. Normally return the IDs and workspace/branch details so the user can inspect durable sessions independently.

Use these commands for follow-up:

```bash
paseo send <agent-id> "<additional direction>"
paseo attach <agent-id>
paseo stop <agent-id>
```

Treat Paseo status as control-plane state, not proof that the provider process exited. An `error`, timeout, failed `wait`, or failed `send` can leave the original run alive, and a queued follow-up can execute later. Before retrying, replacing an agent, or reusing its workspace:

1. inspect the agent and recent logs;
2. check for a live provider or child process whose working directory is the workspace, using platform-appropriate process inspection;
3. stop the original agent and require acknowledged cancellation; and
4. verify the workspace status before assigning another writer.

If `send` or `wait` reports that the agent is already processing, do not queue more recovery messages or launch a replacement. Continue observing the existing run. Never both queue a recovery follow-up and create a replacement agent: the delayed follow-up can revive the original and create two writers.

Do not silently restart, stop, archive, or delete an agent the user may still be using.

### Run-to-completion workflows

When an invoking workflow explicitly runs to completion, launch every agent in the background and use `paseo wait <agent-id> --json` after each launch or `paseo send`. This overrides the normal return-after-launch behavior only for that workflow.

Do not substitute foreground `paseo run`, `paseo logs --follow`, `watch`, polling loops, sleeps, shell `timeout`, or oversized generic command timeouts. Do not pass `--timeout` to `paseo wait`. After it returns, inspect the agent and recent logs. For parallel agents, wait once per ID; completed agents return immediately.

### Workflow lifecycle ledger and retirement

A run-to-completion multi-agent workflow must keep a ledger outside committed source for every workflow-created agent and workspace, including failed launches: ID, canonical path, branch, role, base/head SHA, and lifecycle state. Record long-lived processes and services started by setup, agents, or validation, including PID when known, canonical cwd, command, listener/port when relevant, ownership evidence, and repository-prescribed teardown.

Retire an agent or workspace only after its handoff and evidence are durable:

1. Inspect the agent, logs, and processes rooted in the workspace's canonical path. Stop any live provider or child and verify process exit; `idle`, `error`, `paseo stop` output, or a status transition alone is not proof.
2. From that workspace, run repository-prescribed teardown for isolated databases, dev/test servers, Playwright servers, emulators, CodeGraph/MCP servers, and other auxiliary services started for the task.
3. Match any survivor by the ledger's PID, command, and canonical cwd. Terminate only that workflow-owned process, wait, and re-inspect; never use broad process-name kills or affect user-owned sessions.
4. Re-scan processes and relevant listeners, verify the tree is clean and branch evidence is preserved, record teardown evidence, and confirm local and remote branch tips match when applicable. Process cleanup does not require deleting the worktree.

Before completion, reconcile every ledger entry, including failed launches, with this protocol. Preserve ambiguous branches and evidence. A live workflow-owned process is a blocker until stopped or reported with its PID, command, cwd, and attempted teardown.

## Windows and UI behavior

A separate Paseo worktree workspace is sufficient isolation even when a visible split cannot be opened.

`paseo agent open <agent-id>` requires Paseo Desktop. Check availability or handle failure explicitly; never claim a split window opened merely because the agent started. If Desktop is unavailable, report that the agents are running in separate workspaces and provide their IDs. `paseo terminal create` creates a managed terminal, not necessarily a visible split in the user's current terminal UI.

## Failure handling

- If workspace creation fails, do not fall back to editing the user's checkout.
- If one launch succeeds and another fails, report both states; do not discard the successful durable session.
- If a run fails at the control-plane boundary, prove whether its provider process is still alive before recovery; never infer termination from `status: error` alone.
- If branch or invariant ownership overlaps with an active agent, stop and ask the user how to resolve ownership.
- If a child surfaces a genuine user decision, leave it running/idle and bring the decision back to the user rather than deciding on their behalf.
