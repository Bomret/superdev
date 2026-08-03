---
description: Configure this repo for superdev — slice store, code host, documentation convention, optional knowledge base, detected toolchain profile, and the green-gate test command — written to docs/agents/*.md. Run once; /superdev:plan and /superdev:implement auto-invoke it if config is missing.
---

# superdev setup

Write the six per-repo config docs the superdev skills read, so the workflow is backend-agnostic:

- `docs/agents/issue-tracker.md` — the **slice store** (where slices live + how to CRUD them)
- `docs/agents/code-management.md` — the **code host** (push + open PR/MR + default posture)
- `docs/agents/documentation.md` — the in-repo **documentation** convention
- `docs/agents/knowledge-base.md` — the optional **knowledge base** (software / local file / none)
- `docs/agents/toolchain.md` — the detected **toolchain** profile (package manager + build/lint/format/
  release commands + style pointers), one section per workspace
- `docs/agents/verification.md` — the optional **test command** that arms the merge green-gate hook

This is prompt-driven, not a script. **Explore, propose defaults, confirm one decision at a time, then
write.** Seed templates live in `${CLAUDE_PLUGIN_ROOT}/references/`.

## 1. Explore

- `git remote -v` and `.git/config` — GitHub? GitLab? a self-hosted host (Forgejo/Gitea)?
- `docs/agents/` — does prior superdev config already exist? (If so, offer to update, not duplicate.)
- `CLAUDE.md` / `AGENTS.md` at root — which exists? Is there already an `## Agent skills` section? Is a
  `AGENTS.md` documentation hierarchy already present (child `AGENTS.md` files in subdirs)?
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
proposed default (inferred from the remote) — cross-exam.md's recommended-answer rule applied to a config
choice: never present the choices bare. Using `AskUserQuestion`? Mark the proposed default
`(Recommended)`.

**A — Slice store.** Where do slices/plans live?

- **Local files** — a directory per feature, `docs/plans/<type>/<feature-slug>/` (`00-epic-*` = DoD + scope,
  `NN-<test-applicability>-*` = one file per slice, the number is the id). Great for solo work or no
  remote. Seed: `references/issue-tracker-local.md`.
- **GitHub Issues** — slices as GitHub issues. Seed: `references/issue-tracker-github.md`. Ask for
  owner/repo, the feature label, and the **env-var name** for the API token (never the secret).
- **Jira** — slices as Jira issues. Seed: `references/issue-tracker-jira.md`. Ask for base URL,
  project key, issue type, the "is blocked by" link type, the ready status/label, and the **env-var
  names** for the API token + email (never the secrets).
- **Other** (GitLab Issues, Linear, …) — ask the user to describe create/read/list/update +
  the dependency-link mechanism in a paragraph; write `issue-tracker.md` from that prose.

> **Trust boundary.** `/implement` loads slice specifications from this store and an implementer executes them as
> build instructions. A store writable by anyone but the trusted planner is arbitrary code execution by
> an autonomous agent — keep write access to the tracker (or the feature label) restricted to trusted
> authors, and only run `/implement` on slices the run owner authored or approved.

For an **issue backend whose statuses the seed doesn't already fix** (Jira / other — not the local file,
and not GitHub Issues, whose seed maps the lifecycle onto open/closed + labels already), also capture the
tracker's **status workflow**: probe or ask for the available statuses, the transitions between them, and the issue types
for the scope anchor vs a slice. Agree a **status map** with the user — superdev's canonical lifecycle
(`todo` → `in-progress` → `in-review` → `merged`/done, plus `blocked`) → the tracker's real statuses,
with how to perform each move (transition name/id or CLI verb). Record it in `issue-tracker.md`;
`/implement` walks each issue along it as work progresses. If the tracker lacks a state (no separate
`in-review` or `blocked`), map it to the nearest sensible status and note the collapse.

Also capture the **assignee** for any issue backend — the account every issue `/plan` creates is assigned
to, recorded as `Assignee` in `issue-tracker.md` (`plan-contract.md` → *Assignee*). Propose the **API
token's own identity** as the default: resolve it from the backend's whoami endpoint (`GET /api/v1/user`
on Forgejo/Gitea, `GET /user` on GitHub, `GET /rest/api/3/myself` on Jira) and offer that login or
`accountId`. Accept a different account — the case that matters when a shared or bot token files the
issues — provided the account can actually be assigned there (a repo collaborator, an assignable project
user), since an unassignable one fails. Or `none`,
to create the issues unassigned. An omitted line behaves as the default, so a repo that never answers
still gets owned issues. The local-file store has no assignee: don't ask.

**B — Code host.** Where does code live / where do PRs go? (Independent of A — code may be on GitHub
while slices live in Jira.)

- **GitHub** (`gh`). Seed: `references/code-management-github.md`.
- **Forgejo / self-hosted** (`tea` or REST). Seed: `references/code-management-forgejo.md`. Ask base
  URL, owner/repo, and the **env-var name** for the token.
- **Other** (GitLab, …) — describe push + open-MR + base computation in a paragraph.

For both hosts, confirm the **default PR posture** (`draft` recommended | `ready` | `push-only`) and
the **base branch** (default `main`).

**C — Documentation (in-repo).** How does the project keep durable in-repo technical docs? The default
convention is an **`AGENTS.md` hierarchy** (walk before editing; update the affected `AGENTS.md` after
meaningful changes; keep concise/current). Seed: `references/documentation.md`. Keep this convention
unless the user has a different in-repo doc convention (then capture theirs as prose).

Then ask about the **writing standard** (the prose style the doc agents apply when they write, ADR
0012):

- **`controlled`** (recommended): the language-neutral rule set shipped with the plugin
  (`references/controlled-prose.md`). It uses active voice, a sentence-length cap, one name for one
  thing, and no hedging or marketing adjectives, in whatever language the project's docs are written in.
- **A repo-relative path**: the project already has an editorial style guide. The agents read it.
- **`none`**: no standard.

Record the answer as the `## Writing standard` section of `docs/agents/documentation.md`. On
`controlled`, point the user at that file's *Declare per language* section: spelling convention,
compound formation, and number format are the repo's to answer, and answering them later means two
writers have already disagreed.

**D — Knowledge base (optional).** Is there a **knowledge base** for durable, reader-facing docs (feature
specifications, design overviews, ADR summaries)? Ask the user which of:

- **Knowledge base software available** — e.g. **Confluence**. Seed:
  `references/knowledge-base-confluence.md`. Ask base URL, space key, what to publish, optional parent
  page, and the **env-var names** for the API token + email (never the secrets). For a different wiki,
  capture its publish/find/update commands as prose ("other").
- **Local file storage** — markdown under `docs/kb/`. Seed: `references/knowledge-base-local.md`.
- **None** — no separate KB; the in-repo docs are the only record.

If a KB (software or local) is chosen, the KB is **human-consumption first, agents second** — so shape
it around its readers. Ask two more things, then propose a structure:

1. **Audience** (multi-select) — who reads it? e.g. end-users, internal developers, ops/support,
   stakeholders. Record the list.
2. **Language** — the single natural language KB prose is written in (e.g. English, German). Code and
   in-repo docs stay as they are; only KB content uses this language.

Then **do a quick repo scan** (README, top-level structure) and **propose an audience-shaped outline** —
a top-level section per audience with a few candidate topic headings under each (e.g. *User Guide →
Getting started, FAQ*; *Developer Docs → Architecture, Setup, ADR summaries*). Present it, **discuss and
adjust with the user**, and record the agreed outline in `knowledge-base.md`. It's a living skeleton —
`/superdev:plan` and `/superdev:document` fill and extend it, not reinvent it.

**E — Verification (optional).** What single command runs the repo's test suite (e.g. `npm test`,
`pytest -q`, `cargo test`)? Recorded, it **arms the green-gate**: after every controller merge, a hook
re-runs it and blocks the run if the scope suite is RED — turning implement's "re-run the suite after
merging" from a prompt into a deterministic gate. Detect a likely command from the repo (package.json
scripts, a Makefile `test` target, `pyproject.toml`) and propose it. No suite (e.g. a docs-only repo) →
skip; the gate stays inactive and nothing else changes. (The **F** scan below finds the same manifests —
draw the proposed test command from it.)

**F — Toolchain (optional).** From §1's scan, propose the repo's toolchain profile — the package manager
and the build/lint/format/release commands agents should use, plus pointers to the linter/formatter
configs and style-prose docs. Record **pointers, not copied rules** — the config files stay the source of
truth. Discipline:

- **Describe each command by intent, not just its name.** Infer the conventional ones (`test` → unit
  tests, `test:integration` → integration tests, `lint`, `format`, `build`, a `release`/publish script).
- **Ask when a component's purpose is unclear.** A script/task/binary whose intent you can't infer (a
  cutely-named `make-it-so` script, an opaque MSBuild target, an unknown `compiler.exe` in `./bin`) → ask
  the user "is this relevant, and if so what for?" and record the answer as its description. Don't guess.
- **Auto-note orphaned tooling.** A formatter/linter config that **no command runs** (e.g. a `.prettierrc`
  with no `format` script and prettier not a dependency) → note it "not wired / not enforced." This is a
  coherence check only — never grade the *quality* of a tool's configuration, and don't prompt the user
  for it.
- **`test` defers to E.** The toolchain doc references `docs/agents/verification.md` for the test command
  rather than restating it — verification.md stays the single source the green-gate reads.
- **Skip only when fully empty.** No manifest, no config, no style doc at all (a pure-prose/empty repo) →
  write no `toolchain.md`. Any detection (even just a package manager) → write it. Partial ≠ empty.

## 3. Confirm, then write

Show the user a draft of all six files (and the `## Agent skills` block) and let them edit before writing.

Write:

- `docs/agents/issue-tracker.md` — start from the chosen seed, fill in the specifics. For "other",
  write from the user's prose.
- `docs/agents/code-management.md` — same, from the chosen host seed.
- `docs/agents/documentation.md` — from `references/documentation.md` (or the user's in-repo doc
  convention as prose). Always carries the **`## Writing standard`** section with decision **C**'s
  answer, including when the answer is `none`.
- `docs/agents/knowledge-base.md` — from the chosen KB seed (`knowledge-base-confluence.md` /
  `knowledge-base-local.md`) filled in, or the "other" prose. For **None**, write a one-line
  `knowledge-base.md` stating there is no separate KB (or skip the file).
- `docs/agents/toolchain.md` — the detected profile (decision **F**), freeform markdown, **one section
  per workspace** (a single section for a non-monorepo). Each command is an intent phrase + its
  invocation; `test` points at `docs/agents/verification.md`; orphaned tooling is noted; unclear
  components carry the user's confirmed description. Omit absent categories from a section. Skip the file
  when the repo is fully empty of toolchain. **On re-run** (the file already exists): re-scan and
  reconcile — add newly-found elements, update changed ones, drop removed ones — but **keep the
  human-authored descriptions** of components that still exist and re-ask only about *newly*-unclear ones;
  show the delta before writing. Shape:

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
- `docs/agents/verification.md` — the test command in a single fenced block (the green-gate reads the
  first fenced block). Skip the file entirely if there's no suite. Example:

  ````markdown
  # Verification

  ```sh
  npm test
  ```
  ````
- Add an `## Agent skills` block to whichever of `CLAUDE.md` / `AGENTS.md` already exists (edit that
  one; never create the other; never duplicate an existing block):

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
[the test command, or "none"]. Arms the merge green-gate. See `docs/agents/verification.md`.
```

If neither `CLAUDE.md` nor `AGENTS.md` exists, ask the user which to create — don't pick for them.

## 4. Done

Tell the user setup is complete and that `/superdev:plan` and `/superdev:implement` now read these
files. They can edit `docs/agents/*.md` directly later; re-run this skill only to switch backends.
Record only env-var **names** for secrets — never the token values.

If the §1 explore step found **no `AGENTS.md` hierarchy** in the repo, point the user at
**`/superdev:document`** — its bootstrap mode seeds the initial hierarchy + glossary from the existing
code, so per-feature `/superdev:plan` doesn't start blind.
