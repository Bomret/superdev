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
| Slice schema, lifecycle and status | [`references/plan-contract.md`](references/plan-contract.md) |
| Domain language (ubiquitous terms) | [`CONTEXT.md`](CONTEXT.md) |
| Architecture decisions (why it is built this way) | [`docs/adr/`](docs/adr/) |
| In-repo documentation convention (this AGENTS.md hierarchy) | [`references/documentation.md`](references/documentation.md) |
| Writing standard for docs | [`references/controlled-prose.md`](references/controlled-prose.md) |
| What kind of information a doc owes its reader | [`references/content-types.md`](references/content-types.md) |
| Add or adjust a backend (slice store, code host, KB, verification) | seeds in [`references/`](references/) |
| Attribution and license | [`NOTICE`](NOTICE), [`LICENSE`](LICENSE) |

## Structure

```
.claude-plugin/
  plugin.json          — plugin manifest (name, version, author); version is the SINGLE source of truth.
                         No `hooks` field — Claude Code auto-loads the standard hooks/hooks.json.
  marketplace.json     — single-plugin marketplace manifest (deliberately NO version field)
commands/              — slash commands (*.md): brainstorm, setup, plan, implement, review, document,
                         ship, afk, upgrade, status, publish-kb. implement → review → document → ship is
                         the chain a scope walks, each command printing the next (ADR 0013). afk drives
                         that chain unattended, one eligible scope anchor at a time, with the Skill tool
                         (ADR 0015). publish-kb sits outside the chain: it sends a scope's staged
                         knowledge-base pages to a remote backend, on the operator's own clock, and afk
                         never drives it (ADR 0023)
agents/                — subagents (*.md): implementer, slice-reviewer, simplicity-reviewer, final-reviewer,
                         doc-writer, doc-reader
hooks/                 — deterministic Node hooks + hooks.json: merge-guard, model-explicit, green-gate,
                         run-lock, ledger-guard, worktree-sweep, scope-prune, update-check
references/            — backend seed templates + plan-contract (slice schema/lifecycle, incl. the
                         optional epic sections: parked questions, non-goals, and the epic-visuals gate
                         for `## Slice graph`/`## Touch map`) + documentation convention +
                         controlled-prose (the writing standard) + content-types (the four kinds of
                         information a doc carries) — both read at runtime by the doc agents +
                         execution playbooks (implement-full/lite, read at runtime by /implement) +
                         scope-mode (the rule /review, /document, and /ship share, read at runtime by
                         each, plus its Unattended section /implement and both playbooks also read) +
                         authoring disciplines (cross-examination, domain-modeling, doc-verification;
                         read at runtime by /plan + /brainstorm, doc-verification also by implementer) +
                         review-checklist (anti-patterns, vuln-classes, reuse-audit, consistency; read at
                         runtime by final-reviewer + slice-reviewer)
docs/adr/              — architecture decision records (why the plugin is built this way)
docs/agents/           — superdev's own backend config (dogfooded: this repo's slice store, code host, documentation, KB, toolchain, verification)
scripts/               — standalone deterministic code wired into `bun run test`: `scope.js` (the
                         run-state CLI, ADR 0022), `eval-run.js` (the eval runner, ADR 0024), and
                         `drift-check.js`. What each one owns and guards is enumerated once, in the
                         `scripts/` entry of the Child DOX Index below.
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

The plugin ships as markdown and JS hooks. There is **no build step**. `commands/`, `agents/`, and
`references/` are prose. `hooks/` and `scripts/` are executable: `hooks/` holds Claude Code hooks, and
`scripts/` holds standalone checks like `drift-check.js`, which `package.json` runs.

## Stack

- **Bun.** The repo package manager and task runner (`bun.lock`).
- **Node.** The hooks' runtime. `hooks.json` invokes `node`, because every user's Claude Code
  environment has `node` and not every one has Bun. Bun is maintainer-only.
- **semantic-release.** Deterministic, commit-driven releases (`release.config.cjs`), published to
  **Codeberg** (Forgejo) through `@saithodev/semantic-release-gitea`.
- **Conventional Commits.** They drive the version bump. `feat` gives a minor bump, `fix` and `perf`
  give a patch bump. **Pre-1.0 policy:** `!` or `BREAKING CHANGE` also gives a **minor** bump (a
  `releaseRules` entry in `release.config.cjs`) — superdev stays below 1.0.0 until it has proven itself
  in real use, and removing that rule is what opens the first deliberate 1.0.0.

## Working rules (repo-specific: read before you edit hooks, the version, or the release config)

- **Hooks are CommonJS** (`.js`, `require`). Do **not** add `"type": "module"` to `package.json`. Node
  resolves the plugin's `package.json` when it runs a hook, and would then treat every hook as ESM,
  which breaks them in production. Only `.mjs` is ESM, because that is scoped by extension.
- **Every hook ships a `--selftest`.** Add one for any new hook. `bun run test` runs them all under
  `node`, which matches the production runtime. It then runs `claude plugin validate .` as a
  manifest-validation gate.
- **Version lives only in `.claude-plugin/plugin.json`.** Never hand-edit it. semantic-release and
  `semantic-release-replace-plugin` bump it on release. `marketplace.json` carries no version, which
  avoids a double pin where `plugin.json` would silently win.
- **Backends are pluggable.** To add a slice store, a code host, or a KB, write a new seed in
  `references/`. `/superdev:setup` turns that seed into the matching `docs/agents/*.md` in the *consumer*
  repo. `commands/` and `agents/` stay tool-agnostic. Do not hardcode a backend into them.
- **Docs follow a writing standard.** `docs/agents/documentation.md` names it, and the doc agents apply
  it to prose they write. This repo uses `controlled`
  ([`references/controlled-prose.md`](references/controlled-prose.md), ADR 0012).

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

## Common commands

```
bun install                        # install dev deps (release toolchain)
bun run test                       # hook selftests + plugin manifest validation
bun run eval                       # the with/without-plugin A/B over evals/ (needs the two vars below)
bun run eval:plan                  # the two cheap plan-only arms of that A/B
GITEA_TOKEN=<token> bun run release  # cut a release from clean main (see RELEASING.md)
```

**`bun run eval` needs `CLAUDE_CODE_OAUTH_TOKEN`.** `scripts/eval-run.js` runs each `evals/` case as
two arms on a Claude subscription instead of a metered API key (ADR 0024). The plugin arm loads
superdev through `claude -p --plugin-dir`. The baseline arm loads nothing. A maintainer creates the
token once with `claude setup-token` and exports it. The runner refuses to start without it and never
falls back to `ANTHROPIC_API_KEY`.

# DOX framework

- DOX is a highly performant AGENTS.md hierarchy, installed here
- The agent must follow DOX instructions across any edit

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or the child index changes. Update
child docs when a parent change alters local rules. Remove stale or contradictory text immediately. A
small edit that changes no behavior and no contract may leave the docs unchanged, but the DOX pass still
must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions. If there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check. If no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Child DOX Index

**No child AGENTS.md exists, because the repo is flat.** The repo is small, and every subtree's rules
already live in this root doc. See `Structure` above for the current file inventory. Add a child only
when a subtree becomes a durable boundary with rules of its own that do not fit here.

This root owns every subtree directly:

- `commands/`, `agents/`. Prose slash-commands and subagents. Governed by **Working rules, Backends are
  pluggable**: stay tool-agnostic and never hardcode a backend. Behaviour contracts live in the files.
- `hooks/`. Claude Code hooks, the plugin's deterministic guardrails. Governed by **Working rules, Hooks
  are CommonJS** and **Every hook ships a `--selftest`**. This is the strongest future child-doc
  candidate, if its rules outgrow this root.
- `scripts/`. Standalone deterministic code that `package.json` runs, alongside `hooks/`. It follows the
  same `--selftest` convention. Three executables live here.

  `scope.js` is the **run-state CLI** (ADR 0022): it owns the ledger's schema and is the only
  `ledger.md` read and write path in the chain — `init`, `stage get|set`, `slice`, `degraded add`,
  `get stage|branch|anchor|slices`, and `status` (which renders the whole `/superdev:status` report). A
  scope whose ledger stage reads `shipped` collapses to one line, `<scope>  (shipped)`. It drops the slice
  tally and the blocked list. `hooks/scope-prune.js` (ADR 0007) is about to reap that run root, so
  per-slice detail is no longer work in flight. Its `**Degraded:**` line and its staged-page lines survive
  the collapse, because each is otherwise recorded nowhere else.
  `status` also reports every scope's **staged knowledge-base pages** under `.superdev/kb-pending/`
  (ADR 0023): a `pending publish:` line per scope, a scope with no run root under `(no ledger)`, a
  non-`.md` file staged and ignored, and a `.md` file staged directly under `.superdev/kb-pending`
  outside any scope directory. Each is a page `/superdev:publish-kb` would otherwise silently miss.
  The stage machine's transition rules are enforced in its code, not in prose, and
  `hooks/ledger-guard.js` denies every other write path. Its selftest carries the retired drift
  assertions along with its own behavior: the stage machine, the ledger schema and header lines, a
  pre-CLI ledger parsing unchanged, and the scope-slug charset staying equal across `scope.js`,
  `hooks/run-lock.js`, and `references/scope-mode.md`.

  `eval-run.js` is the **eval runner** (ADR 0024). It runs every `evals/` case as two arms on a Claude
  subscription instead of a metered API key. The plugin arm loads superdev through `claude -p
  --plugin-dir`. The baseline arm loads nothing. It scores each arm's diff and transcript against the
  case's `graders/*.md`. It refuses to start without `CLAUDE_CODE_OAUTH_TOKEN` and never falls back to
  a billed `ANTHROPIC_API_KEY`. It exits non-zero in three cases. A case scores nothing. The ablation
  looks broken: the plugin arm shows no superdev marker in any of its runs, or the baseline arm shows
  one. An arm's transcript shows a mutating tool call, but the captured diff stays empty. It reports
  that capture failure as an error, never as a silent zero. `claude plugin eval` still reads the same
  `case.yaml` and `graders/*.md` files, unchanged, for a key-funded cross-check.

  Its selftest covers:

    - the case-YAML reader
    - the child-environment scrub
    - the two arms' argument difference
    - the run classifier
    - the diff-capture failure paths (an empty scaffold, work committed off HEAD, a nested repository
      tracked as a gitlink)
    - the grader and judge machinery
    - aggregation across runs
    - the missing-token exit

  The reference, run-root, assignee,
  anchor-contract, afk-selection-neutrality, writing-standard, content-types, command-resolution,
  chain-handoff, feature-label-argument, unattended-token, afk-invocation, change-type,
  degraded-pass, derived-criteria, label-validation, green-gate-timeout, and
  verb-pointer checks are drift assertions. They compare a restated fact against its source. The
  eval-shape check compares a document against a schema. The afk-existence check is a plain existence
  assertion.
  `drift-check.js` guards twenty-two things, in the order its `main()` computes them. First, that every
  `references/*.md` path named in `commands/`, `agents/`, or `references/` itself resolves to a file that
  exists. A reference cites
  another reference — both execution playbooks point at `scope-mode.md` — so a rename there dangles like
  any other. Second, that `commands/implement.md`,
  `commands/review.md`, `commands/document.md`, `commands/ship.md`, `commands/publish-kb.md`,
  `references/implement-full.md`,
  `references/implement-lite.md`, `references/scope-mode.md`, `agents/implementer.md`,
  `agents/slice-reviewer.md`, `agents/simplicity-reviewer.md`, and `agents/final-reviewer.md` address
  run-root artifacts by absolute
  `<run-root>/…` path. Third, that every issue-backend document carries the `**Assignee` config bullet.
  The filename alone triggers that check, with no content gate on how the doc phrases issue creation.
  `references/issue-tracker-local.md` is exempt, because it has no assignee concept. Fourth, that every
  slice-store document (every `references/issue-tracker-*.md` plus this repo's own
  `docs/agents/issue-tracker.md`) carries a `## Scope anchor` section stating all four of its elements: how
  to recognise an anchor, list its candidates, list the slices beneath one, and tell that an anchor is
  itself a slice (ADR 0017). Each element is matched on a bullet's bolded lead-in (`- **Recognise one.**`
  style, `-` or `*`, American or British spelling) rather than anywhere in the section, so intro prose
  that merely lists the four concepts satisfies none of them. Fifth, that `commands/afk.md`'s selection
  step (§2) names no backend's own
  anchor mechanism — an epic (the `epic` label, matched case-insensitively whether backticked or not,
  which also covers the local store's `00-epic-` filename), a change-type label prefix (any of them, and
  including a concrete label like `feat/self-improvements`; a type is excluded only when a further
  `/`-delimited segment follows it, which is what separates the paths this step legitimately carries —
  `docs/agents/…`, the store config it is meant to point at, and `docs/plans/<type>/` — from a label. A
  delimiter rule instead reads a real label as a path and passes it, and an allowlist of the two path
  literals both misreads an ADR citation as a prefix and lets `docs/plans-refactor` through),
  a GitHub sub-issue relation,
  a Jira parent field — and instead points at the store's `## Scope anchor` contract. A step that
  stayed neutral by naming nothing at all still fails this. Naming no mechanism is only half the property.
  `scanAnchorContract()` and `scanAfkSelectionNeutrality()` share one
  helper, `extractSection()`, which masks fenced code blocks first. (CommonMark's at-least-as-long
  closing-fence rule applies, so a shorter inner fence never closes a longer outer one.) Then it
  isolates the text of one heading's section before either scans its body. Sixth, that
  `references/documentation.md` still offers a `## Writing standard` section (ADR 0012).
  Seventh, that `agents/doc-writer.md` and `agents/doc-reader.md` each still instruct themselves to read
  `references/content-types.md` (ADR 0014). Eighth, that every
  `/superdev:<name>` reference in `commands/` or `agents/` resolves to a `commands/<name>.md` file, so a
  chain handoff never points the reader at a command that does not exist. Ninth, that
  `commands/implement.md`, `commands/review.md`, and `commands/document.md` each name their successor in
  the chain. `commands/ship.md` ends the chain and is deliberately outside that check.

  The tenth, eleventh, thirteenth, fourteenth, fifteenth, sixteenth, seventeenth, and eighteenth checks
  share one scanner, `scanContract()`, run over
  a table of `[document, pattern, expectation]` rows instead of one function each. It reads every
  document a table names and reports the rows whose pattern that document no longer matches. Tenth, the
  feature-label-argument contract: `commands/implement.md` declares an `argument-hint` naming a feature
  label and resolves `$ARGUMENTS`, and `commands/plan.md` names `/superdev:implement <label>` as its
  resolved successor, in a backtick-delimited invocation — the contract only, never the label's shape
  (ADR 0019). Eleventh, the
  unattended-token contract: `references/scope-mode.md`
  carries the `## Unattended` section (ADR 0016), and `commands/implement.md`, `commands/review.md`,
  `commands/document.md`, `commands/ship.md`, `references/implement-full.md`, and
  `references/implement-lite.md` each name `--unattended` and carry a read/apply instruction pointing at
  that section. Twelfth, that `commands/afk.md`'s stage table invokes all four chain commands and
  carries `--unattended` on every one of those rows. `scanAfkInvocations()` checks this row by row: a
  whole-file regex would pass the moment any one row carried the token, letting a sibling row lose it
  unnoticed. Thirteenth, the change-type contract:
  `references/scope-mode.md`'s type list, `hooks/scope-prune.js`'s `CHANGE_TYPES` regex,
  `CONTEXT.md`'s **Change type** glossary entry, and `scripts/scope.js`'s `CHANGE_TYPES` array state the
  same set (ADR 0021). A hook narrower than the prose misreads a live branch of the missing type as gone
  — gone is one of the two conditions that make a scope prunable (ADR 0007) — and reaps a shipped run's
  root that is still in progress, silently: the Stop hook that runs it reports nothing either way. The
  glossary is the copy most likely to drift, because nothing executes it. Fourteenth, the degraded-pass
  contract:
  `references/scope-mode.md` carries the `## Degraded passes` section, and `commands/implement.md`,
  `commands/review.md`, `commands/document.md`, `commands/ship.md`, `commands/status.md`,
  `references/implement-full.md`, and `references/implement-lite.md` each name the `**Degraded:**`
  ledger entry and point at that section. A consumer that drops the wire lets a run report assurance it
  never got — a pull request claiming a review that was its author reading their own work. Fifteenth,
  the derived-criteria contract: `commands/review.md` hands `final-reviewer` the **path**
  `<run-root>/dod.md` in its scope-mode dispatch, and `agents/final-reviewer.md` carries its
  `## Derive the criteria first` step (ADR 0020). Both halves are needed for the ordering to be real,
  because a prompt arrives at once — DoD text inlined in the dispatch is already read by the time the
  instruction asks for a derivation. Losing either half degrades the derivation into theater: references
  still resolve, the suite stays green, and the reviewer reads the DoD first exactly as before.
  Sixteenth, the label-validation contract:
  `references/scope-mode.md` carries the **Validate both segments.** rule, and `commands/implement.md`
  and `commands/afk.md` each point at it. The whole feature label becomes the branch name, so the type
  reaches `git switch -c` exactly as the slug does — a rule guarding the slug alone lets `-x/y` through to
  git as an option, and lets a non-canonical type make `scope-prune` reap a run root that is still live.
  A consumer
  that stops pointing at the rule validates nothing and stays valid prose. Seventeenth, the
  green-gate-timeout contract: `hooks/hooks.json` sets `"timeout": 600` on the green-gate
  PostToolUse(Bash) hook entry, and the comment beside `IS_MERGE` in `hooks/green-gate.js` names that
  same 600s ceiling, distinct from Claude Code's own 60s default hook timeout. Green-gate re-runs the
  scope suite synchronously inside the hook, so a suite slower than the configured timeout is killed
  mid-run and the gate silently doesn't fire — a hooks.json entry that loses its `timeout` field falls
  back to the 60s default unnoticed, because the suite stays green until a run happens to exceed it.
  Eighteenth, the verb-pointer contract (ADR 0022): every ledger touchpoint in the chain invokes its
  `scope.js` verb — `commands/implement.md` `init` and `stage set merged`, `commands/review.md`
  `stage set` and `get anchor`, `commands/document.md` `stage set`, `commands/ship.md` `get stage` and
  `stage set shipped`, `commands/status.md` `status`, `commands/afk.md` `get stage`,
  `commands/publish-kb.md` `get branch` for its merge check, both execution
  playbooks `slice`, and `references/scope-mode.md` `degraded add`. A document that drops its verb goes
  back to hand-editing or hand-parsing the ledger, which the `ledger-guard` hook only catches as a tool
  call at runtime, never as prose.
  Nineteenth and twentieth, the ADR 0023 knowledge-base contracts, checked in two halves because either
  alone passes while the invariant is gone. Nineteenth, the staging half: `commands/plan.md`,
  `commands/document.md`, and `agents/doc-writer.md` each name `.superdev/kb-pending/` as the place a
  remote backend's page goes instead of a live call. Twentieth, the no-call half, `scanKbNoBackendCall()`:
  none of those same three documents carries a backend-directed verb — publish, create, update, upsert, or
  an HTTP `POST`/`PUT`/`DELETE` — aimed at a page, wiki, space, or backend object.
  `commands/publish-kb.md` is exempt, because reaching the backend is its job. The check reads the
  instruction's shape rather than a backend's literal endpoint or credential name, because
  **Backends are pluggable** already forbids these three documents from naming a backend at all, so a
  literal-only marker would catch almost nothing.
  Twenty-first,
  that `commands/afk.md` exists at all. Nothing else in the plugin names `/superdev:afk` for the eighth
  check to resolve, so its absence would otherwise go unnoticed. Twenty-second, that every
  `evals/*/graders/*.md` declares a known `type` and a positive `weight`, that an `llm` or `regex`
  grader also declares a `focus` or `target`, and that every case's `scaffold_script` resolves. Nothing
  else validates a grader, so without this a typo surfaces part-way through a run that costs real API
  spend.

  The first and seventh checks are opposites. The first catches a reference to a file that does not exist.
  The seventh catches an agent that drops its wire to a file which still exists. That drift leaves the
  reference resolvable and the suite green, and the lens then does nothing in any dispatch.

  The first and eighth checks are the same check at two levels: one resolves a `references/` path, the
  other a command name. The eighth and ninth are opposites in the same way as the first and seventh: the
  eighth catches a handoff that points at a command with no file, the ninth a command that names no
  successor at all.
- `references/`. Backend seed templates plus the non-seed references below.
  + `plan-contract.md`: the slice schema and lifecycle, including the optional epic sections, the
    epic-visuals gate for `## Slice graph` and `## Touch map`, and the `## Scope anchor` section — the
    generic contract (a feature's root; a single-slice plan's anchor is its own lone slice) that each
    store document (`issue-tracker-*.md`, `docs/agents/issue-tracker.md`) specialises for its own backend
    (ADR 0017). Its `## Feature label` section is the same shape one level over: the generic contract (a
    change type plus a slug, picked by `/plan`) that each store document renders in its own notation
    (ADR 0019, ADR 0021).
  + `documentation.md`: the in-repo documentation convention, including the `## Writing standard`
    section that `/superdev:setup` fills in.
  + `controlled-prose.md`: the **writing standard**. A language-neutral rule set that merges the
    ASD-STE100 Part 1 rules with the rules the tekom catalogue and the *Handbook of Technical Writing*
    reach that ASD-STE100 does not. Read at runtime by `doc-writer`, which applies it, and by
    `doc-reader`, which verifies it (ADR 0012).
  + `content-types.md`: the **content-type lens**. The four kinds of information a doc carries, and the
    test for reporting an absent conceptual layer. Read at runtime by `doc-writer`, which applies it in
    both its passes, and by `doc-reader`, which checks it in Pass 1. Unlike the writing standard it is
    never configurable and never `none`, because coverage is a completeness property and not a style
    one (ADR 0014).
  + **Execution playbooks** (`implement-full.md`, `implement-lite.md`): the tier-specific linear
    procedures `/implement` reads at runtime once it computes the tier.
  + `scope-mode.md`: the rule `/superdev:review`, `/superdev:document`, and `/superdev:ship` share (ADR
    0013) — what makes a range a live scope run, how to find the scope checkout on disk for both tiers, and
    the run-lock refresh-not-create rule. Each of the three reads it at runtime and keeps only what is
    specific to it. Its `## Unattended` section defines the `--unattended` token (ADR 0016). It is the
    argument that lets `/superdev:afk` drive a command with no standing answer written at a stop
    blocking instead of asking. `/superdev:implement` and both execution playbooks read that section
    too. Its `## The scope slug` rule states the charset a feature label's slug, or any other external
    source, must match. The check runs before that slug becomes a branch segment or a run-root path
    segment.
    `/superdev:implement` and `/superdev:afk` both read it. Its `## The change type` section owns the
    Conventional Commits type set a scope branch leads with (`<type>/<slug>`, the feature label verbatim)
    and names `/plan` as the command that picks one (ADR 0021). `hooks/scope-prune.js` matches that set
    only on its pre-CLI fallback path. A scope is finished with once its branch is merged or gone
    (ADR 0007), and the ledger's `**Branch:**` line is what the hook checks first. Its `## Degraded passes`
    section (ADR 0018)
    defines the pass a run did not get — a dispatch the permission classifier denied, or one that could
    not reach what it needed — what a command does about one attended and unattended, and the
    `**Degraded:**` ledger entry that carries it to `/superdev:ship`'s pull-request body and
    `/superdev:status`'s report. Its `## The ledger` section defers the ledger's schema to `scripts/scope.js` (ADR 0022), which
    owns it and is the only read and write path — including the `**Anchor:**` line
    `/superdev:implement` hands to `init` and `/superdev:review` reads back (`get anchor`) for the
    PR-facing title.
  + **Authoring disciplines** (`cross-exam.md`, `domain-modeling.md`, `doc-verification.md`): the
    relentless cross-examination, active-domain-modeling, and verify-against-official-docs disciplines
    that `/plan` and `/brainstorm` read at runtime. They are superdev's own rendering of Matt Pocock's
    grilling and domain-modeling skills. The `implementer` agent also reads `doc-verification.md` before
    it acts on an assumption about a third-party library, API, or service.
  + `review-checklist.md`: named anti-patterns, vulnerability classes, a reuse-audit lens, and a
    consistency lens. `final-reviewer` reads all four and `slice-reviewer` reads the anti-patterns and
    vulnerability classes.
- `docs/adr/`. Architecture decision records. `docs/agents/`. This repo's own dogfooded backend config.
- `.claude-plugin/`. Manifests. Governed by **Working rules, Version lives only in `plugin.json`**.
- `CONTEXT.md`. The domain glossary. `evals/`. The with/without-plugin A/B, where `evals/README.md` owns
  its grader-neutrality and result-reading rules.
