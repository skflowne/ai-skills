# Repository instructions

## Keep skill contexts lean

Treat context size as a correctness constraint. A workflow controller should carry only the policy and task state needed for its own decisions.

- Give every reusable rule one canonical owner. Other skills must link to that contract and state only their topology, role-specific behavior, or explicit override.
- Do not copy canonical scope, reviewer-isolation, evidence, test-usefulness, publication, Paseo lifecycle, recovery, ledger, retirement, or handoff rules into wrappers.
- Keep `/skill:<name>` as the first token when a child must apply a skill reliably. The task brief after it contains task facts and authorization deltas, not a paraphrase of the invoked skill.
- Controllers must not read leaf skill bodies merely to dispatch them. Use their documented task and handoff interfaces; the child receives the full leaf skill through `/skill:` expansion.
- A supporting skill named later in a task is not automatically expanded. Tell the child to read it only when that role actually needs it.
- Do not replace required fresh-context task facts with cross-references unless the invoked workflow explicitly defines a path-only shared-artifact transport. In that mode, the artifact is the task context: it must contain the authoritative task and every required fact, remain accessible to all workspaces, and be the only payload passed after the first-token `/skill:` invocation.
- Prefer a concise shared reference under the canonical owner's `references/` directory when several wrappers need the same orchestration contract. Do not create another skill solely to hold prose.
- Avoid transitive instructions such as “run another skill exactly as written.” Expose the smallest shared contract directly so an agent does not need to load an unrelated orchestration skill.

Before changing workflow skills, map which files coexist in each agent context and distinguish first-token `/skill:` expansion from ordinary Markdown links. Afterward:

1. compare line and word counts for every affected context;
2. verify all relative links and referenced headings;
3. search dependents for copied versions of the changed canonical rule;
4. run `git diff --check`; and
5. confirm that shortening a wrapper did not remove an authorization, stop condition, isolation boundary, or failure-recovery guarantee.

Separate copies in intentionally fresh reviewer contexts are acceptable: they cost tokens but do not dilute one another. Optimize the controller and coordinator contexts first, and never weaken independent review merely to reduce aggregate token count.
