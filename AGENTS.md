# superdev

A self-contained **Claude Code plugin** for the plan and implement loop. It gives you interview-driven
vertical slicing, an execution tier sized to the plan, deterministic hook guardrails, and a pluggable
slice store plus code host. A plan of more than 3 slices runs in parallel worktrees with isolated
implementer and reviewer subagents. A plan of 3 or fewer runs test-first and inline. No prerequisite
plugins.

## Need something? Read this

| Goal | Start here |
|------|------------|
| Understand the plugin, install, updating | [`README.md`](README.md) |
| Cut a release | [`RELEASING.md`](RELEASING.md) |
| Slice schema, lifecycle and status | [`references/plan-contract.md`](plugin/references/plan-contract.md) |
| Domain language (ubiquitous terms) | [`CONTEXT.md`](CONTEXT.md) |
| Architecture decisions (why it is built this way) | [`docs/adr/`](docs/adr/) |
| In-repo documentation convention (this AGENTS.md hierarchy) | [`references/documentation.md`](plugin/references/documentation.md) |
| Writing standard for docs | [`references/controlled-prose.md`](plugin/references/controlled-prose.md) |
| What kind of information a doc owes its reader | [`references/content-types.md`](plugin/references/content-types.md) |
| Add or adjust a backend (slice store, code host, KB) | seeds in [`references/`](plugin/references/) |
| Attribution and license | [`NOTICE`](NOTICE), [`LICENSE`](LICENSE) |

## Structure

```
.claude-plugin/
  marketplace.json     — single-plugin marketplace manifest (deliberately NO version field); its
                         `source` is `./plugin`, so an install copies only the shipped tree below
plugin/                — the SHIPPED tree: everything a user's install copies, nothing else
  .claude-plugin/
    plugin.json        — plugin manifest (name, version, author); version is the SINGLE source of truth.
                         No `hooks` field — Claude Code auto-loads the standard hooks/hooks.json.
  commands/            — slash commands (*.md): brainstorm, setup, plan, implement, review, document,
                         ship, afk, upgrade, status, publish-kb. implement → review → document → ship is
                         the chain a scope walks, each command printing the next (ADR 0013). afk drives
                         that chain unattended, one eligible scope anchor at a time, with the Skill tool
                         (ADR 0015). publish-kb sits outside the chain: it sends a scope's staged
                         knowledge-base pages to a remote backend, on the operator's own clock, and afk
                         never drives it (ADR 0023)
  agents/              — subagents (*.md): implementer, slice-reviewer, simplicity-reviewer, final-reviewer,
                         doc-writer, doc-reader
  hooks/               — deterministic Node hooks + hooks.json: merge-guard, model-explicit, green-gate,
                         run-lock, ledger-guard, worktree-sweep, scope-prune, update-check
  references/          — backend seed templates + the non-seed runtime references (plan-contract,
                         documentation convention, controlled-prose, content-types, doc pass, run init,
                         run handoff, execution playbooks, test-selection, scope-mode, authoring
                         disciplines, design sketch, diagnosis, prototype, merge-conflicts,
                         review-checklist). Who reads what: the `references/` entry of the Child DOX
                         Index below.
  scripts/             — the two CLIs the commands invoke at runtime: `scope.js` (the run-state CLI,
                         ADR 0022) and `kb-patch.js` (the knowledge-base section merge, ADR 0027)
  LICENSE · NOTICE     — copies of the root files, so the shipped tree carries its own attribution
docs/adr/              — architecture decision records (why the plugin is built this way)
docs/agents/           — superdev's own backend config (dogfooded: this repo's slice store, code host, documentation, KB, toolchain, verification)
scripts/               — maintainer-only deterministic code wired into `bun run test`: `eval-run.js`
                         (the eval runner, ADR 0024) and `drift-check.js` with its `drift/` modules
                         (registry, contract tables, scanners, shared helpers, selftest suites).
                         What every script owns and guards — the two here and the two shipped ones in
                         `plugin/scripts/` — is enumerated once, in `scripts/AGENTS.md`.
evals/                 — cases (*/case.yaml + graders/*.md + the case's scaffold_script, a path
                         relative to the case dir — never an inline block); every case is one arm of
                         the with/without-plugin A/B, run by `scripts/eval-run.js` on a Claude
                         subscription (ADR 0024) — see `evals/README.md`
release.config.cjs     — semantic-release config (semantic-release-replace-plugin bumps plugin.json)
package.json           — dev-only tooling (Bun); NOT published to npm
CHANGELOG.md           — release-managed by semantic-release; do not hand-edit
CONTEXT.md             — the domain-language glossary (ubiquitous terms); maintained by /plan
README.md · RELEASING.md · NOTICE · LICENSE
```

The plugin ships as markdown and JS hooks. There is **no build step**: the marketplace's `./plugin`
source is what limits an install to the shipped tree, so releasing stays a plain commit. `commands/`,
`agents/`, and `references/` are prose. `hooks/` and the two `scripts/` dirs are executable: `hooks/`
holds Claude Code hooks, `plugin/scripts/` holds the two runtime CLIs, and the root `scripts/` holds
maintainer-only checks like `drift-check.js`, which `package.json` runs. `hooks/` is also a runtime
consumer of `plugin/scripts/`: `hooks/scope-prune.js` `require`s `../scripts/scope.js` for its shared
ledger-header reader (ADR 0022). This is the one dependency `hooks/` has on a script. Every other hook
stays standalone. Paths inside `plugin/` resolve against the plugin root at runtime, so prose there
names them without the `plugin/` prefix. `scripts/drift/lib.js`'s `docPath()` resolves the same
plugin-relative paths for the maintainer-side checks.

## Stack

- **Bun.** The repo package manager and task runner (`bun.lock`).
- **Node.** The hooks' runtime. `hooks.json` invokes `node`, because every user's Claude Code
  environment has `node` and not every one has Bun. Bun is maintainer-only.
- **semantic-release.** Deterministic, commit-driven releases (`release.config.cjs`), published to
  **Codeberg** (Forgejo) through `@saithodev/semantic-release-gitea`.
- **Conventional Commits.** They drive the version bump. `feat` gives a minor bump, `fix` and `perf`
  give a patch bump. **Pre-1.0 policy:** `!` or `BREAKING CHANGE` also gives a **minor** bump (a
  `releaseRules` entry in `release.config.cjs`). superdev stays below 1.0.0 until it has proven itself
  in real use, and removing that rule is what opens the first deliberate 1.0.0.

## Working rules (repo-specific: read before you edit hooks, the version, or the release config)

- **Hooks are CommonJS** (`.js`, `require`). `plugin/package.json` is the anchor: it carries
  `"type": "commonjs"` and ships with the plugin, so Node never walks past the install directory to
  whatever `package.json` an ancestor of the user's plugin cache happens to carry. A `"type": "module"`
  found there treats every hook as ESM and breaks them all in production. Do **not** change that
  field, and do not add `"type": "module"` to the root `package.json` either. Only `.mjs` is ESM,
  because that is scoped by extension.
- **Every hook ships a `--selftest`.** Add one for any new hook. `bun run test` runs them all under
  `node`, which matches the production runtime. It then runs `claude plugin validate ./plugin` as a
  manifest-validation gate.
- **Version lives only in `plugin/.claude-plugin/plugin.json`.** Never hand-edit it. semantic-release and
  `semantic-release-replace-plugin` bump it on release. `marketplace.json` carries no version, which
  avoids a double pin where `plugin.json` would silently win.
- **Backends are pluggable.** To add a slice store, a code host, or a KB, write a new seed in
  `references/`. `/superdev:setup` turns that seed into the matching `docs/agents/*.md` in the *consumer*
  repo. `commands/` and `agents/` stay tool-agnostic. Do not hardcode a backend into them.
- **Docs follow a writing standard.** `docs/agents/documentation.md` names it, and the doc agents apply
  it to prose they write. This repo uses `controlled`
  ([`references/controlled-prose.md`](plugin/references/controlled-prose.md), ADR 0012). Its own
  `## Scope` section states where it applies: the `AGENTS.md` tree, `README.md`, ADR text, glossary
  entries, knowledge-base pages, and report text. Prompt prose is outside it, and has its own rules
  below.
- **Prompt prose follows the prompt-architecture rules.** They govern `commands/`, `agents/`, and
  `references/` prose:
  - **Prompt the positive.** Steering by prohibition drags the forbidden behaviour into context and makes
    it more available. Phrase the wanted behaviour, and reserve `never` for real contracts.
  - **A contested line gets an eval arm, not an argument.** An instruction the model already obeys by
    default is pure context load, and whether a line is such a no-op is model-relative. `bun run eval`
    settles it by running the document.
  - **Completion criteria demand.** "Every modified model accounted for" forces thorough work where
    "produce a change list" does not. Write every done-condition in the demanding form.
  - **Hiding later steps needs a real context boundary.** A subagent dispatch, or a path handed instead
    of inlined text, clears context. An inline mention does not. ADR 0020 is the applied case.
  - **Descriptions are permanent context load.** Every command and agent `description` is always loaded:
    front-load the trigger word, one trigger per branch (synonyms are one branch written twice), and cut
    identity the body already carries.
  - **A contract in an agent body also holds in the dispatch prose that reaches it.** Both halves arrive
    in one prompt, and the dispatch is the later, more specific instruction, so it wins a conflict
    ([`CONTEXT.md`](CONTEXT.md) → *Dispatch prose*, ADR 0035). Where a drift row pins a clause in
    `agents/`, pin the `commands/` sentence that dispatches it too, or write down why no dispatch can
    contradict it. A one-sided pin is a contract that reads enforced and stays green while the live path
    drifts: `FULL_SUITE_CONTRACTS` had exactly that shape, and the leak reached production prose.
- **Platform-dependent claims carry dated verification.** An ADR, or a `## Known issues` entry below,
  states a claim about Claude Code behaviour. When you re-check that claim, record a dated update naming
  the version and the observed evidence ("Verified 2026-08-19, on Claude Code 2.1.x, output …"). A stale
  platform claim then shows its age instead of silently misleading.

## Known issues (Claude Code platform)

**SessionStart system-prompt preambles leak into subagent tool outputs** (tracked as issue #32). When a
subagent is dispatched, the Claude Code harness includes the main conversation's SessionStart
system-message in the subagent's prompt context. Examples are context-window protection and
tool-bootstrap guidance. This creates a prompt-injection surface, in two ways:

- Subagents receive meta-instructions they did not ask for.
- Tool-call outputs may arrive wrapped in system-prompt tags instead of staying opaque.

**Mitigation (implemented):** every subagent body carries explicit secret-hygiene discipline. Each agent
identifies and disregards any injected system-reminder block, and uses only the standard tools it was
given (`Read`, `Edit`, `Write`, `Bash`, and the rest). See `agents/implementer.md` for the pattern.

**Fix required at:** the Claude Code platform layer. Subagent prompts need isolation from the main
conversation's SessionStart preamble. Track this upstream with the Claude Code team.

**A denied dispatch comes from the delegation handoff classifier.** Auto mode runs a transcript
classifier over tool calls, and a subagent handoff carries a classifier at delegation that can deny, plus
one at return that only warns. A SessionStart preamble denies nothing: it is informational, and its
contribution is to the user-message stream the classifier reads, which is the leak above. A denial
returns as a tool result carrying its reason, and three consecutive denials — or twenty in a session —
stop the model and escalate to the human, while headless `claude -p` terminates instead. An unattended
run stops itself before that, at the cap `references/scope-mode.md`'s `## Degraded passes` section states,
so the stop happens through superdev's own block procedure and leaves a tracker record rather than a
terminated session and a stranded run root (ADR 0041). The documented
stage-2 false-positive rate is 0.4%, so a denial is not by itself evidence of a real hazard. Plugin
subagents ignore the `permissionMode`, `hooks`, and `mcpServers` frontmatter fields, so superdev's own
agents cannot change any of this; the levers are the consumer's `permissions.allow` and a copy of the
agent under `.claude/agents/`. What the chain does about a denial is `references/scope-mode.md`'s
`## Degraded passes`, and ADR 0039 records the decision.

Verified 2026-08-23, against Anthropic's *How we built Claude Code auto mode* engineering post
(`https://www.anthropic.com/engineering/claude-code-auto-mode`) and the *Create custom subagents*
documentation (`https://code.claude.com/docs/en/sub-agents`), both read that day.

## Common commands

```
bun install                        # install dev deps (release toolchain)
bun run test                       # hook + script selftests, drift-check, plugin manifest validation
bun run eval                       # the with/without-plugin A/B over evals/ (needs the two vars below)
bun run eval:plan                  # the four cheap plan-only cases of that A/B, both arms
GITEA_TOKEN=<token> bun run release  # cut a release from clean main (see RELEASING.md)
```

**`bun run eval` needs `CLAUDE_CODE_OAUTH_TOKEN`.** `scripts/eval-run.js` runs on a Claude
subscription instead of a metered API key (ADR 0024). A maintainer creates the token once with
`claude setup-token` and exports it. The runner refuses to start without it and never falls back to
`ANTHROPIC_API_KEY`. Details: `scripts/AGENTS.md`.

# DOX framework

- AGENTS.md files are binding work contracts for their subtrees. Before editing, read this root doc
  plus every AGENTS.md on the path to each file you touch, in the current session. The nearest doc
  controls local detail. No child doc may weaken a parent.
- After every meaningful change, do a DOX pass. Update the closest owning AGENTS.md when purpose,
  ownership, durable structure, contracts, workflows, constraints, or user preferences changed. Update
  every affected parent, child, and Child DOX Index too. Delete stale or contradictory text immediately.
  A change that alters no behavior and no contract may leave the docs unchanged, but the pass still
  happens.
- Create a child AGENTS.md only when a folder becomes a durable boundary with rules of its own. Section
  order: Purpose, Ownership, Local Contracts, Work Guidance, Verification, Child DOX Index. Broad rules
  live in parents, concrete detail in children. Keep both concise, current, and operational, with no
  duplicated rules and no history.
- When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md.

## Child DOX Index

**One child exists: [`scripts/AGENTS.md`](scripts/AGENTS.md).** It owns what the four scripts guard:
the two maintainer-only ones in `scripts/` and the two shipped ones in `plugin/scripts/`. That
ownership includes the full drift-check contract narrative. Every other subtree's rules live in this
root doc.
See `Structure` above for the current file inventory. Add a child only when a subtree becomes a
durable boundary with rules of its own that do not fit here.

This root owns every other subtree directly:

- `plugin/commands/`, `plugin/agents/`. Prose slash-commands and subagents. Governed by **Working
  rules, Backends are pluggable**: stay tool-agnostic and never hardcode a backend. Behaviour contracts
  live in the files.
- `plugin/hooks/`. Claude Code hooks, the plugin's deterministic guardrails. Governed by **Working
  rules, Hooks are CommonJS** and **Every hook ships a `--selftest`**. This is the strongest future
  child-doc candidate, if its rules outgrow this root. `scope-prune.js` `require`s `../scripts/scope.js`
  for its ledger-header reader (ADR 0022). This is the only place a hook depends on a script instead of
  standing alone. A `require` failure leaves the hook with no fallback reader: it prunes nothing and
  says nothing.
- `scripts/` and `plugin/scripts/`. Owned by [`scripts/AGENTS.md`](scripts/AGENTS.md):
  `plugin/scripts/scope.js` (the run-state CLI, ADR 0022: owns the ledger schema, is the only
  `ledger.md` read and write path, and exports `readLedgerHeader` for `plugin/hooks/scope-prune.js`),
  `plugin/scripts/kb-patch.js` (the deterministic section merge behind a staged page's `action: patch`,
  called by `/superdev:publish-kb`, ADR 0027), `scripts/eval-run.js` (the eval
  runner, ADR 0024), and `scripts/drift-check.js` with `drift/` (the fifty-eight cross-document contract checks: the
  CLI walks the `drift/checks.js` registry, which orders every scanner and contract table). What each
  guards, check by check, lives in that child doc.
- `plugin/references/`. Backend seed templates plus the non-seed references below. Each reference's own
  opening states its full contract. This index only routes.

  | Reference | Owns | Read at runtime by |
  |---|---|---|
  | `plan-contract.md` | slice schema and lifecycle, plus the `## Scope anchor`, `## Feature label`, `## Release`, `## Run state`, and `## Append mode` generic contracts every store document specialises, including the anchor dependency `/afk` defers on (ADR 0004, 0017, 0019, 0021, 0034, 0040, 0042) | `/plan`, `/implement`, `/afk`, and the store seeds cite it |
  | `documentation.md` | the in-repo documentation convention, which `/superdev:setup` fills at `## Writing standard` always and at `## Audit set` when needed | `/setup`, `/document` |
  | `controlled-prose.md` | the writing standard (ADR 0012) | `doc-pass.md`'s callers apply it, `doc-reader` verifies it |
  | `content-types.md` | the content-type lens, never configurable and never `none` (ADR 0014) | `doc-pass.md`'s callers, `doc-reader` |
  | `doc-pass.md` | the documentation pass, stated once for its two callers (ADR 0031) | `doc-writer`, the `lite` playbook |
  | `run-init.md`, `run-handoff.md` | run init and run handoff, tier-agnostic | both execution playbooks |
  | `implement-full.md`, `implement-lite.md` | the tier-specific execution playbooks | `/implement`, once it computes the tier |
  | `test-selection.md` | the focused-or-full test command rule (ADR 0025), which `hooks/green-gate.js` implements in code | focused: `implementer`, `slice-reviewer`, `implement-lite`, `/superdev:document` (over its own doc commits). Full suite: `/review`'s scope review, `run-handoff` |
  | `scope-mode.md` | the shared scope rules: live-run detection, the scope checkout, the run lock, `## Unattended`, `## The scope slug`, `## The change type`, `## Degraded passes`, `## Unresolved defects`, `## Deferred findings`, `## The ledger` (deferring the schema to `scope.js`), `## Cutting the scope branch`, `## Publishing run state` (ADR 0007, 0013, 0016, 0018, 0021, 0022, 0026, 0028, 0035, 0039, 0041, 0042) | `/review`, `/document`, `/ship`, `/implement`, `/afk`, both playbooks |
  | `cross-exam.md`, `domain-modeling.md`, `doc-verification.md` | the authoring disciplines, superdev's rendering of Matt Pocock's grilling and domain-modeling skills. `domain-modeling.md` also owns revise-in-place: a glossary entry is rewritten, an overturned ADR is superseded, and a qualified one is amended, never edited | `/plan`, `/brainstorm`. `implementer` reads `doc-verification.md` before acting on a third-party assumption |
  | `design-sketch.md` | the throwaway HTML page showing the components a plan intends to add, change, or delete: the card contract, the self-contained no-JavaScript artifact, the skeleton, and the wait for the operator's approval (ADR 0036) | `/plan` §3, and only when the operator accepts the offer |
  | `diagnosis.md` | the defect-diagnosis loop: the red-capable repro gate, the minimised repro, ranked hypotheses, tagged instrumentation (a rendering of Matt Pocock's diagnosing-bugs skill) | `/plan` on a `fix` feature, `implementer` on a defect-repair dispatch, `/review`'s fix loop |
  | `prototype.md` | the prototype discipline: one stated question, liftable logic, throwaway-branch capture, the `spec` snippet exception (a rendering of Matt Pocock's prototype skill) | `/brainstorm` §4, and `plan-contract.md` cites the `spec` exception |
  | `merge-conflicts.md` | conflict resolution by intent: the union on additive conflicts, composing compatible intents, abort-and-escalate on a winner-picking overlap | the full playbook's merge step |
  | `review-checklist.md` | anti-patterns, design smells, vulnerability classes, a reuse-audit lens, a consistency lens | `final-reviewer` (all five), `slice-reviewer` (anti-patterns and vulnerabilities) |
- `docs/adr/`. Architecture decision records. `docs/agents/`. This repo's own dogfooded backend config.
- `.claude-plugin/`. Manifests. Governed by **Working rules, Version lives only in `plugin.json`**.
- `CONTEXT.md`. The domain glossary. `evals/`. The with-plugin and without-plugin A/B, where
  `evals/README.md` owns its grader-neutrality and result-reading rules.
