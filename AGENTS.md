# superdev

A self-contained **Claude Code plugin** that takes a feature from a rough idea to a verified deploy:
brainstorm, plan, implement, review, document, pull request, ship, verify, and wrap-up. Beside that chain
it audits tests, sweeps a repository, reports run status, and publishes a knowledge base. It gives you interview-driven
vertical slicing, an execution tier sized to the plan, deterministic hook guardrails, and a pluggable
slice store plus code host. A plan of more than 3 `behavior` slices runs in parallel slicetrees with
isolated implementer and reviewer subagents, and the controller builds each `docs` and one-file `mechanical`
slice itself in its slicetree. A plan of 3 or fewer `behavior` slices, whatever its number of `mechanical` and
`docs` slices, runs test-first, inline in the scopetree.
No prerequisite plugins.

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
.claude/
  CLAUDE.md            — pulls this document into a session opened here (`@../AGENTS.md`), so the
                         working contract below is always loaded. Installing the plugin is a
                         user-scope action no tracked file can perform, so this repo ships no
                         `settings.json`; `README.md` → Install carries the operator steps, and
                         `.claude/settings.local.json` stays gitignored
.claude-plugin/
  marketplace.json     — single-plugin marketplace manifest (deliberately NO version field); its
                         `source` is a `git-subdir` entry with `path` `plugin` and `ref` `v<version>`, so
                         an install copies only the shipped tree below, as the release tag holds it
.github/workflows/     — `template-tests.yml`: runs `tests/publish-kb-templates.test.js` on Linux, macOS,
                         and Windows (Git Bash) for every pull request to `main` (ADR 0212)
plugin/                — the SHIPPED tree: everything a user's install copies, nothing else
  .claude-plugin/
    plugin.json        — plugin manifest (name, version, author); version is the SINGLE source of truth.
                         No `hooks` field — Claude Code auto-loads the standard hooks/hooks.json.
  skills/              — the `/superdev:<name>` surfaces, one `<name>/SKILL.md` each (ADR 0102):
                         brainstorm, setup, plan, implement, review, document, submit-pr, ship, verify-ship,
                         wrap-up, upgrade, status, publish-kb, review-tests, sweep
  agents/              — the subagents (*.md): implementer, slice-reviewer, simplicity-reviewer,
                         final-reviewer, doc-writer, doc-reader, test-auditor,
                         test-gap-auditor
  hooks/               — the deterministic Node hooks + hooks.json: merge-guard,
                         tree-guard, run-trace (with the model guard), slicetree-sweep, scope-prune, update-check
  lib/                 — every module: code that no hook registration and no prose step runs (ADR 0151).
                         `hooks/` and `scripts/` hold entry points only, each keeping its path and exports.
                         A module has one responsibility and opens with its file name and a colon.
                         No module reads a Bash command's words (ADR 0227): `merge-guard.js` holds the one raw-text
                         check, and `drive-path.js` (the MSYS drive-path translator, ADR 0150) is the only path
                         helper `discard.js` and `prepare.js` share.
                         Ledger and run state: `ledger.js` (vocabulary, stage rank, line primitives),
                         `ledger-lifecycle.js` and `ledger-records.js` (the verbs that move a run and
                         record a fact), `suite-base-get.js`, `dod-line.js`, `dod-tags.js` (the `dod-tags` verb that rewrites and checks criterion tags, ADR 0209), `dod-check.js` (the `dod-check` verb that checks an anchor's Absorbs citations, `Reachable:`, and release-risk categories, ADR 0233), `ci.js` (the `ci` verb that judges a commit's check status against its named CI checks, ADR 0255), `dod-merge.js` (the `dod-merge` verb and the
                         per-line merge adopt uses, ADR 0206), `run-state.js` (`publish` and
                         `adopt`), `status.js`, `usage.js`, `refusal.js` (the refusal error),
                         `main-work-tree.js`, `verification.js` (the readers of `verification.md`).
                         Run integrity: `run-digest.js` (the digest sidecar of a run root and its lock) and
                         `run-check.js` (the check every verb that writes to a run makes before its write,
                         which records a `tamper` trace line, ADR 0227); `untraced.js` (the `untraced` verb).
                         Read-only grading (ADR 0260): `trace-window.js` (the one **Window** derivation and the slice and
                         edit-path comparison the trace verbs share) and `fail-to-pass-check.js` (the `fail-to-pass-check` verb).
                         Operator configuration: `operator-config.js` (the reader of `.superdev/info.json`,
                         used by push, fail-to-pass, and the KB backend runner, ADR 0207).
                         Git and containment: `git-spawn.js` (the shared git calls), `containment.js`,
                         `collisions.js`, `citations.js`, `source-set.js` (the gap audit's source set and test-file list), `push.js`
                         (the `push` verb that puts a scope branch on the remote, ADR 0167), `plan-open.js`
                         (the `open` verb that sets up a plan run, ADR 0185), `discard.js` (the `discard` verb that removes a planned run's state, ADR 0208),
                         `run-state-ref.js` (the run-state ref `refs/superdev/<scope>`: sent at a step end,
                         fetched in `adopt`, deleted at wrap-up, ADR 0202).
                         Run trace: `trace-log.js` (writer, reader, field codec), `run-tree.js`,
                         `dispatch.js`, `dispatch-lines.js`.
                         Test verbs: `test-verb.js`, `fail-to-pass.js`, `run-supervision.js`, `prepare.js` (the prepare command's runner and the `prepare` verb, ADR 0218).
                         Knowledge base: `md-sections.js` (the section rules `kb-patch.js` and the
                         run-state and `dod-line` readers share), `md-to-storage.js` (markdown to
                         Confluence storage), and `kb-staging.js`, `kb-backend-config.js`,
                         `kb-staged-page.js`, `kb-backend.js`, `kb-apply.js`, `kb-parent-link.js`,
                         `kb-containment.js`, `kb-read.js`, `kb-report.js` (the parts of `publish-kb.js`).
  references/          — backend seed templates + the non-seed runtime references (plan-contract with
                         plan-authoring, store-records, and assignee,
                         documentation convention, controlled-prose, content-types, doc pass, run init,
                         run handoff, execution playbooks with the full playbook's rare-branch files (implement-full-resume,
                         implement-full-fix-cycle, implement-full-denied, implement-full-minor-sweep), test-selection,
                         scope-mode with its split files scope-branch,
                         run-state, scope-findings, and shipped-run, authoring
                         disciplines, intent handoff, prior-art audit, design sketch, diagnosis, prototype, merge-conflicts,
                         review-checklist with its split lens files (review-design-lenses, review-coverage, fail-to-pass,
                         untraced-writes, dependency-verification, prompt-concept-overlap, test-cost, test-gaps),
                         review-scope-mode with its branch files (review-scope-holds, review-scope-denials,
                         review-scope-base, review-scope-deferrals, review-scope-coverage), review-inline-fix, dod-ticks,
                         response-shapes); its own AGENTS.md routes them
  scripts/             — the runtime CLIs: `scope.js`, `kb-patch.js`, `publish-kb.js`
  LICENSE · NOTICE     — copies of the root files, so the shipped tree carries its own attribution
tests/                 — one suite per shipped executable (the hooks, `scope.js`, `kb-patch.js`,
                         `publish-kb.js`), one per module named for it
                         (`git-spawn.js`, `drive-path.js`, `md-to-storage.js`), one for the shipped
                         tree's layout (`plugin-layout.test.js`: entry-point export names, re-export
                         identity, the CommonJS anchor over `plugin/lib/`), and one each for the
                         maintainer-only `invariant-check.js` and `run-tests.js`, framework-free
                         `node:assert`, run under `node` by `node scripts/run-tests.js` (ADR 0059). A large entry
                         point's suite is split flat by topic into `tests/<entry>-<topic>.test.js` over one
                         `<entry>-setup.js` that is no suite (ADR 0139, ADR 0151): `scope-*` (ledger,
                         ledger-header, `suite-*` (record, carry, complete, rerun, config, failed), dod-line, dod-tags, dod-check, dod-merge, publish-adopt, trace, windows, digest, untraced, fail-to-pass-check, root-base, containment,
                         citations-collisions, source-set, ci, push, open, help, stdin, discard, prepare, `test-verb-*`, `fail-to-pass-*`, over `scope-setup.js`),
                         `run-trace*` (dispatch, guards, model, paths, over `run-trace-setup.js`), `publish-kb*` (containment, guard, `parent-link-*`,
                         patch, publish, read, scope, templates, timeout, over `publish-kb-setup.js`),
                         and `scope-prune*` (containment, guards, main, reap, over `scope-prune-setup.js`);
                         `spawn-verdict.js` and `fixture-git.js`
                         are shared helpers, not suites — `assertSpawnDecided` (INV-0009), asserted by
                         `spawn-verdict.test.js` and called from every other suite's bounded-spawn sites;
                         `linear-time.js` is the shared same-run timing helper of the linear-time pins (`timePair`,
                         and `cpuNs`, the thread CPU clock a pin reads to size its input), asserted by `linear-time.test.js`;
                         `fixture-git.js` appends `commit.gpgsign=false` to the `GIT_CONFIG_*` environment and
                         exports `templateOnce` (a fixture template built once per process) and `copyFixture`
                         (one copy per case); `fixture-git.test.js` asserts it
docs/adr/              — architecture decision records (why the plugin is built this way)
docs/agents/           — superdev's own backend config (dogfooded: this repo's slice store, code host, documentation, KB, toolchain, verification, deployment)
docs/known-issues.md   — Claude Code platform behaviour superdev works around, each entry with its
                         shipped mitigation and dated verification
mods/superdev-view/    — maintainer-only Claude Code mod: a pane of a repository's `.superdev/`
                         folder, its own single-plugin marketplace (`.claude-plugin/marketplace.json`);
                         never shipped. Its own suites run under `claude plugin test`; `node scripts/run-tests.js` runs none
                         of them, and only reads its fixture files through `tests/run-trace-dispatch.test.js`,
                         `tests/scope-ledger.test.js`, and `tests/scope-dod-line.test.js`
                         its `.gitignore` excludes `hooks/*.js`, because the hooks are TypeScript only;
                         its own AGENTS.md states the pane's behaviour contract
scripts/               — the maintainer-only CLIs `node scripts/run-tests.js` runs: `drift-check.js` with its
                         `drift/` modules (registry, contract tables, scanners, shared helpers,
                         selftest suites), `invariant-check.js`, the invariant register validator, and
                         `run-tests.js`, the suite runner
release.config.cjs     — semantic-release config (semantic-release-replace-plugin bumps plugin.json and
                         the marketplace source's `ref`)
package.json           — dev-only tooling (Bun); NOT published to npm
.node-version          — the maintainer Node major (`26`) a version manager such as fnm installs; not shipped
CHANGELOG.md           — release-managed by semantic-release; do not hand-edit
CONTEXT.md             — the domain-language glossary (ubiquitous terms); maintained by /plan
README.md · RELEASING.md · CONTRIBUTING.md · SECURITY.md · CODE_OF_CONDUCT.md · NOTICE · LICENSE
```

The plugin ships as markdown and JS hooks. There is **no build step**: the marketplace source's `path`,
`plugin`, is what limits an install to the shipped tree, and its `ref` pins the install to the release
tag (ADR 0131), so releasing stays a plain commit. `skills/`,
`agents/`, and `references/` are prose. `hooks/`, `lib/`, and both `scripts/` dirs are executable. Paths inside
`plugin/` resolve against the plugin root at runtime, so prose there names them without the `plugin/`
prefix; `scripts/drift/lib.js`'s `docPath()` resolves the same plugin-relative paths for the
maintainer-side checks.

This tree is layout only. What each subtree owns, which working rule governs it, and how the pieces
depend on each other is stated once, in the **Child DOX Index** at the end of this document.

## Stack

- **Bun.** The repo package manager and release runner (`bun.lock`). No test runs through it.
- **Node.** The hooks' runtime and a prerequisite on the user's PATH, which Claude Code does not
  install. `hooks.json` invokes `node`, because not every environment has Bun. Bun is maintainer-only.
- **semantic-release.** Deterministic, commit-driven releases (`release.config.cjs`), published to
  **GitHub** through `@semantic-release/github`.
- **Conventional Commits.** They drive the version bump. `feat` gives a minor bump, `fix` and `perf`
  give a patch bump. **Pre-1.0 policy:** `!` or `BREAKING CHANGE` also gives a **minor** bump (a
  `releaseRules` entry in `release.config.cjs`). superdev stays below 1.0.0 until it has proven itself
  in real use, and removing that rule is what opens the first deliberate 1.0.0.
- **No breaking changes before 1.0.0.** superdev has no official release below 1.0.0, so no change
  counts as breaking for an adopter. A plan removes or renames a command, flag, environment variable,
  or file format without a compatibility shim or a migration step. Its consumer-compatibility release
  risk reads `none`, with this rule as its reason.

## Working rules (repo-specific: read before you edit hooks, the version, or the release config)

- **Hooks are CommonJS** (`.js`, `require`). `plugin/package.json` is the anchor: it carries
  `"type": "commonjs"` and ships with the plugin, so Node never walks past the install directory to
  whatever `package.json` an ancestor of the user's plugin cache happens to carry. A `"type": "module"`
  found there treats every hook as ESM and breaks them all in production. Do **not** change that
  field, and do not add `"type": "module"` to the root `package.json` either. Only `.mjs` is ESM,
  because that is scoped by extension.
- **Every shipped executable has a suite in `tests/`, named for it.** Add one for any new hook or
  script. `node scripts/run-tests.js` runs every `tests/*.test.js` suite under
  `node`, which matches the production runtime. The suites and the tail run concurrently, as many at once as
  `os.availableParallelism()` reports, so a suite must share no mutable state with another. A suite writes only inside a
  temporary directory it created itself, reads the repository's files without writing them, and uses no fixed path
  another suite could also use. A breach shows as a suite that fails only when another runs beside it. A suite builds each fixture
  repository once per process and copies it per case. Each `run-tests: <label>: <ms> ms` line is wall clock including the wait for a CPU,
  so time one suite alone with `time node tests/<suite>.test.js` (`scripts/AGENTS.md` → run-tests.js; measured on Node v26.12.1, about 89 s for the full run, in `docs/agents/verification.md`). No roster needs an edit when a suite is added. The runner then runs `invariant-check.js` against this repository's own register, `drift-check`'s own
  `--selftest`, `drift-check` itself, and `claude plugin validate ./plugin` as a manifest-validation
  gate. A suite that commits in a fixture repository sets `commit.gpgsign=false` for every git child
  by requiring `tests/fixture-git.js` at its top (it appends to `GIT_CONFIG_COUNT`), so a maintainer's global signing setup never fails a fixture
  commit.
- **A duration assertion is legitimate only against a same-run baseline, or a qualitative ceiling.**
  A process that did not finish carries no verdict (INV-0009): never bracket a bounded `spawnSync`
  with `Date.now()` and assert an absolute elapsed ceiling, because wall clock includes every
  millisecond the process spent descheduled, and a correctly bounded call under scheduler starvation
  produces the same reading as a real defect (ADR 0086). Compare against what the same run itself
  measured instead, or against the bound the test itself configured (`tests/publish-kb-setup.js`'s `hangBound()`, ten times
  the slowest healthy backend spawn that run timed, and the checks relative to it). A bound that a healthy
  command must also clear is itself taken from the same run, never fixed. Where the failure
  the assertion catches is qualitative — catastrophic backtracking is effectively unbounded — a loose
  ceiling still falsifies exactly what a tight one did, so keep the ceiling and loosen it rather than
  drop it (`tests/merge-guard.test.js`'s `LONG_VALUE_OPT` guards). A
  linear-time pin takes both readings through `tests/linear-time.js`'s `timePair`, which measures the CPU
  time of the thread running the code, so time the process spends descheduled reaches neither reading
  (ADR 0149). It keeps its own input ratio and a multiplier ceiling between linear and quadratic growth,
  and passes that ceiling to `timePair` as its fourth argument. Machine load can still move a CPU-time
  reading, so `timePair` measures a pair again when it reads at or over the ceiling, up to three attempts
  in all, and the pin judges the last pair. A one-off load spike then decides no pin.
  `timePair` needs `process.threadCpuUsage()`, so `package.json`'s `engines.node` requires Node 24 or later
  for the test toolchain. The hooks under `plugin/` do not use it.
- **No test run without due cause** (ADR 0242). A maintainer or agent working here names the question a run
  answers before making it, and makes the smallest run that answers it: one test where the runner can pick it, one
  suite (`node tests/<suite>.test.js`), or `node scripts/run-tests.js --related <paths>`. A prose-only change needs the `--related` tail alone. The full
  `node scripts/run-tests.js` runs at most once per branch, before its pull request, and only when the change touches
  code a focused run cannot reach. Parallel agents never each run the full suite. Shipped prose holds adopters' runs to
  the same rule, in `references/test-selection.md`'s `## Every run answers a question`.
- **Shipped code carries no test seam** (ADR 0154). Under `plugin/`, no environment variable, parameter,
  default, export, or comment exists for a test's sake. A suite reaches behaviour through the shipped
  entry points and the real inputs they take, and a suite that needs a different bound or remote builds
  its fixture around the unchanged code. The `test-seams` drift check holds the forms it can scan
  (`scripts/AGENTS.md`).
- **Normalize a path before you compare it.** A path from git output or from command text can be an MSYS
  path on Windows (`/c/Users/…`). Hooks and scripts normalize it before comparing it with a path Node
  builds (ADR 0150).
- **Version lives only in `plugin/.claude-plugin/plugin.json`.** Never hand-edit it. semantic-release and
  `semantic-release-replace-plugin` bump it on release. `marketplace.json` carries no version, which
  avoids a double pin where `plugin.json` would silently win. Its source's `ref` names the release tag,
  `v` followed by that version, and the same release step rewrites it (ADR 0131). Never hand-edit it
  either.
- **Claude Code is superdev's only harness** (ADR 0102). Skills, agents, and references name Claude
  Code's features, tools, and frontmatter directly. Prose is not written harness-neutral for
  portability.
- **Backends are pluggable.** This covers the slice store, the code host, and the knowledge base, and
  nothing else. To add one of them, write a new seed in `references/`. `/superdev:setup` turns that seed
  into the matching `docs/agents/*.md` in the *consumer* repo, and a later re-run offers the seed's newer
  sections and rules to that document as seed gaps (ADR 0107). `skills/` and `agents/` stay
  backend-agnostic. Do not hardcode a backend into them.
- **Docs follow a writing standard.** `docs/agents/documentation.md` names it, and the doc agents apply
  it to prose they write. This repo uses `controlled`
  ([`references/controlled-prose.md`](plugin/references/controlled-prose.md), ADR 0012). Its own
  `## Scope` section states where it applies: the `AGENTS.md` tree, `README.md`, ADR text, glossary
  entries, knowledge-base pages, and report text. Prompt prose is outside it, and has its own rules
  below.
- **Prompt prose follows the prompt-architecture rules.** They govern `skills/`, `agents/`, and
  `references/` prose:
  - **Prompt the positive.** Steering by prohibition drags the forbidden behaviour into context and makes
    it more available. Phrase the wanted behaviour, and reserve `never` for real contracts.
  - **Completion criteria demand.** "Every modified model accounted for" forces thorough work where
    "produce a change list" does not. Write every done-condition in the demanding form.
  - **Hiding later steps needs a real context boundary.** A subagent dispatch, or a path handed instead
    of inlined text, clears context. An inline mention does not. ADR 0020 is the applied case.
  - **Descriptions are permanent context load.** Every agent `description`, and every skill `description`
    within the skill listing's budget, is always loaded: front-load the trigger word, one trigger per
    branch (synonyms are one branch written twice), and cut identity the body already carries. A skill
    carrying `disable-model-invocation: true` is the exception: its description stays out of the model's
    context and is read only by a human browsing the slash commands
    ([skills docs](https://code.claude.com/docs/en/skills.md), checked 2026-10-08).
  - **A step that starts another skill names the Skill tool.** Write "call the Skill tool with
    `superdev:setup`", never a bare "run `/superdev:setup`", and name one skill per call. Upstream
    mattpocock/skills adopted this because a skill named in prose loads less reliably (its CHANGELOG, PR
    #878); superdev has not measured that gain (ADR 0129). A step whose target carries
    `disable-model-invocation: true` cannot reach it through the tool, so it tells the operator what to run
    instead, and so does every line written for the operator, such as the Next block.
  - **A contract in an agent body also holds in the dispatch prose that reaches it.** Both halves arrive
    in one prompt, and the dispatch is the later, more specific instruction, so it wins a conflict
    ([`CONTEXT.md`](CONTEXT.md) → *Dispatch prose*, ADR 0035). An edit to a contract in `agents/` also
    edits the `skills/` sentence that dispatches it, and a review reads the two together.
  - **Write each agent body and each listed skill file as prompt concepts.** The convention is in
    [`CONTEXT.md`](CONTEXT.md) → *Prompt concept* and *Main sentence*, and in ADR 0169 and ADR 0190.
    The glossary's *Prompt concept* entry lists the governed skill files. An edit to `plugin/agents/`
    or to a listed file keeps every concept's invariants. A review checks the **No overlap** invariant with the test and grades in
    `references/prompt-concept-overlap.md`'s `## Prompt-concept overlap` (ADR 0170). A reviewer reads that file only
    where the reviewed repository's `CONTEXT.md` defines **Prompt concept**.
  - **Prose states no count of a growing set.** "The eight shipped hooks" reads as a fact and is a
    hostage: adding a hook makes it false in every document repeating it, and nothing fails. Name the
    set, or name its members, and keep a numeral only where the number is the fact — a cap, a
    threshold, or a fixed arity (ADR 0064).
- **A new drift check tests a mechanical fact or forbids a form** (ADR 0153). A mechanical fact is a link
  or section target that resolves, a number that is unique, a file or command that exists, or a property
  of code or configuration. A forbidden form is text shipped prose must never contain. No drift check
  asserts how a positive clause is worded, and none compares a value with a comment.
- **ADRs and invariants govern production assets only.** An ADR in `docs/adr/` and an entry in
  `docs/invariants.md` state a rule that constrains a production asset: a file under `plugin/`,
  `.claude-plugin/`, or `mods/superdev-view/`. What prompted the rule does not decide this, and a rule that
  constrains a production asset and the setup together is an ADR or an invariant too. A rule that constrains
  only this repository's build, test, documentation, or release setup (`tests/`, `scripts/`, `.github/`,
  `package.json`, `release.config.cjs`, the docs conventions) is a working rule here or in
  `scripts/AGENTS.md` (`references/domain-modeling.md`).
- **Platform-dependent claims carry dated verification.** An ADR, or an entry in
  [`docs/known-issues.md`](docs/known-issues.md),
  states a claim about Claude Code behaviour. When you re-check that claim, record a dated update naming
  the version and the observed evidence ("Verified 2026-08-19, on Claude Code 2.1.x, output …"). A stale
  platform claim then shows its age instead of silently misleading.

## Known issues (Claude Code platform)

Platform behaviour superdev works around, with the mitigation each one ships:
[`docs/known-issues.md`](docs/known-issues.md). It covers the SessionStart preamble leak
into subagent prompts (issue #32), the delegation handoff classifier behind a denied dispatch
(ADR 0039, ADR 0041), and the `SubagentHandback` tool that carries a subagent's report, which the run trace
does not read (ADR 0197). It also covers the classifier's denial of ship's own merge call. Ship stops on that denial and names it, per `plugin/skills/ship/SKILL.md`. It also covers native Windows with Git Bash (ADR 0150), and the PostToolUse `cwd` that names the
directory a Bash command ended in, which run-trace works around with a PreToolUse stash (ADR 0159), and the
desktop app's wrap-up guidance that competes with the chain start, which the start answers by being the first
action of the closing (ADR 0253). It also covers Code Mode, which refuses a tool call from code when a PreToolUse
hook gives no decision, and fires UserPromptSubmit at the end of each piece of code. Read it before you change subagent prose or the unattended block.

## Common commands

```
bun install                        # install dev deps (release toolchain)
node scripts/run-tests.js          # every tests/ suite, drift-check, plugin manifest validation
node scripts/run-tests.js --related <path>...  # the tail plus the suites the paths reach
node scripts/run-tests.js --help   # the accepted forms; any other argument is refused, exit 2
node tests/<suite>.test.js         # one suite, no tail
GH_TOKEN=$(gh auth token) bun run release  # cut a release from clean main (see RELEASING.md)
```

superdev carries no A/B harness measuring it against a no-plugin baseline (ADR 0129). `tests/` check that
the plugin does what its prose says, and `drift-check` that its links, numbers, and forbidden forms hold,
never that saying it helps.

## Agent skills

### Slice store
GitHub Issues (`Bomret/superdev`). Slices as issues, feature labels, epics as scope anchors. See `docs/agents/issue-tracker.md`, and `docs/agents/issue-tracker-plan.md` for the calls only `/superdev:plan` makes.

### Code host
GitHub. Push scope branch, open ready PR against `main`, squash-merge with Conventional Commits title. See `docs/agents/code-management.md`.

### Documentation
`AGENTS.md` hierarchy (root + `scripts/AGENTS.md` + `plugin/references/AGENTS.md` + `mods/superdev-view/AGENTS.md`). `controlled` writing standard, American English. See `docs/agents/documentation.md`.

### Knowledge base
GitHub repo Wiki, published by git push. Adopters first, maintainers second, English. Topic pages and Guide pages sit under Home, each named in the outline. The `(aggregate)` page is Concepts. See `docs/agents/knowledge-base.md`.

### Toolchain
Bun dev toolchain, Node runtime for hooks. `node scripts/run-tests.js`, `bun run release`. No linter or formatter. See `docs/agents/toolchain.md`.

### Verification
`node scripts/run-tests.js` in the first fence (the full command, about 90 s on the maintainer's 8-core machine), `node scripts/run-tests.js --related {paths}`
in the second (the focused command, about 2 s for a change set whose `.md` paths no suite names). See `docs/agents/verification.md`.

### Deployment
`none`. A release (`bun run release`) is repository-wide and batches every merged feature, so it is no
feature's deploy target. See `docs/agents/deployment.md`.

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

**The children of this root.** [`scripts/AGENTS.md`](scripts/AGENTS.md) owns what the scripts guard: the
maintainer-only ones in `scripts/` and the shipped ones in `plugin/scripts/`. That ownership
includes the drift-check table, one row per check.
[`plugin/references/AGENTS.md`](plugin/references/AGENTS.md) owns the reference routing table: which
reference owns which contract, and which runtime surface reads it.
[`mods/superdev-view/AGENTS.md`](mods/superdev-view/AGENTS.md) owns the superdev-view mod's behaviour
contract, its install steps, and how its tests run. Every other subtree's rules live in this root doc.
See `Structure` above for the current file inventory. Add a child only when a subtree becomes a
durable boundary with rules of its own that do not fit here.

This root owns every other subtree directly:

- `plugin/skills/`, `plugin/agents/`. Prose skill surfaces and subagents. Governed by **Working
  rules, Backends are pluggable**: stay backend-agnostic and never hardcode a backend. Behaviour contracts
  live in the files. Claude Code merges plugin skills and commands into one `/superdev:<name>` surface.
  implement → review → document → submit-pr is the chain a scope walks, each skill starting the next at
  its clean exit (ADR 0013, ADR 0253). A full-tier run queues the Minors of each Minor-only slice review. The queue is settled in one
  **Minor sweep** after the last slice merges. `scope.js minors add` writes the queue. A fix
  cycle whose list holds only Minors is a **Warm cycle**: it continues the previous fix implementer. The
  sweep is `references/implement-full-minor-sweep.md`'s `## Minor sweep`, the warm cycle `references/scope-findings.md`'s
  `## Warm cycles` (ADR 0174). A scope review warrants each `simplicity-reviewer` cut by the rules the
  repository documents for itself, names each declined cut with the rule it would break, and puts each
  warranted cut into its fix list as a Minor. The scope review fixes every finding it lists without asking whether to,
  attended and unattended alike. An attended review asks only, per broken Definition-of-Done criterion and before
  its first fix dispatch, whether to fix it or accept it as unmet with the operator's reason (ADR 0256). Only the entry review gets the over-engineering pass
  (ADR 0228). An attended ad-hoc review whose remaining findings are all Minor, warranted cuts included, and
  whose subject ends at a commit offers an **Inline fix** after one yes: one implementer fixes the list on a
  `review-fix/<short SHA>` branch in a **Fix worktree** under the main working tree's `.superdev/review-fixes/`,
  one focused run and a warm re-review close it. The worktree is no run root and is removed when clean, kept
  and named when dirty, and the branch stays. Review merges, pushes, and opens nothing
  (`references/review-inline-fix.md`, ADR 0228). Every command listed in `references/response-shapes.md`'s Next block section closes its last
  message with that block (ADR 0113). A chain command starts its own successor through the Skill tool in the
  same turn, per that file's `## The chain start` (ADR 0253): implement starts review, a clean scope review
  starts document, and document on a reviewed scope starts submit-pr, each with the arguments its Next block
  would print and no question first. The start is the first action of the closing. The starter first closes
  its step and publishes. It prints no Next block on that exit. It prints nothing after the started command
  returns. A step-scoped bar of the starter ends at the start. A `Blocked:` line, a `First:` wait, a refusal,
  a non-clean verdict, or a failed start ends the chain on the stopping command's Next block. An ad-hoc run
  and the chained posture start nothing, and `/superdev:plan` starts nothing. A command typed on a live scope
  chains on from there. superdev starts no other session and asks no Start or Stop question.
  `/superdev:ship` is a separate command: it merges the pull request submit-pr
  opened, deploys the merge under the repository's deploy posture (`none`/`manual`/`auto`,
  `docs/agents/deployment.md`, ADR 0101), and closes no anchor (ADR 0106). After the pull request opens, an
  attended submit-pr asks one ship question that names the pull request and says nobody has reviewed it; its
  yes is the merge consent and starts ship. Submit-pr runs no test. Where `docs/agents/verification.md` names CI checks,
  it asks no ship question. CI has not reported when the pull request opens.
  Submit-pr prints `/superdev:ship` to run once the named checks are green (ADR 0255). Ship starts `/superdev:verify-ship` while a
  criterion is left to verify, and `/superdev:wrap-up` otherwise (ADR 0116); its repair and re-verify routes
  and every refusal print their command. `/superdev:verify-ship` settles the criteria only a deployed system
  can show. When every line settles, no line waits for a hand-sync, and it read the anchor's lines, it starts
  `/superdev:wrap-up` through the Skill tool in the same turn, and wrap-up's last message carries the chain's
  one Next block and staged-pages lines (ADR 0224). `/superdev:wrap-up` closes the triage records the anchor's
  Absorbs line names, then the scope anchor, and takes the run down. No skill carries
  `disable-model-invocation: true`. Ship, verify-ship, and wrap-up start only when the operator typed the
  command, asked for it, another session's brief asked for it, or the command before them started it: ship on
  the yes to submit-pr's ship question, verify-ship and wrap-up on ship's routes, and wrap-up at verify-ship's
  settled exit. Ship started from another session's brief asks the operator one yes first, because a brief is
  never merge consent (ADR 0253). Ship refuses `--unattended` (INV-0093). A criterion verify-ship observes false routes to `/superdev:plan`'s
  repair choice, which plans a `fix` feature on its own anchor, linked to the original by a `**Repairs:**`
  line (ADR 0124).
  The doc pass also rewrites the comment text of the non-Markdown files the scope's range changes, never a code
  token, and names a stale comment outside the range unedited (ADR 0258).
  `/superdev:document` and `/superdev:setup` run no test command, and a green suite record carries across Markdown-only commits with no run. ADR 0189 and INV-0175 state this rule, and the `doc-setup-no-test-run` drift check holds it.
  Every worktree superdev creates or reuses for a test run runs the repository's **Prepare command** through
  `scope.js prepare` before its first test run: the scopetree at implement and review start, each slicetree, and a
  recreated scopetree (`references/scope-branch.md`'s `## Preparing a worktree`). `scope.js fail-to-pass` prepares its
  own worktree before each run. `docs/agents/verification.md`'s `## Prepare command` section states the command, `none`,
  or nothing (`references/test-selection.md`'s `## Prepare command`, ADR 0218).
  `/superdev:ship` takes the scope's full-suite evidence on the head it merges.
  Where `docs/agents/verification.md`'s `## CI` section names checks, the evidence is every named CI check green.
  Otherwise it is ship's own local run of the full or whole-repo command.
  Nothing waits on CI. A check not yet green makes ship refuse, and the operator runs it again (ADR 0255).
  Implement, run handoff, review, and submit-pr run no full suite.
  A scope review reads a red local suite record as a Critical finding at entry (ADR 0255).
  It reads a failed named check the same way, only on a pull-request head that is the tip or an ancestor of it.
  Either finding stays closed where a later passing run on a clean tree on the tip's ancestry covers it
  (`references/review-scope-mode.md`'s `### 4.2 Red evidence` states which runs cover it).
  On the local path ship runs the suite once, on the merged tip where base will move and on the tip otherwise. INV-0128 and INV-0191 state this rule, and the `implement-no-full-run`,
  `scope-review-no-full-run`, and `no-ci-wait` drift checks hold it.
  Whoever invokes a chain command passes `--unattended` to run it unattended (ADR 0016, ADR 0108);
  superdev ships no driver. One unattended implement runs through submit-pr: each start carries
  `--unattended`, and submit-pr asks no ship question. Some skills sit outside the chain: publish-kb sends a scope's
  staged knowledge-base pages to a remote backend on the operator's own clock (ADR 0023), status prints
  every run's ledger and then surveys the slice store read-only, grouping every open scope anchor, intent record (an `intent` row, ADR 0199), triage record (an `absorbed`
  row when an open anchor's Absorbs line names it, ADR 0144, and a `needs planning` row otherwise, ADR 0198),
  stranded run root, and untriaged item by the action it needs (an open anchor whose run only its
  run-state snapshot shows takes an `elsewhere` row, ADR 0164),
  resolving an ambiguity toward showing the row (ADR 0049), and never recommending a run live in another session — a standing
  step and a run lock under an hour old (ADR 0163),
  review-tests runs two audits on every run and hands the findings the operator keeps to `/superdev:plan`
  as an intent record: a cost audit, sweeping the whole test tree in one `test-auditor` dispatch and measuring it
  through the repo's optional timing command (ADR 0066), and a gap audit, reading the source set
  `scope.js source-set` prints in directory batches, one `test-gap-auditor` dispatch each, in parallel,
  with the `## Test gaps` lens of `references/test-gaps.md` that only that agent reads (ADR 0162,
  INV-0163), and sweep chains `/superdev:review`,
  `/superdev:document audit`, `/superdev:review-tests`, and `/superdev:setup check` over a whole
  repository into one merged, ranked report and a single plan-ready intent record, every leg dispatched
  read-only in the chained posture (ADR 0068). brainstorm, sweep, and review-tests hand a ready intent to
  the slice store as an **intent record** by `references/intent-handoff.md`, and keep a local
  `.superdev/brainstorm/` file only where the record cannot be written whole. `/superdev:plan` offers the
  open records on any checkout and closes the one it planned from, or keeps it open with a comment naming
  what it planned (ADR 0199, INV-0178).
- `plugin/hooks/`. Claude Code hooks, the plugin's deterministic guardrails. Governed by **Working
  rules, Hooks are CommonJS** and **Every shipped executable has a suite in `tests/`, named for it**.
  This is the strongest future child-doc candidate, if its rules outgrow this root. Of the
  hooks, `scope-prune.js`, `slicetree-sweep.js`, `run-trace.js`, and `tree-guard.js` depend on modules in `plugin/lib/`,
  and the scripts require them as well. No hook and no script requires `scope.js`. `scope-prune.js` and `slicetree-sweep.js` both
  `require` `../lib/ledger.js` for their ledger-header reader (ADR 0022) and `../lib/git-spawn.js` for the git calls the two Stop hooks
  share (the spawn, the throwing call, and the `git branch` list parse; a module missing any of them reads as unloaded). `run-trace.js` takes each of
  `../lib/trace-log.js`, `run-tree.js`, and `dispatch.js` through a `require` of its own (ADR 0117, INV-0159).
  `scope-prune.js` takes the containment probe `baseHistoryHasPatch` and the third tier `baseCommitHoldsBranch` off `../lib/containment.js` through a `require` of its own (ADR 0082, ADR 0248). `tree-guard.js`, `scope-prune.js`, and `slicetree-sweep.js` each require
  `../lib/main-work-tree.js` for the main-working-tree resolver `mainWorkTree`. The two Stop hooks run every git call in the main working tree. A session standing in a scopetree therefore reads the main tree's `HEAD`. `slicetree-sweep.js` skips the slicetree the session stands in. With no resolver, both hooks sweep and prune nothing. `scope-prune.js` also removes an empty `.superdev/kb-pending/<scope>/` directory whose run root is gone (INV-0076, INV-0122). `tree-guard.js` denies a dispatched implementer's Edit, Write, or
  NotebookEdit into a checkout of a repository that holds a run, outside its main working tree's `.superdev/`.
  It also denies such a write into that repository's git directory. That covers the main `.git/`, a linked
  worktree's gitdir, and a submodule's gitdir (ADR 0148, INV-0152). It fails open: when `main-work-tree.js`
  cannot load, or git cannot place the target, the write passes. `slicetree-sweep.js`
  tests a worked slice branch's tip against its scope branch's first-parent chain, alongside the
  default-branch content check (ADR 0089). A `require` failure leaves the hook
  with no fallback reader: it sweeps, prunes, records, or denies nothing and says nothing. The probe has its own, narrower
  fallback: when `containment.js` cannot load or carries no probe, `scope-prune.js` prunes by tree comparison alone, still silently. `merge-guard.js` is the one Bash hook that denies, and it
  requires no module: it checks the raw text of a subagent's Bash call for a lead word (`git`, `gh`, `tea`, `scope.js`)
  followed by an integration verb (ADR 0227). `run-trace.js` reads no Bash command and records a file edit from a file-tool
  event only. On PreToolUse(Agent) it also denies a dispatch to one of superdev's own agents that sets no explicit
  `model`, exit 2 with the reason on stderr. That check requires no module, so it denies even where a module fails to
  load, and the dispatch is still recorded (ADR 0245). Nothing refuses a write to a run's ledger or trace, and nothing refuses an implementer's full-suite run:
  `scope.js` detects an outside edit of a run's ledger or trace after the fact (`lib/run-check.js`), and a review grades
  an untraced write and a full-suite run (`scope.js untraced`, `scope.js trace --kind run`).
- `scripts/` and `plugin/scripts/`. Owned by [`scripts/AGENTS.md`](scripts/AGENTS.md), which states
  each script's contract: the shipped `plugin/scripts/` CLIs `scope.js`, `kb-patch.js`, `publish-kb.js`,
  the modules in `plugin/lib/` behind them, and the maintainer-only `scripts/drift-check.js` with
  `drift/`, `scripts/invariant-check.js`, and `scripts/run-tests.js`. It names the `scope.js` exports
  and every verb, and the module each script takes from `plugin/lib/`.
- `plugin/references/`. Backend seed templates plus the runtime references. Owned by
  [`plugin/references/AGENTS.md`](plugin/references/AGENTS.md), which routes every reference to what it
  owns and to the runtime surface that reads it. Each reference's own opening states its full contract.
- `docs/adr/`. Architecture decision records. `docs/agents/`. This repo's own dogfooded backend config.
  `docs/known-issues.md`. The platform workarounds, governed by **Working rules, Platform-dependent
  claims carry dated verification**.
- `.claude-plugin/`. Manifests. Governed by **Working rules, Version lives only in `plugin.json`**.
- `.claude/`. `CLAUDE.md` pulls this document into a session opened here. Installing the plugin is a
  **user-scope** action, so no tracked file in this repo can do it. Claude Code declines a network
  marketplace declared at project scope, which keeps a clone from enabling a plugin nobody asked for.
  Dogfooding is therefore an operator step, and [`README.md`](README.md) → *Install* carries it. Run it
  against the **git URL of this repo**. The marketplace source pins the release tag (ADR 0131), so the
  install runs the latest release, the artifact an adopter installs. A checkout loaded with
  `claude --plugin-dir ./plugin` runs its working tree instead, so a half-edited guardrail hook fires on
  the very run editing it. Personal overrides belong in the gitignored `.claude/settings.local.json`.
- `mods/superdev-view/`. A maintainer-only Claude Code mod, a hooks module (`hooks/register.tsx`) that
  draws a pane of the main working tree's `.superdev/` folder. Owned by
  [`mods/superdev-view/AGENTS.md`](mods/superdev-view/AGENTS.md), which states what the pane reads and
  draws, how to install the mod, and how its tests run.
  Nothing under `plugin/` requires it, and the root marketplace does not list it, so no adopter install
  carries it.

  The mod's fixture files are `mods/superdev-view/hooks/trace-fixtures.ts`,
  `mods/superdev-view/hooks/ledger-fixtures.ts`, and `mods/superdev-view/hooks/dod-fixtures.ts`. A bare `hooks/`
  path in this paragraph is under `mods/superdev-view/`. `tests/run-trace-dispatch.test.js` reads
  `hooks/trace-fixtures.ts`, `tests/scope-ledger.test.js` reads `hooks/ledger-fixtures.ts`, and
  `tests/scope-dod-line.test.js` reads `hooks/dod-fixtures.ts`. `hooks/parse.ts` reads the ledger, the run trace,
  and the Definition-of-Done lines that `scope.js` writes, and one pin holds each coupling. The ledger pin in
  `tests/scope-ledger.test.js` asserts that `scope.js` writes the lines in `hooks/ledger-fixtures.ts`. The trace
  pin in `tests/run-trace-dispatch.test.js` asserts that `plugin/hooks/run-trace.js` writes the lines in
  `hooks/trace-fixtures.ts`. The DoD line pin in `tests/scope-dod-line.test.js` asserts that `scope.js dod-line`
  writes the lines in `hooks/dod-fixtures.ts`, one per verdict, tagged and untagged (INV-0190).
  `hooks/parse.test.ts` parses each fixture file. A change to the ledger, trace, or DoD line layout fails one of
  these suites, so the change must update `hooks/parse.ts` and the fixture file together.
- `CONTEXT.md`. The domain glossary.
