---
name: setup
description: Configure this repo for superdev: slice store, code host, documentation convention, knowledge base, toolchain, and test command. Run once; /superdev:plan and /superdev:implement auto-invoke it if config is missing.
argument-hint: "[check | (empty = full interview)]"
---

# superdev setup

Write the per-repo config docs the superdev skills read, so the workflow is backend-agnostic:

- `docs/agents/issue-tracker.md` — the **slice store** (where slices live + how to CRUD them)
- `docs/agents/code-management.md` — the **code host** (push + open PR/MR + default posture)
- `docs/agents/documentation.md` — the in-repo **documentation** convention
- `docs/agents/knowledge-base.md` — the optional **knowledge base** (software / local file / none)
- `docs/agents/toolchain.md` — the detected **toolchain** profile (package manager + build/lint/format/
  release commands + style pointers), one section per workspace
- `docs/agents/verification.md` — the optional **test commands**: a full one plus an optional focused
  one, which arm the merge green-gate hook, and an optional **timing command**, which a test audit reads

Plus one file that is **not** a config doc, because what it holds belongs to a person rather than to the
repository:

- `.superdev/info.json` — the **operator configuration** (`CONTEXT.md`), holding the slice store's
  assignee under the `issue-tracker` role key. Git-ignored, so it stays out of a repository other people
  maintain (ADR 0073).

This is prompt-driven, not a script. **Explore, propose defaults, confirm one decision at a time, then
write.** Seed templates live in `${CLAUDE_PLUGIN_ROOT}/references/`.

## 0. Check mode (`check`)

`$ARGUMENTS` carrying the literal word `check` runs a **read-only drift check** instead of the
interview below — it writes no file, makes no slice-store call, and starts no interview. Skip §1-§4
entirely. Any other `$ARGUMENTS`, including none, runs the full interview unchanged: the operator names
the mode, the command sniffs nothing (ADR 0068).

Report one of three verdicts for each config document this skill owns —
`issue-tracker.md`, `code-management.md`, `documentation.md`, `knowledge-base.md`, `toolchain.md`,
`verification.md` — under `docs/agents/`:

- **Absent.** The file does not exist. A repo that never ran `/superdev:setup` reports all of them this
  way, and that is not a failure — it starts no interview either.
- **Present, consistent.** The file exists and every fact it records still holds against the repo.
- **Present, drifted.** The file exists and names a fact the repo no longer supports. State the fact
  and what the repo shows instead of it, never just "drift found."

Check each present document's own facts against the repo, never against a remote call — the slice
store and code host stay unqueried:

- `verification.md`, `toolchain.md` — every command named (the full and focused test commands, the
  timing command, each toolchain entry) still resolves: a package-manager script is still declared in
  the manifest (`package.json`, `pyproject.toml`, a `Makefile` target, …), and a bare executable is
  still reachable. A command the document names that the manifest no longer defines is drift.
- `issue-tracker.md`, `code-management.md` — a recorded host/owner/repo (or base URL) still matches
  `git remote -v`. Compare the **host/owner/repo path alone** — a remote of the form
  `https://user:TOKEN@host/owner/repo.git` carries userinfo that plays no part in the comparison — and
  report the remote with any userinfo stripped, never verbatim: a caller (`/superdev:sweep`'s config leg
  among them) can write this verdict into a report or an intent file, and a token belongs in an env var,
  never in one. A document naming no such fact (the local-file store, an "Other" backend written as
  prose) has nothing to check here, and reports consistent once confirmed present.
- `documentation.md` — a `## Writing standard` naming a repo-relative path still resolves to a file,
  and each `## Audit set` glob still matches at least one file.
- `knowledge-base.md` — a local `docs/kb/` path still exists. A software backend records no local fact
  this check can reach, and reports consistent once confirmed present.

Report the verdicts and stop.

## 1. Explore

- `git remote -v` and `.git/config` — GitHub? GitLab? a self-hosted host (Forgejo/Gitea)?
- `docs/agents/` — prior superdev config? (If so, offer to update, not duplicate.)
- `CLAUDE.md` / `AGENTS.md` at root — which exists? Is there already an `## Agent skills` section? Is an
  `AGENTS.md` hierarchy present (child `AGENTS.md` files in subdirs)?
- `docs/plans/` — sign the local-file store is already in use.
- **Toolchain** — scan for the repo's build/tooling, feeding decision **F**:
  - **build/package manifests** → the package manager + its scripts: `package.json` (+ lockfile /
    `packageManager` field → npm/pnpm/yarn/bun), `*.sln`/`*.csproj`/`nuget.config`, `pom.xml`,
    `build.gradle(.kts)` (+ `gradlew`/`mvnw` wrappers), `pyproject.toml`/`poetry.lock`/`uv.lock`,
    `Cargo.toml`, `go.mod`, a `Makefile`, …
  - **formatter/linter configs**: `.editorconfig`, `.prettierrc*`, `.eslintrc*`, `rustfmt.toml`,
    `.clang-format`, `.rubocop.yml`, …
  - **style-prose docs**: `CONTRIBUTING`, `CODING.md`, `STYLE.md`, and any coding-guideline section in
    `CLAUDE.md`/`AGENTS.md`.
  - **Monorepo?** several package roots / languages side by side → note each as its own workspace.

## 2. Decide (one at a time)

Assume the user may not know these terms. Each decision: a one-line explainer, the choices, and a
proposed default inferred from the remote — cross-exam.md's recommended-answer rule applied to a config
choice, so never present the choices bare. Using `AskUserQuestion`? Mark the default `(Recommended)`.

**A — Slice store.** Where do slices/plans live?

- **Local files** — a directory per feature, `docs/plans/<type>/<feature-slug>/` (`00-epic-*` = DoD +
  scope, `NN-<test-applicability>-*` = one file per slice, the number is the id). Good for solo work or
  no remote. Seed: `references/issue-tracker-local.md`.
- **GitHub Issues** — slices as GitHub issues. Seed: `references/issue-tracker-github.md`. Ask for
  owner/repo, the feature label, and the **env-var name** for the API token (never the secret).
- **Forgejo / Codeberg Issues** — slices as issues on a Forgejo or Gitea instance (Codeberg included).
  Seed: `references/issue-tracker-forgejo.md`. Detection hint: a `codeberg.org` or self-hosted
  Forgejo/Gitea remote. Ask for host/owner/repo, the feature label, and the **env-var name** for the API
  token (never the secret).
- **Jira** — slices as Jira issues. Seed: `references/issue-tracker-jira.md`. Ask for base URL, project
  key, issue type, the "is blocked by" link type, the ready status/label, and the **env-var names** for
  the API token + email (never the secrets).
- **Other** (GitLab Issues, Linear, …) — ask the user to describe create/read/list/update + the
  dependency-link mechanism in a paragraph; write `issue-tracker.md` from that prose.

> **Trust boundary.** `/superdev:implement` loads slice specifications from this store and an implementer
> executes them as build instructions. A store writable by anyone but the trusted planner is arbitrary
> code execution by an autonomous agent — keep write access to the tracker (or the feature label)
> restricted to trusted authors, and only run `/superdev:implement` on slices the run owner authored or
> approved.

For an **issue backend whose statuses the seed doesn't already fix** (Jira / other — not the local file,
and not GitHub Issues or Forgejo, whose seeds each map the lifecycle onto open/closed + labels), also capture the
tracker's **status workflow**: probe or ask for the available statuses, the transitions, and the issue
types for the scope anchor vs a slice. Agree a **status map** — superdev's canonical lifecycle (`todo` →
`in-progress` → `in-review` → `merged`/done, plus `blocked`) → the tracker's real statuses, with how to
perform each move (transition name/id or CLI verb). Record it in `issue-tracker.md`;
`/superdev:implement` walks each issue along it. If the tracker lacks a state (no separate `in-review` or
`blocked`), map it to the nearest sensible status and note the collapse.

Also capture **how a ticket is released** for any issue backend, recorded as a `## Release` section in
`issue-tracker.md` (`plan-contract.md` → *Release*). A tracker usually holds a backlog of tickets written
but not yet agreed, so ask: **what marks a ticket ready for work here?** A label (`released`,
`ready-for-work`), a status, a board column. Two properties make an answer usable, and both are worth
stating back to the user:

- It sits on the **scope anchor** — the epic, or a single-slice feature's lone issue — since one release
  covers the whole feature.
- It **survives the lifecycle moves** `/superdev:implement` makes. The status map's own `ready` label is
  swapped to `in-progress` on dispatch, so it cannot double as the release signal: a separate label can,
  and is the default worth proposing.

Record the signal plus the calls that **apply** it (what `/superdev:plan` fires on a release) and **read**
it (what `/superdev:implement` and `/superdev:afk` check). A team that agrees plans elsewhere and wants
every plan live on creation is a valid answer too — write that, and `/superdev:plan` stops asking.

Also capture the **assignee** for any issue backend — the account every issue `/superdev:plan` creates is
assigned to (`plan-contract.md` → *Assignee*). Propose the **API token's own identity** as the default:
resolve it from the backend's whoami endpoint (`GET /api/v1/user` on Forgejo/Gitea, `GET /user` on GitHub,
`GET /rest/api/3/myself` on Jira) and offer that login or `accountId`. Accept a different account — the
case that matters when a shared or bot token files the issues — provided it can actually be assigned there
(a repo collaborator, an assignable project user), since an unassignable one fails. Or `none`, to create
the issues unassigned. The local-file store has no assignee: don't ask.

**Write the answer to `.superdev/info.json`, never to `issue-tracker.md`** (ADR 0073). The identifier
belongs to the person running superdev, and `issue-tracker.md` is tracked, so a repository maintained by
several people would carry one maintainer's account in its history and file everyone's issues against it.
`.superdev/` is git-ignored, which makes the file untracked by construction:

```json
{
  "issue-tracker": { "assignee": "<the answer, or \"none\">" }
}
```

- **Merge into an existing file**, setting `issue-tracker.assignee` alone, so another role's key survives.
- **Ensure `.superdev/` is in `.gitignore`**, adding it when absent.
- **Say the path you wrote and that the file is untracked**, so an operator who went looking in
  `docs/agents/` knows why it is not there, and knows a teammate inherits nothing from this answer.
- **Declining leaves no file.** An absent file resolves to the token's own identity anyway, so every
  issue-backed repo gets owned issues with nothing configured.

**B — Code host.** Where does code live / where do PRs go? (Independent of A — code may be on GitHub
while slices live in Jira.)

- **GitHub** (`gh`). Seed: `references/code-management-github.md`.
- **Forgejo / self-hosted** (`tea` or REST). Seed: `references/code-management-forgejo.md`. Ask base URL,
  owner/repo, and the **env-var name** for the token.
- **Other** (GitLab, …) — describe push + open-MR + base computation in a paragraph.

For both hosts, confirm the **default PR posture** (`draft` recommended | `ready` | `push-only`) and the
**base branch** (default `main`).

**C — Documentation (in-repo).** How does the project keep durable in-repo technical docs? The default
convention is an **`AGENTS.md` hierarchy** (walk before editing; update the affected `AGENTS.md` after
meaningful changes; keep concise/current). Seed: `references/documentation.md`. Keep it unless the user
has a different convention (then capture theirs as prose).

Then ask about the **writing standard** — the prose style the doc agents apply when they write (ADR
0012):

- **`controlled`** (recommended): the language-neutral rule set shipped with the plugin
  (`references/controlled-prose.md`) — active voice, a sentence-length cap, one name for one thing, no
  hedging or marketing adjectives, in whatever language the project's docs use.
- **A repo-relative path**: the project's own editorial style guide. The agents read it.
- **`none`**: no standard.

Record the answer as the `## Writing standard` section of `docs/agents/documentation.md`. On
`controlled`, point the user at that file's *Declare per language* section: spelling convention, compound
formation, and number format are the repo's to answer, and answering them later means two writers have
already disagreed.

Then ask which **documentation sits outside the default tree**. `/superdev:document audit` reads the
`AGENTS.md` hierarchy, `README.md`, `CONTEXT.md`, and the local knowledge-base pages on its own; anything
else is named here. Scan the repo for directories holding markdown that tree does not reach and **offer
what you found**, so the user edits a list instead of writing one. Record it as the `## Audit set`
section of `docs/agents/documentation.md`, one repo-relative glob per bullet. **Nothing outside the
default tree** → write no section: audit mode already states what it does when the section is absent.

**D — Knowledge base (optional).** Is there a **knowledge base** for durable, reader-facing docs (feature
specifications, design overviews, ADR summaries)? Ask the user which of:

- **Knowledge base software available** — e.g. **Confluence**. Seed:
  `references/knowledge-base-confluence.md`. Ask base URL, space key, what to publish, optional parent
  page, and the **env-var names** for the API token + email (never the secrets). For a different wiki
  ("other"), capture the same **backend command contract** (below) that every remote backend declares —
  a backend declaring no `delete` template leaves every `action: delete` staged page unpublishable, and
  one declaring no `read` template blocks the aggregate question below. Also record that
  `/superdev:publish-kb` is the only caller of this backend and that `/superdev:plan`/`/superdev:document`
  stage its pages instead of sending them (ADR 0023) — the `## Staging` section the seeded templates carry.
- **Local file storage** — markdown under `docs/kb/`. Seed: `references/knowledge-base-local.md`.
- **None** — no separate KB; the in-repo docs are the only record.

If a KB (software or local) is chosen, it is **human-consumption first, agents second** — shape it around
its readers. Ask two more things, then propose a structure:

1. **Audience** (multi-select) — who reads it? e.g. end-users, internal developers, ops/support,
   stakeholders. Record the list.
2. **Language** — the single natural language KB prose is written in (e.g. English, German). Code and
   in-repo docs stay as they are; only KB content uses this language.

Then **do a quick repo scan** (README, top-level structure) and **propose an audience-shaped outline** —
a top-level section per audience with a few candidate topic headings under each (e.g. *User Guide →
Getting started, FAQ*; *Developer Docs → Architecture, Setup, ADR summaries*). Present it, **discuss and
adjust with the user**, and record the agreed outline in `knowledge-base.md`. It's a living skeleton —
`/superdev:plan` and `/superdev:document` fill and extend it, not reinvent it.

For a **remote** backend, also capture its **backend command contract** (ADR 0069): the shell command
each of `find`, `read`, `create`, `update`, and `delete` runs against it. Ask for each verb's command in
turn and write it under a `## Commands` section of `knowledge-base.md`, one `### <verb>` subsection each
holding a single fenced `sh` block — a verb the backend has no use for is simply an absent subsection.
State every placeholder name to the user, so a template reaches for the placeholder instead of shell
interpolation: `SUPERDEV_KB_TITLE` reaches every call, `SUPERDEV_KB_BODY_FILE` (a path to the staged
body, never the body inline) reaches `create` and `update`, and one `SUPERDEV_KB_<KEY>` per key the
`find` template's JSON object carries — uppercased — reaches `update` and `delete`. `find` carries the
contract the other four rest on: exit `0` with a JSON object on stdout means the page exists, exit `3` means
the page is genuinely absent, anything else means the backend could not answer. **Probe the `find`
template before writing the section**: run it with `SUPERDEV_KB_TITLE` set to a title that cannot exist
(a random UUID works) and require exit `3` — this is what stands between the template and a duplicated or
overwritten page. Any other outcome — report it to the user, fix the template, probe again — leaves the
`## Commands` section unwritten. A **local** or **none** knowledge base is asked for no commands at all.

**On re-run**, when `knowledge-base.md` already carries a `## Commands` section: show the delta between
the newly captured templates and the existing ones, and keep the operator's own template for a verb
unless they choose to replace it — never rewrite a working command silently.

Then, for a **remote** backend, ask which of those pages **aggregate**: a page many scopes each
contribute one section to — an index, a changelog, an ADR-summaries digest — rather than a page one scope
owns end to end. **A documented read is a precondition of this question** (ADR 0027): before any entry can
carry the marker, the `## Commands` section above must hold a `### read` subsection — a backend declaring
none can carry no `(aggregate)` entry, because nothing can fetch a live body to merge into. The Confluence
seed declares no `read`, because its XHTML pages need no body read (below). Mark
each answer in the outline with `(aggregate)`, and pin the heading level its sections take (e.g.
`## <concept>`) — the writer reaches no backend and cannot see the live page's nesting, and a level left
unpinned lets a staged heading as shallow as the page's own title carry the whole page away when it
merges. A marked page is staged one section at a time (`action: patch`) and merged into the live page; an
unmarked one is replaced wholesale, which on an aggregate page drops every section written by a scope the
doc pass cannot see. A digest or index page in the proposed outline is the case to ask about by name.
**None aggregate** → mark nothing. A backend whose page bodies are not markdown (e.g. Confluence's XHTML
storage format) marks nothing either — `action: patch` merges by matching markdown headings and finds
none there. A **local `docs/kb/`** backend skips this question: its pages are repository files the doc
pass reads and edits directly, so it stages nothing.

**E — Verification (optional).** What single command runs the repo's test suite (e.g. `npm test`,
`pytest -q`, `cargo test`)? Recorded, it **arms the green-gate**: after every controller merge, a hook
re-runs it and blocks the run if the scope suite is RED — turning implement's "re-run the suite after
merging" from a prompt into a deterministic gate. The hook reads no execution tier; the `full` tier's
per-slice merges are simply where the implement loop meets it most. Detect a likely command (package.json
scripts, a Makefile `test` target, `pyproject.toml`) and propose it. No suite (e.g. a docs-only repo) →
skip; the gate stays inactive. (The **F** scan finds the same manifests — draw the proposal from it.)

**A repo with a full command settles the focused test command too**: the command every step inside the
implement loop runs, defined by costing less than the full suite. A repo without one runs its whole suite
on every RED→GREEN increment — hours per scope on a slow suite. `references/test-selection.md` owns the
full contract. Read it, **derive the focused command from the full one and the runner the §1 scan
detected, and write it on the user's confirmation.** **No suite at all** → skip this too; there is nothing
to derive it from. The derivation takes one of two branches:

- **A runner that maps source files to the tests covering them gets a `{paths}` form**, carrying that
  runner's pass-with-no-tests flag — `npx vitest related --passWithNoTests {paths}`, `npx jest
  --passWithNoTests --findRelatedTests {paths}`. The flag is what keeps a change set holding no tests
  green: the documentation step's range is its own prose commits, and a runner that fails on an empty
  collection reports that as RED.
- **A runner that maps nothing gets a `{paths}`-less form** — either a fixed fast subset, or a flag that
  detects the change set on its own. **Propose no `{paths}` form here**: such a runner is handed source
  paths it collects nothing from.
  - **A fixed fast subset** — the unit tests, with the slow integration tests left out (`pytest
    tests/unit`, `go test ./internal/...`, `cargo test --lib`). It always collects tests, so the
    empty-collection failure never arises.
  - **A self-detecting runner flag** (`vitest --changed`, `jest -o`) computes the change set itself,
    exactly as a `{paths}` form does, and collects nothing from an empty one. It carries that runner's own
    pass-with-no-tests flag for the same reason a `{paths}` form does: `npx vitest --changed
    --passWithNoTests`, `npx jest -o --passWithNoTests`.

**`none` is for two cases, and which one applied gets recorded.** The full suite is **already cheap**, so
a second command saves nothing worth the block — or **no cheaper subset exists** to name, because every
test in the suite is a slow one. **Ask what makes `none` right here, and record the reason** in
`verification.md` beside the single block, so the next reader learns which case applied. A runner that
maps nothing is not one of these cases: it takes the fast subset above.

**A repo with a full command settles the timing command too**: the command that reports what the tests
cost, which a **test audit** runs to rank its findings by measured duration (ADR 0066).
`references/test-selection.md` owns its contract — read it. **Derive the proposal from the
full command and the runner the §1 scan detected** (`vitest --reporter=verbose`, `pytest --durations=0`,
`go test -v ./...`, or the full command alone where the runner times only the whole suite), and write the
section on the user's confirmation. **A runner that reports no durations at all** records no section, and
setup already knows the reason is the runner: state it and record it as prose. **A user who declines**
records the same, and here **ask what makes that the right answer here, and record the reason** — a suite
that finishes in seconds is one, because a ranked cost table over noise orders nothing. **No suite at
all** → skip this too.

**F — Toolchain (optional).** From §1's scan, propose the repo's toolchain profile — the package manager
and the build/lint/format/release commands agents should use, plus pointers to the linter/formatter
configs and style-prose docs. Record **pointers, not copied rules**; the config files stay the source of
truth. Discipline:

- **Describe each command by intent, not just its name.** Infer the conventional ones (`test` → unit
  tests, `test:integration` → integration tests, `lint`, `format`, `build`, a `release`/publish script).
- **Ask when a component's purpose is unclear.** A script/task/binary whose intent you can't infer (a
  cutely-named `make-it-so` script, an opaque MSBuild target, an unknown `compiler.exe` in `./bin`) → ask
  "is this relevant, and if so what for?" and record the answer as its description. Don't guess.
- **Auto-note orphaned tooling.** A formatter/linter config **no command runs** (e.g. a `.prettierrc`
  with no `format` script and prettier not a dependency) → note it "not wired / not enforced." A
  coherence check only: never grade a tool's configuration, and don't prompt the user about it.
- **`test` defers to E.** The toolchain doc references `docs/agents/verification.md` rather than
  restating the command — verification.md stays the single source the green-gate reads.
- **Skip only when fully empty.** No manifest, no config, no style doc at all → write no `toolchain.md`.
  Any detection (even just a package manager) → write it. Partial ≠ empty.

## 3. Confirm, then write

Show the user a draft of every file (and the `## Agent skills` block) and let them edit before
writing.

Write:

- `docs/agents/issue-tracker.md` — start from the chosen seed, fill in the specifics. For "other", write
  from the user's prose.
- `docs/agents/code-management.md` — same, from the chosen host seed.
- `docs/agents/documentation.md` — from `references/documentation.md` (or the user's convention as
  prose). Always carries the **`## Writing standard`** section with decision **C**'s answer, including
  when the answer is `none`. It carries the **`## Audit set`** section only when decision **C** named
  documentation outside the default tree.
- `docs/agents/knowledge-base.md` — from the chosen KB seed (`knowledge-base-confluence.md` /
  `knowledge-base-local.md`) filled in, or the "other" prose. For **None**, write a one-line
  `knowledge-base.md` stating there is no separate KB (or skip the file). A **remote** backend also
  carries the `## Commands` section decision **D** captured, written only once the `find` probe passed.
  **On re-run**, when that section already exists, show the delta against the newly captured templates
  and write only the verbs the operator chose to replace.
- `docs/agents/toolchain.md` — the detected profile (decision **F**), freeform markdown, **one section
  per workspace** (a single section for a non-monorepo). Each command is an intent phrase + its
  invocation; `test` points at `docs/agents/verification.md`; orphaned tooling is noted; unclear
  components carry the user's confirmed description. Omit absent categories. Skip the file when the repo
  is fully empty of toolchain. **On re-run** (the file exists): re-scan and reconcile — add newly-found
  elements, update changed ones, drop removed ones — but **keep the human-authored descriptions** of
  components that still exist, re-ask only about *newly*-unclear ones, and show the delta before writing.
  Shape:

  ````markdown
  # Toolchain

  ## `.` — TypeScript / Node
  - Package manager: pnpm (lockfile `pnpm-lock.yaml`)
  - Commands:
    - Tests — see docs/agents/verification.md  (the green-gate command — not restated here)
    - Integration tests — `pnpm test:integration`
    - Lint — `pnpm lint`  (eslint · `.eslintrc.json`)
    - Format — `pnpm format`  (prettier · `.prettierrc`)
    - `make-it-so` — tags and publishes a release  (purpose confirmed with user)
  - Not wired: `.editorconfig` present but no command applies it — formatting not enforced
  - Style prose: `CONTRIBUTING.md §Style`
  ````
- `docs/agents/verification.md` — the full test command as the first fenced block. Skip the file entirely
  if there's no suite. Add the focused command decision **E** derived, as a second fenced block.
  **No focused command** — the suite is already cheap, or no cheaper subset exists — writes the first
  block plus the one-line reason **E** recorded for which case applied, **as prose outside the
  fence, never fenced itself** — `hooks/green-gate.js` takes a fenced block by index, so a reason fenced
  by mistake becomes the "focused" command the hook runs after every merge. Example, with a focused
  command configured:

  ````markdown
  # Verification

  ```sh
  npm test
  ```

  ```sh
  npx vitest related --passWithNoTests {paths}
  ```
  ````

  Example, single block, the reason recorded as prose beside it (this repo's own
  `docs/agents/verification.md` is exactly this shape):

  ````markdown
  # Verification

  ```sh
  npm test
  ```

  **No focused test command, deliberately.** This suite finishes in seconds, so a cheaper command saves
  nothing worth the second block, and every caller runs the full command
  (`references/test-selection.md`, ADR 0025, ADR 0074).
  ````

  Add the **`## Timing command`** section decision **E** settled, its command in a **backtick span,
  never a fenced block** — a fence lands in the focused slot wherever no focused command is configured,
  and the merge gate then runs it as its suite. **No timing command** — whether the runner reports no
  durations or the user declined — writes the one-line reason **E** recorded, as prose, in place of the
  section. Example, with one configured:

  ````markdown
  ## Timing command

  `npx vitest run --reporter=verbose`
  ````
- Add an `## Agent skills` block to whichever of `CLAUDE.md` / `AGENTS.md` already exists (edit that one;
  never create the other; never duplicate an existing block):

```markdown
## Agent skills

### Slice store
[one-line summary]. See `docs/agents/issue-tracker.md`.

### Code host
[one-line summary, incl. default PR posture]. See `docs/agents/code-management.md`.

### Documentation
[one-line summary — in-repo docs or the project's convention]. See `docs/agents/documentation.md`.

### Knowledge base
[one-line summary — software / local file / none]. See `docs/agents/knowledge-base.md`.

### Toolchain
[one-line summary — package manager + key commands, or "none detected"]. See `docs/agents/toolchain.md`.

### Verification
[the test commands, or "none"]. Arms the merge green-gate. See `docs/agents/verification.md`.
```

If neither `CLAUDE.md` nor `AGENTS.md` exists, ask the user which to create — don't pick for them.

## 4. Done

Tell the user setup is complete and that `/superdev:plan` and `/superdev:implement` now read these files.
They can edit `docs/agents/*.md` directly later; re-run this skill only to switch backends. Say that
`.superdev/info.json` is theirs alone and travels with no clone, so a fresh checkout configures it again
or falls back to the API token's own identity. Record only env-var **names** for secrets — never the token
values, and never in `.superdev/info.json` either, which holds identifiers only.

If §1 found **no `AGENTS.md` hierarchy**, point the user at **`/superdev:document`** — its bootstrap mode
seeds the initial hierarchy + glossary from the existing code, so per-feature `/superdev:plan` doesn't
start blind.
