---
name: third-party-repo-audit
description: "Audit a freshly-cloned or vendored third-party repo for malicious/backdoored behavior before trusting it — distinct from reviewing your own diff (use security-review for that)"
---

# Goal

Decide whether a repo you did not write is safe to run, build, or depend on. You are hunting for
**malicious or unintended-by-design behavior** — backdoors, exfiltration, obfuscation, supply-chain
tampering — not code quality, style, or ordinary bugs. Assume the worst-case author until the evidence
says otherwise; a clean verdict must be earned by actually looking, not by absence of obvious red flags.

Do not treat a polished README, good tests, or verbose comments as reassurance — a convincing
disguise is a technique, not a mitigant. Weigh what the code *does*, not what it claims to do.

# Execution

## 1. Map the repo

- Full file tree, `git log --oneline` (does history look like organic development, or a single
  suspicious dump/squash?), and the package manifest (`package.json`/`pyproject.toml`/`Cargo.toml`/etc).
- Read `preinstall`/`postinstall`/`prepare`/`install` script hooks in the manifest first — these run
  automatically on install, before you've reviewed anything. Anything beyond a normal build step
  (`tsc`, `cargo build`, ...) is a red flag.
- Check the CI config (`.github/workflows/*`, etc.) for steps that curl/download-and-execute, or that
  ship secrets to a non-obvious destination.

## 2. Static sweep for the actual primitives that matter

Grep the source (not just skim it) for, adapting names to the repo's language:

- **Network egress**: `fetch(`, `http(s).request/get`, `net.connect`, `WebSocket`, `requests.`,
  `urllib`, `socket.`, raw IPs/domains. For every hit, ask: is the destination documented, local-only
  (loopback), or an unexplained third party?
- **Process/command execution**: `child_process`/`exec`/`spawn`, `os.system`, `subprocess`, backticks
  in shell scripts, `/dev/tcp/`, `curl | sh` patterns.
- **Dynamic code execution**: `eval(`, `new Function(`, `vm.` (Node), `pickle.loads`, `exec(`/`compile(`
  (Python), reflection-based loaders.
- **Obfuscation tells**: `atob`/`Buffer.from(..., 'base64')`, `fromCharCode`, long hex/base64 blobs,
  minified code sitting in a `src/` directory (as opposed to a declared build output), unusually named
  variables designed to look boring.
- **Credential/env harvesting**: broad `process.env`/`os.environ` reads followed by a network call or
  a write to a file/log, not just a read used locally.

A hit is not a verdict — legitimate tools spawn subprocesses and read env vars constantly. The question
is always: *does this specific call's destination/payload make sense for what the tool claims to do?*

## 3. Treat prebuilt/bundled artifacts as a separate surface

Any committed `dist/`, minified JS/CSS, `.whl`, or other built binary can diverge from the visible
source — that's the classic vector (ship clean source, ship a backdoored build). Re-run the same
network/exec/eval/obfuscation greps directly against the built artifact, independent of what the
source tree suggests it should contain. If you can rebuild from source and diff against the committed
artifact, do that.

## 4. Provenance and dependency integrity

- Lockfile: confirm every resolved package comes from the expected registry (`registry.npmjs.org`,
  `pypi.org`, etc). A git-URL or private-registry dependency for something that should be a normal
  package is worth a second look.
- Scan for typosquat-shaped dependency names (near-miss of a popular package).
- Hardcoded URLs/domains/IPs anywhere in source: list every one found outside the project's own
  documented endpoints (its GitHub repo, its own localhost server, well-known doc sites like
  `w3.org`/framework homepages) and account for each.

## 5. Secret-hygiene findings (not malicious, but flag them)

Note — separately from malicious findings — any place a credential is passed via CLI argv (visible to
other local users via `ps`), logged, or written to disk in plaintext where an env var or IPC channel
was available instead. This is a real weakness even when clearly unintentional.

## 6. Verdict

Classify every finding as one of:

- **MALICIOUS (confirmed)** — code that exfiltrates, backdoors, or executes untrusted remote payloads.
- **SUSPICIOUS (needs a human)** — a primitive hit whose intent you can't fully account for from the
  code alone; state exactly what would resolve it.
- **HYGIENE** — real weakness, not malicious (e.g. secret-on-argv).
- **CLEAN** — swept and accounted for; say what you checked, not just "looks fine."

Report as a flat list, most severe first: `file:line`, the primitive matched, and one sentence on why
it is or isn't accounted for. End with an overall verdict for the repo as a whole and what — if
anything — you were not able to verify (e.g. "did not rebuild from source to diff against the
committed bundle").
