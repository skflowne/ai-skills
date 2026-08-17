# Shared issue workflow artifact

## Immutable protocol

- Read this file completely before acting.
- The linked GitHub issue is the complete semantic task. Do not replace it with a summary, inferred requirement, implementation preference, or repository recommendation.
- Find the dispatch record whose canonical workspace and branch match your current checkout. Act only on that record and the authoritative issue.
- Read repository instructions directly from the repository.
- Append your standard handoff under your dispatch record. Do not overwrite another agent's content.
- Return only this file's absolute path. Do not return the discovery, handoff, findings, or summary inline.

## Authority

- Repository: `{{REPOSITORY}}`
- Canonical repository root: `{{REPOSITORY_ROOT}}`
- Issue: `{{ISSUE_URL}}`

### Original user request — verbatim

```text
{{ORIGINAL_USER_REQUEST}}
```

## Discovery evidence

<!-- The discovery agent appends evidence here. Preserve the issue body verbatim and keep factual research distinct from the issue's requirements. -->

## Dispatch records

<!-- The controller appends one immutable record per launch before starting that agent. Parallel agents require separate records. Copy the format below without adding semantic prose. Inputs may contain only absolute paths, exact refs, URLs, verbatim external text, and exact profile authorization. Follow-up control records may contain only the exact runtime event and a mechanical recovery action, never new task guidance. -->

```text
### Dispatch `<id>`

- Role: `<role>`
- Skill: `<first-token skill or unskilled integrator>`
- Canonical workspace: `<absolute path>`
- Branch: `<branch>`
- Base: `<exact SHA>`
- Inputs: `<artifact paths, exact refs/URLs, or verbatim external text only>`
- Mutation authority: `<exact profile authorization>`

#### Control events

#### Handoff
```

### Dispatch `{{DISCOVERY_DISPATCH_ID}}`

- Role: discovery
- Skill: `/skill:explore`
- Canonical workspace: `{{DISCOVERY_WORKSPACE}}`
- Branch: `{{DISCOVERY_BRANCH}}`
- Base: `{{DISCOVERY_BASE}}`
- Mutation authority: read-only; write only to this shared artifact

#### Handoff

<!-- The discovery agent appends its handoff here, then returns only this artifact's absolute path. -->
