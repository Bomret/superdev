---
description: Configure this repo for superdev: slice store, code host, documentation convention, knowledge base, toolchain, and test command. Run once; /superdev:plan and /superdev:implement auto-invoke it if config is missing.
---

# superdev setup

Write the six per-repo config docs the superdev skills read, so the workflow is backend-agnostic:

- `docs/agents/issue-tracker.md` — the **slice store** (where slices live + how to CRUD them)
- `docs/agents/code-management.md` — the **code host** (push + open PR/MR + default posture)
- `docs/agents/documentation.md` — the in-repo **documentation** convention
- `docs/agents/knowledge-base.md` — the optional **knowledge base** (software / local file / none)
- `docs/agents/toolchain.md` — the detected **toolchain** profile (package manager + build/lint/format/
  release commands + style pointers), one section per workspace
- `docs/agents/verification.md` — the optional **test commands** (a full one, plus an optional focused
  one) that arm the merge green-gate hook

This is prompt-driven, not a script. **Explore, propose defaults, confirm one decision at a time, then
write.** Seed templates live in `${CLAUDE_PLUGIN_ROOT}/references/`.

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
assigned to, recorded as `Assignee` in `issue-tracker.md` (`plan-contract.md` → *Assignee*). Propose the
**API token's own identity** as the default: resolve it from the backend's whoami endpoint
(`GET /api/v1/user` on Forgejo/Gitea, `GET /user` on GitHub, `GET /rest/api/3/myself` on Jira) and offer
that login or `accountId`. Accept a different account — the case that matters when a shared or bot token
files the issues — provided it can actually be assigned there (a repo collaborator, an assignable project
user), since an unassignable one fails. Or `none`, to create the issues unassigned. An omitted line
behaves as the default. The local-file store has no assignee: don't ask.

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
  page, and the **env-var names** for the API token + email (never the secrets). For a different wiki,
  capture its publish/find/update/**read**/**removal** commands as prose ("other") — a config with no
  removal convention leaves every `action: delete` staged page unpublishable, and one with no documented
  read blocks the aggregate question below. Also record that `/superdev:publish-kb` is the only caller of
  this backend and that `/superdev:plan`/`/superdev:document` stage its pages instead of sending them
  (ADR 0023) — the `## Staging` section the seeded templates carry.
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

Then, for a **remote** backend, ask which of those pages **aggregate**: a page many scopes each
contribute one section to — an index, a changelog, an ADR-summaries digest — rather than a page one scope
owns end to end. **A documented read is a precondition of this question** (ADR 0027): before any entry can
carry the marker, the config document you are writing must name a call returning a page body and how to
reach its identifier from a staged `title`. The Confluence seed names none, because its XHTML pages need
no body read (below); a bespoke backend needs one captured in the read verb you asked for above. Mark
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

Then ask about the **focused test command** (optional): a command that scopes a run to a set of changed
paths (e.g. `vitest related {paths}`, `pytest {paths}`, or a runner flag that detects the change set on
its own, like `vitest --changed`). `references/test-selection.md` owns the full contract — read it, then
propose a command derived from the full one where the repo's runner supports narrowing. `none` → record
no such command; the run then always falls back to the full command, which is the configuration this
repository keeps.

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

Show the user a draft of all six files (and the `## Agent skills` block) and let them edit before
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
  `knowledge-base.md` stating there is no separate KB (or skip the file).
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
  if there's no suite. Add the focused command, where decision **E** answered one, as a second fenced
  block; `none` writes only the first. Example, with a focused command configured:

  ````markdown
  # Verification

  ```sh
  npm test
  ```

  ```sh
  npx vitest related {paths}
  ```
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
They can edit `docs/agents/*.md` directly later; re-run this skill only to switch backends. Record only
env-var **names** for secrets — never the token values.

If §1 found **no `AGENTS.md` hierarchy**, point the user at **`/superdev:document`** — its bootstrap mode
seeds the initial hierarchy + glossary from the existing code, so per-feature `/superdev:plan` doesn't
start blind.
