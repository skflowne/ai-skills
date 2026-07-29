---
name: paseo
description: Spawn and manage durable coding agents through the Paseo CLI, especially parallel agents in isolated worktree workspaces. Use when the user asks to run work in Paseo, create separate Paseo workspaces, launch several agents concurrently, or invoke another skill inside new Paseo agents.
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

3. Read `paseo run --help` instead of assuming flags. Paseo is versioned independently and its CLI can change.

4. Split parallel work by complete invariants, not files. Each writer must own one concern end to end. If two tasks need to own the same invariant, shared abstraction, or integration decision, do not launch them as independent parallel writers.

## Launch isolated agents

For concurrent writers, create one Paseo-managed worktree workspace per agent. Create the workspaces sequentially to avoid concurrent Git worktree locks; use `--background` so the agents run in parallel after launch.

```bash
paseo run \
  --background \
  --json \
  --title "<short task title>" \
  --new-workspace worktree \
  --worktree-mode branch-off \
  --worktree-slug <unique-worktree-slug> \
  --new-branch <unique-branch-name> \
  --base <explicit-base-ref> \
  --cwd <repository-root> \
  "/skill:<skill-name> <complete task brief>"
```

Use `--worktree-mode checkout-branch` with `--branch`, or `checkout-pr` with `--pr-number`, only when the task specifically needs an existing branch or PR checkout. Prefer `branch-off` for implementation.

Omit `--provider`, `--model`, and `--thinking` unless the user requests them or the task requires a known provider. When explicitly matching the current Pi session, inspect `PI_PROVIDER`, `PI_MODEL`, and `PI_REASONING_LEVEL` first and pass a provider/model combination accepted by `paseo run --help`.

### Task brief requirements

The prompt passed to each agent should include:

- the invoked skill as the first token, for example `/skill:portolan-forge`;
- the complete invariant the agent owns;
- the explicit base and intended branch/PR relationship;
- relevant user decisions and rejected alternatives;
- acceptance evidence and required validation;
- repository constraints and protected files;
- neighboring scope the agent must not absorb; and
- this instruction when Paseo already created the workspace:

  > Paseo has already created the dedicated worktree and branch. Use this workspace; do not create a nested worktree.

Do not delegate a one-line file-edit instruction. The child must have enough context to make repository-consistent decisions without rediscovering the conversation.

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

Do not silently restart, stop, archive, or delete an agent the user may still be using.

## Windows and UI behavior

A separate Paseo worktree workspace is sufficient isolation even when a visible split cannot be opened.

`paseo agent open <agent-id>` requires Paseo Desktop. Check availability or handle failure explicitly; never claim a split window opened merely because the agent started. If Desktop is unavailable, report that the agents are running in separate workspaces and provide their IDs. `paseo terminal create` creates a managed terminal, not necessarily a visible split in the user's current terminal UI.

## Failure handling

- If workspace creation fails, do not fall back to editing the user's checkout.
- If one launch succeeds and another fails, report both states; do not discard the successful durable session.
- If branch or invariant ownership overlaps with an active agent, stop and ask the user how to resolve ownership.
- If a child surfaces a genuine user decision, leave it running/idle and bring the decision back to the user rather than deciding on their behalf.
