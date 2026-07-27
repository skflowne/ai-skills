export const meta = {
  name: 'split-chunks',
  description: 'Critique a decomposition, then implement its chunks in parallel under script-enforced scope and budget gates',
  whenToUse: 'Launch from the split-forge skill, not directly — that skill names the invariants, sorts trunk work from chunk work, resolves the base sha, and authors the cross-cutting commit afterwards, none of which this script can do for itself. args MUST be an object: { chunks: [{title, deliverable, acceptanceCriteria, scopePaths, maxFiles, ownsInvariants}], crossCuttingPaths: [...], repoSlug, repoPath, baseBranch, baseSha, branchPrefix, taskContext }.',
  phases: [
    { title: 'Critique' },
    { title: 'Chunks' },
  ],
}

// Some harnesses hand `args` through as a JSON-encoded string rather than the parsed object.
const ARGS = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { throw new Error('args arrived as a string that is not valid JSON') } })()
  : args
if (ARGS == null || typeof ARGS !== 'object') throw new Error('args must be an object like { chunks: [...], baseSha: "..." }')

const REPO_SLUG = ARGS.repoSlug
// The user's checkout. Read-only here: it is the source `git worktree add` clones from. Every chunk
// works in its own worktree; nothing in this run may commit to or move HEAD in this path.
const REPO_PATH = ARGS.repoPath
const BASE_BRANCH = ARGS.baseBranch
// Every chunk branches from this one sha, which is what makes the chunks independent and the later
// cherry-pick clean. Resolved by the launching skill from origin/<base>, never from local HEAD.
const BASE_SHA = ARGS.baseSha
if (typeof BASE_SHA !== 'string' || !/^[0-9a-f]{7,40}$/.test(BASE_SHA)) {
  throw new Error(`baseSha must be a git sha resolved from origin/${BASE_BRANCH || '<base>'} (got ${JSON.stringify(ARGS.baseSha)})`)
}
// Namespaces this run's temp branches so an abort leaves findable debris rather than a collision.
const BRANCH_PREFIX = typeof ARGS.branchPrefix === 'string' && ARGS.branchPrefix ? ARGS.branchPrefix : 'split'
// What the whole change is for. Chunk agents need it to judge "does this belong to me or to the
// trunk?" — without it they see only their own slice and escalate nothing.
const TASK_CONTEXT = typeof ARGS.taskContext === 'string' ? ARGS.taskContext : ''

const CHUNKS = Array.isArray(ARGS.chunks) ? ARGS.chunks : null
if (!CHUNKS || CHUNKS.length < 2) throw new Error('chunks must be an array of at least 2 chunk contracts — a one-chunk split is not a split')
// Above five, the boundaries are almost always file boundaries rather than concern boundaries, and
// the agent budget stops being justifiable. Fail loudly instead of quietly spawning twenty agents.
if (CHUNKS.length > 5) throw new Error(`${CHUNKS.length} chunks exceeds the 5-chunk ceiling — re-cut the decomposition around concerns, not files`)

// Paths the trunk owns. No chunk may touch one, whatever its own scopePaths say: a chunk editing a
// doc rule or a shared barrel is editing a contract that governs code it cannot see.
const CROSS_CUTTING = Array.isArray(ARGS.crossCuttingPaths) ? ARGS.crossCuttingPaths : []

CHUNKS.forEach((c, i) => {
  if (!c || typeof c !== 'object') throw new Error(`chunk ${i} is not an object`)
  for (const field of ['title', 'deliverable']) {
    if (typeof c[field] !== 'string' || !c[field].trim()) throw new Error(`chunk ${i} is missing ${field}`)
  }
  if (!Array.isArray(c.scopePaths) || c.scopePaths.length === 0) {
    throw new Error(`chunk ${i} ("${c.title}") has no scopePaths — an unscoped chunk cannot be gated, which is the whole mechanism`)
  }
  if (!Number.isInteger(c.maxFiles) || c.maxFiles < 1) {
    throw new Error(`chunk ${i} ("${c.title}") needs an integer maxFiles budget`)
  }
})

// Two chunks claiming one invariant is the defect this whole skill exists to prevent, and it is
// cheap to catch here rather than paying a critique agent to notice it.
const invariantOwners = new Map()
for (const c of CHUNKS) {
  for (const inv of c.ownsInvariants || []) {
    const key = inv.trim().toLowerCase()
    if (invariantOwners.has(key)) {
      throw new Error(`invariant "${inv}" is owned by both "${invariantOwners.get(key)}" and "${c.title}" — one owner per invariant, end to end. Merge those chunks or move the invariant to the trunk.`)
    }
    invariantOwners.set(key, c.title)
  }
}

const repoContext = (path) => (REPO_SLUG || path)
  ? `Repo context: ${path ? `local checkout at ${path} (cd there for git operations)` : ''}${path && REPO_SLUG ? ', ' : ''}${REPO_SLUG ? `GitHub repo ${REPO_SLUG} (pass --repo ${REPO_SLUG} to every gh subcommand that accepts it — do not rely on cwd's default remote)` : ''}.`
  : ''
const REPO_CONTEXT = repoContext(REPO_PATH)

const MAX_SCOPE_ROUNDS = 1
const MAX_FIX_ROUNDS_PER_GATE = 2

// Every schema closes with additionalProperties: false, matching the other workflows here. An open
// schema lets an agent answer alongside the contract instead of inside it — returning a `notes` or
// `error` field the script never reads, so a refused or partial result validates cleanly and only
// fails later, somewhere less obvious.
const CRITIQUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    defects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          kind: { type: 'string', enum: ['boundary-crack', 'shared-invariant', 'trunk-work-in-chunk', 'scope-too-narrow', 'other'] },
          chunks: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['severity', 'kind', 'description', 'evidence'],
      },
    },
  },
  required: ['defects'],
}

const IMPLEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    commitSha: { type: 'string' },
    summary: { type: 'string' },
    validationOutput: { type: 'string' },
    escalations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['applies-elsewhere', 'shared-module-in-the-way', 'wrong-seam', 'duplicate-exists', 'other'] },
          description: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['kind', 'description', 'evidence'],
      },
    },
  },
  required: ['commitSha', 'summary', 'validationOutput', 'escalations'],
}

// Deliberately minimal: this agent reports observed facts, never a verdict. The verdict is computed
// in JavaScript below, because a model asked "did you stay in scope?" can rationalize yes.
const SCOPE_AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    changedFiles: { type: 'array', items: { type: 'string' } },
    rawOutput: { type: 'string' },
  },
  required: ['changedFiles', 'rawOutput'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          file: { type: 'string' },
          description: {
            type: 'string',
            description:
              'The defect, plus a realistic failure scenario: the concrete trigger a real user or ' +
              'caller actually reaches, the mechanism at the cited file:line, the real-world ' +
              'impact on the user, and how often that state occurs in normal use. For findings ' +
              'that are not user-facing, name the realistic edit that will go wrong and the ' +
              'user-visible defect that ships as a result. Never "could cause unexpected ' +
              'behavior" or "is not ideal" — omit such findings entirely.',
          },
        },
        required: ['severity', 'description'],
      },
    },
  },
  required: ['findings'],
}

// --- scope matching -------------------------------------------------------
// Glob → RegExp. Supports `**` (any depth), `*` (one segment), `?` (one char). A pattern with no
// wildcard matches the path itself and everything beneath it, so `src/constants` covers
// `src/constants/index.ts` without every caller having to remember a trailing `/**`.
function globToRegExp(pattern) {
  // One pass, no placeholder sentinels: substituting `**` for a marker and back invites a collision
  // with a real path that happens to contain the marker, which would silently widen an allowlist.
  const body = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/|\*\*|\*|\?/g, (m) => (
      m === '**/' ? '(?:.*/)?' : m === '**' ? '.*' : m === '*' ? '[^/]*' : '[^/]'
    ))
  const suffix = /[*?]/.test(pattern) ? '' : '(?:/.*)?'
  return new RegExp(`^${body}${suffix}$`)
}

const compiled = new Map()
function matchesAny(file, patterns) {
  return patterns.some(p => {
    if (!compiled.has(p)) compiled.set(p, globToRegExp(p))
    return compiled.get(p).test(file)
  })
}

// Normalizes what agents actually return: leading `./`, quoted paths, git's `a/`+`b/` prefixes when
// someone pastes `--stat` output instead of `--name-only`, and blank lines.
function normalizeFile(f) {
  return String(f).trim().replace(/^["']|["']$/g, '').replace(/^\.\//, '').replace(/^[ab]\//, '')
}

function scopeVerdict(chunk, changedFiles) {
  const files = changedFiles.map(normalizeFile).filter(Boolean)
  const outOfScope = files.filter(f => !matchesAny(f, chunk.scopePaths))
  const trunkTouched = files.filter(f => matchesAny(f, CROSS_CUTTING))
  const overBudget = files.length > chunk.maxFiles
  return {
    files,
    outOfScope,
    trunkTouched,
    overBudget,
    ok: outOfScope.length === 0 && trunkTouched.length === 0 && !overBudget,
  }
}

function violationReport(chunk, v) {
  const parts = []
  if (v.trunkTouched.length) parts.push(`touched trunk-owned paths (the main agent owns these, no chunk may edit them): ${v.trunkTouched.join(', ')}`)
  if (v.outOfScope.length) parts.push(`touched files outside its declared scope: ${v.outOfScope.join(', ')}`)
  if (v.overBudget) parts.push(`changed ${v.files.length} files against a budget of ${chunk.maxFiles}`)
  return parts.join('; ')
}

function actionable(findings) {
  return findings.filter(f => f.severity !== 'nit')
}

function slug(title, i) {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
  return `c${i + 1}-${s || 'chunk'}`
}

// --- phase 1: critique the decomposition ---------------------------------
// Before any implementation, because a bad boundary discovered after four chunks have landed costs
// four rewrites. This gate can abort the run; the implementers do not exist yet when it runs.
phase('Critique')

const chunkTable = CHUNKS.map((c, i) => `${i + 1}. "${c.title}" — ${c.deliverable}
   scope: ${c.scopePaths.join(', ')} (max ${c.maxFiles} files)
   owns invariants: ${(c.ownsInvariants || []).join(' | ') || '(none declared)'}
   acceptance: ${(c.acceptanceCriteria || []).join(' | ') || '(none declared)'}`).join('\n')

const critique = await agent(`Critique this decomposition of a change into parallel chunks. You are a gate, not an implementer: change no files, write no code.

${REPO_CONTEXT}
Base: ${BASE_BRANCH || '(unnamed)'} at ${BASE_SHA}.

The overall task:
${TASK_CONTEXT || '(no task context supplied — say so as a blocker: chunk agents cannot judge what belongs to the trunk without it)'}

Proposed chunks:
${chunkTable}

Paths reserved for the main agent, which no chunk may touch:
${CROSS_CUTTING.length ? CROSS_CUTTING.join(', ') : '(none declared)'}

Read the actual repository at ${BASE_SHA} to ground every claim — this is a code review of a plan, so open the files the chunks name.

Hunt exactly these defects:

- **boundary-crack**: work that straddles two chunks, so each will assume the other does it. Findings live on boundaries; this is the highest-value defect you can find. Name the work and the two chunks.
- **shared-invariant**: two chunks that would both have to enforce one property of the system (the same piece of state, the same ordering guarantee, the same fallback value). Two mechanisms guarding one invariant is the failure this split exists to avoid — they must be one chunk, or the invariant belongs to the trunk.
- **trunk-work-in-chunk**: work inside a chunk whose correctness depends on the WHOLE change, not just that chunk. The tell: a rule, doc line, convention, or shared symbol that a chunk would author while only being able to see its own scope. Anything of the form "X always lives in Y" is trunk work — writing it obliges someone to verify it holds tree-wide, and a chunk cannot.
- **scope-too-narrow**: a chunk whose scopePaths provably cannot contain its deliverable — the file it must edit to satisfy its acceptance criteria is outside its allowlist, or the change plainly exceeds its maxFiles budget. Check the repo; cite the file.

Severity: **blocker** if implementing as proposed would produce work owned by nobody or by two agents (this aborts the run before any code is written), **major** if it would produce rework, **minor** otherwise. Every defect needs concrete evidence — a file path, a symbol name, a search result. A defect you cannot evidence must be omitted, not hedged. Return an empty defects array if the split is sound; do not invent problems to look thorough.`,
  { label: 'critique:decomposition', schema: CRITIQUE_SCHEMA, agentType: 'general-purpose' })

if (critique === null) throw new Error('Decomposition critique failed — no result. Nothing was implemented; relaunch or split by hand.')

const blockers = critique.defects.filter(d => d.severity === 'blocker')
const nonBlockers = critique.defects.filter(d => d.severity !== 'blocker')

if (blockers.length) {
  log(`Decomposition rejected: ${blockers.length} blocker(s). No chunk was implemented.`)
  // Returned, not thrown: the caller needs the defect list to re-cut the split, and a thrown error
  // would surface as a failed run with the reasoning buried in a transcript.
  return {
    aborted: true,
    reason: 'decomposition-blocked',
    blockers,
    otherDefects: nonBlockers,
    chunks: [],
    escalations: [],
    message: 'Fix the decomposition and relaunch. Do not work around this gate by widening scopePaths.',
  }
}
log(`Decomposition accepted${nonBlockers.length ? ` with ${nonBlockers.length} non-blocking note(s)` : ''} — implementing ${CHUNKS.length} chunks in parallel`)

// --- phase 2: implement every chunk in parallel --------------------------
// pipeline(), not parallel(): a chunk that finishes implementing starts its scope audit and review
// immediately rather than waiting for the slowest sibling to finish implementing.

const sharedRules = `Rules that hold inside every chunk:

- **Look before authoring anything new.** Before writing a helper, hook, constant, or type, read the repo's placement conventions (CLAUDE.md / AGENTS.md) and check the shared modules for an existing equivalent. If one exists, import it; if it almost fits, extend it. A new definition that duplicates an existing shared symbol is a defect even when its logic is correct.
- **Never delete, inline, or bypass a shared module or accessor** to make your work fit your scope. If a shared mechanism is in the way, that is an escalation, not a change to ship.
- **Do not add a guard to state that already has several.** If the fix for a problem is another flag, ref, or check on state that is already guarded, the seam is wrong — escalate it instead of patching.
- **Red-green.** Each user-visible behavior you add gets a test through the real interface, and you observe it fail for the expected reason before implementing. State that observation in your summary.

**Escalate rather than expand.** You can see only your own scope. When you notice any of these, put it in \`escalations\` and do NOT act on it:
- a rule or convention you would want to write that applies beyond your scope ("applies-elsewhere") — including any doc line of the form "X always lives in Y";
- a shared module that blocks you ("shared-module-in-the-way");
- an invariant with no single owner ("wrong-seam");
- an existing symbol that duplicates what you were asked to write ("duplicate-exists").
The main agent holds the whole change and will act on these. Silently widening your scope to handle one is the exact failure this run is built to prevent.`

async function runScopeAudit(chunk, tag, chainBranch) {
  const audit = await agent(`Report which files a branch changed. You are an auditor: change nothing, commit nothing, and give no opinion on whether the change is good.

${REPO_CONTEXT}

From the checkout at ${REPO_PATH}, run exactly:
\`git diff --name-only ${BASE_SHA}..${chainBranch}\`

Do not check the branch out. If a git command fails with an index.lock error, another parallel agent is mid-operation — wait a moment and retry.

Return every path it printed, one per array element, exactly as git printed them (repo-relative, no extra prefixes), plus the verbatim command output. If the command printed nothing, return an empty array — do not guess, and do not substitute a different command's output.`,
    { label: `${tag}:scope-audit`, phase: 'Chunks', schema: SCOPE_AUDIT_SCHEMA, agentType: 'general-purpose', effort: 'low' })
  if (audit === null) return null
  return scopeVerdict(chunk, audit.changedFiles)
}

async function runReviewGate(chunk, tag, chainBranch, validationOutput) {
  let fixRounds = 0
  let openFindings = []
  let context = `The chunk's commits are on branch ${chainBranch}, based on ${BASE_SHA}. Inspect them read-only from ${REPO_PATH} (\`git log/diff ${BASE_SHA}..${chainBranch}\`) — do not check that branch out.

Raw validation output from the implementer:
${validationOutput}`

  for (let round = 0; round <= MAX_FIX_ROUNDS_PER_GATE; round++) {
    const review = await agent(`Independently review chunk ${tag} ("${chunk.title}") on branch ${chainBranch}. Report findings; do not edit files.

${REPO_CONTEXT}

The chunk's deliverable: ${chunk.deliverable}
Its acceptance criteria: ${(chunk.acceptanceCriteria || []).join(' | ') || '(none declared — judge against the deliverable)'}
Invariants it owns: ${(chunk.ownsInvariants || []).join(' | ') || '(none declared)'}

Wider task, for context only — work outside this chunk's scope is deliberately someone else's and is NOT a finding:
${TASK_CONTEXT || '(none supplied)'}

${context}

Report concrete correctness and regression findings ranked by severity, each with exact file and line references. Also apply a standing duplication-and-deletion lens: code that reimplements an existing shared module or re-inlines an existing constant is a finding, and any deletion, inlining, or bypass of a shared module or accessor is a blocker regardless of whether tests stay green. Verify the claimed red-green observation actually happened rather than taking the summary's word for it. A finding you cannot evidence with a concrete location must be omitted.

Every finding's description must also carry a realistic failure scenario: the concrete trigger a real user or caller actually reaches, the mechanism at the cited file:line, and the real-world impact on the user (what they lose, see wrong, cannot do, or are exposed to), plus how often that state occurs in normal use. For duplication and deletion findings the affected party is the next person to change this code: name the realistic edit they will make, what silently breaks when they make it (the second copy keeps the old behavior, the invariant the deleted module owned goes unenforced), and the user-visible defect that ships as a result. Omit any finding whose harm is only "could cause unexpected behavior" or "is not ideal", and any whose trigger the call sites, types, or validation already exclude — omit it rather than reporting it as a nit, since every reported finding costs another fix round.`,
      { label: `${tag}:review${round ? `-r${round}` : ''}`, phase: 'Chunks', schema: FINDINGS_SCHEMA, agentType: 'general-purpose' })

    openFindings = review === null ? [] : actionable(review.findings)
    if (review === null) {
      log(`${tag}: review agent failed — treating the gate as unreviewed`)
      return { openFindings: [], fixRounds, reviewFailed: true }
    }
    if (!openFindings.length || round === MAX_FIX_ROUNDS_PER_GATE) break

    fixRounds++
    const fix = await agent(`Resolve these independent-reviewer findings for chunk ${tag} ("${chunk.title}") on branch ${chainBranch}.

${REPO_CONTEXT}

Other chunks are being implemented in parallel, so do not touch ${REPO_PATH}'s working tree: run \`git worktree add <fresh temp dir> ${chainBranch}\` (if that fails because a stale worktree holds the branch, \`git worktree list\` then \`git worktree remove --force\` it first; on an index.lock error, wait a moment and retry), work inside that worktree, commit with a message starting "fix(${tag}):", then \`git worktree remove --force <that dir>\`.

Findings:
${openFindings.map(f => `- [${f.severity}] ${f.file ? `${f.file}: ` : ''}${f.description}`).join('\n')}

Your scope is unchanged and still enforced: you may touch only ${chunk.scopePaths.join(', ')}, and never ${CROSS_CUTTING.join(', ') || '(nothing reserved)'}. If a finding cannot be fixed within that scope, do not fix it — return it as an escalation instead.

${sharedRules}

Verify each finding against the code before acting; reject invalid ones with concrete evidence rather than changing code to satisfy them. Rerun the relevant validation and return the new commit sha, what you addressed or rejected, the raw rerun output, and any escalations.`,
      { label: `${tag}:fix-r${fixRounds}`, phase: 'Chunks', schema: IMPLEMENT_SCHEMA, agentType: 'general-purpose' })

    if (fix === null) {
      log(`${tag}: fix round ${fixRounds} failed — leaving findings open`)
      break
    }
    context = `The chunk's commits are on branch ${chainBranch}, based on ${BASE_SHA}, including fix round ${fixRounds}. Inspect them read-only from ${REPO_PATH}.

Raw validation output after the fixes:
${fix.validationOutput}`
  }
  return { openFindings, fixRounds, reviewFailed: false }
}

const results = await pipeline(
  CHUNKS.map((chunk, i) => ({ chunk, i })),

  // Stage 1 — implement in an isolated worktree cut from the shared base sha.
  async ({ chunk, i }) => {
    const tag = slug(chunk.title, i)
    const chainBranch = `${BRANCH_PREFIX}/${tag}`
    const impl = await agent(`Implement one chunk of a larger change, as its sole author.

${REPO_CONTEXT}

Chunk ${i + 1} of ${CHUNKS.length}: "${chunk.title}"
Deliverable: ${chunk.deliverable}
Acceptance criteria: ${(chunk.acceptanceCriteria || []).join(' | ') || '(none declared — satisfy the deliverable)'}
Invariants you own end to end: ${(chunk.ownsInvariants || []).join(' | ') || '(none declared)'}

The wider task this chunk belongs to (context only — other chunks are running in parallel and own the rest of it):
${TASK_CONTEXT || '(none supplied)'}

**Your scope is a hard contract, checked mechanically after you finish by a separate auditor running \`git diff --name-only\`:**
- You may change ONLY files matching: ${chunk.scopePaths.join(', ')}
- You may NEVER change these, whatever your task seems to require — the main agent owns them: ${CROSS_CUTTING.join(', ') || '(nothing reserved)'}
- Your whole diff must stay within ${chunk.maxFiles} files.
A violation fails this chunk. If you cannot deliver within the contract, deliver what fits and return the rest as an escalation — that outcome is correct and expected, and is far better than a chunk that quietly grew.

Other chunks are being implemented in parallel from the same base, so do not touch ${REPO_PATH}'s working tree or its checked-out branch. Run \`git worktree add <fresh temp dir OUTSIDE the repo> -b ${chainBranch} ${BASE_SHA}\` and do all work inside that worktree. If ${chainBranch} is left over from an aborted run, delete it first (\`git branch -D ${chainBranch}\`; if a stale worktree holds it, \`git worktree list\`, \`git worktree remove --force\` it, then delete). On an index.lock error another parallel agent is mid-operation — wait a moment and retry.

${sharedRules}

Implement the smallest complete change that satisfies the acceptance criteria. Run whatever validation is feasible inside the worktree (install dependencies there if needed); the assembled branch is validated again later. Commit with a message starting "${tag}: ${chunk.title}", then \`git worktree remove --force <that dir>\` (the branch and its commits survive). Return the commit sha, a concise summary including your red-green observation, the raw verbatim validation output, and your escalations.`,
      { label: `${tag}:implement`, phase: 'Chunks', schema: IMPLEMENT_SCHEMA, agentType: 'general-purpose' })

    if (impl === null) {
      log(`${tag}: implementation failed`)
      return { tag, chunk, chainBranch, failed: 'implementation', escalations: [] }
    }
    log(`${tag} implemented on ${chainBranch}: ${impl.summary}`)
    return { tag, chunk, chainBranch, impl, escalations: impl.escalations || [] }
  },

  // Stage 2 — audit the scope contract. The auditor reports files; the verdict is computed here, in
  // JavaScript, from that list. This is the one gate a model cannot talk its way past.
  async (prev) => {
    if (prev.failed) return prev
    const { tag, chunk, chainBranch } = prev
    let verdict = await runScopeAudit(chunk, tag, chainBranch)
    if (verdict === null) {
      log(`${tag}: scope audit failed — cannot confirm the contract held`)
      return { ...prev, scope: { unverified: true } }
    }

    for (let round = 0; round < MAX_SCOPE_ROUNDS && !verdict.ok; round++) {
      const report = violationReport(chunk, verdict)
      log(`${tag}: scope violation — ${report}. Requesting remediation.`)
      const remedy = await agent(`Chunk ${tag} ("${chunk.title}") broke its scope contract on branch ${chainBranch} and must be brought back inside it.

${REPO_CONTEXT}

What the audit found: ${report}

The contract:
- allowed paths: ${chunk.scopePaths.join(', ')}
- reserved for the main agent, never yours: ${CROSS_CUTTING.join(', ') || '(nothing reserved)'}
- file budget: ${chunk.maxFiles}

Work in a fresh worktree (\`git worktree add <temp dir> ${chainBranch}\`; remove it when done) — other chunks are running in parallel, so do not touch ${REPO_PATH}'s working tree.

Revert every out-of-contract change with a commit starting "fix(${tag}): restore scope". Do NOT resolve this by declaring the extra work necessary — if the chunk genuinely cannot meet its deliverable inside the contract, revert anyway, deliver what fits, and return the remainder as an escalation with the evidence. Over-budget with everything in-scope means the chunk is too big: deliver the coherent subset that satisfies the acceptance criteria, escalate the rest.

Return the new commit sha, what you reverted, the raw validation output after reverting, and your escalations.`,
        { label: `${tag}:scope-fix`, phase: 'Chunks', schema: IMPLEMENT_SCHEMA, agentType: 'general-purpose' })

      if (remedy === null) break
      prev.escalations = [...(prev.escalations || []), ...(remedy.escalations || [])]
      const recheck = await runScopeAudit(chunk, tag, chainBranch)
      if (recheck === null) break
      verdict = recheck
    }

    if (!verdict.ok) log(`${tag}: FAILED scope gate — ${violationReport(chunk, verdict)}`)
    else log(`${tag}: scope clean (${verdict.files.length}/${chunk.maxFiles} files)`)
    return { ...prev, scope: verdict }
  },

  // Stage 3 — independent correctness review against this chunk's own criteria.
  async (prev) => {
    if (prev.failed) return prev
    const gate = await runReviewGate(prev.chunk, prev.tag, prev.chainBranch, prev.impl.validationOutput)
    log(`${prev.tag}: review gate ${gate.openFindings.length ? `left ${gate.openFindings.length} open finding(s)` : 'clean'} after ${gate.fixRounds} fix round(s)`)
    return { ...prev, gate }
  },
)

const settled = results.filter(Boolean)
const failed = settled.filter(r => r.failed)
const scopeFailed = settled.filter(r => r.scope && !r.scope.ok && !r.scope.unverified)
const escalations = settled.flatMap(r => (r.escalations || []).map(e => ({ ...e, chunk: r.chunk.title })))

log(`${settled.length - failed.length}/${CHUNKS.length} chunks landed; ${escalations.length} escalation(s) for the main agent to own`)

return {
  aborted: false,
  baseSha: BASE_SHA,
  baseBranch: BASE_BRANCH,
  // Cherry-pick order is declaration order: the split-forge skill declares chunks in dependency
  // order, and independent chunks make the order irrelevant anyway.
  chunks: settled.map(r => ({
    title: r.chunk.title,
    tag: r.tag,
    branch: r.chainBranch,
    commitSha: r.impl?.commitSha || null,
    summary: r.impl?.summary || null,
    failed: r.failed || null,
    scopeOk: r.scope ? (r.scope.unverified ? null : r.scope.ok) : null,
    scopeReport: r.scope && !r.scope.unverified && !r.scope.ok ? violationReport(r.chunk, r.scope) : null,
    filesChanged: r.scope?.files?.length ?? null,
    openFindings: r.gate?.openFindings || [],
    fixRounds: r.gate?.fixRounds ?? 0,
  })),
  // The main agent must work each of these to a decision — fix in the trunk commit, file as a
  // follow-up, or reject with evidence. Dropping one silently is how a rule ships with live
  // counterexamples in the tree.
  escalations,
  decompositionNotes: nonBlockers,
  failedChunks: failed.map(r => ({ title: r.chunk.title, stage: r.failed })),
  scopeFailedChunks: scopeFailed.map(r => ({ title: r.chunk.title, report: violationReport(r.chunk, r.scope) })),
  // Nothing here pushes, opens a PR, or touches the user's checked-out branch: integration and the
  // cross-cutting commit are the main agent's, by design.
  nextStep: 'Main agent: author the trunk/cross-cutting work now, resolve every escalation, then cherry-pick each chunk branch onto the working branch and run full validation on the assembly.',
}
