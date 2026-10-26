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
- `docs/agents/verification.md` — the optional **test commands**: a full one plus, for every repository
  with a suite, a required focused one, which the implement chain's test runs read, and an optional
  **timing command**, which a test audit reads
- `docs/agents/deployment.md` — the repository's **deploy posture** (`none` / `manual` / `auto`) and its
  **deploy targets**, which `/superdev:ship` reads once a feature's pull request has merged

Plus one file that is **not** a config doc, because what it holds belongs to a person rather than to the
repository:

- `.superdev/info.json` — the **operator configuration** (`CONTEXT.md`), holding the slice store's
  assignee and its display name under the `issue-tracker` role key. Git-ignored, so it stays out of a repository other people
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
`verification.md`, `deployment.md` — under `docs/agents/`:

- **Absent.** The file does not exist. A repo that never ran `/superdev:setup` reports all of them this
  way, and that is not a failure — it starts no interview either.
- **Present, consistent.** The file exists and every fact it records still holds against the repo.
- **Present, drifted.** The file exists and names a fact the repo no longer supports. State the fact
  and what the repo shows instead of it, never just "drift found."

Check each present document's own facts against the repo, never against a remote call — the slice
store and code host stay unqueried:

- `verification.md`, `toolchain.md` — every command named (the full and focused test commands, the
  timing command, the whole-repo command where configured, each toolchain entry) still resolves: a
  package-manager script is still declared in the manifest (`package.json`, `pyproject.toml`, a
  `Makefile` target, …), and a bare executable is still reachable. A command the document names that the
  manifest no longer defines is drift. A full command that looks affected (`nx affected`,
  `turbo --affected`, `pnpm` with a `--filter "...[<base>]"` selector, `dotnet-affected`, or another
  dependency-graph tool's affected mode, per decision E below) in a repository whose `verification.md`
  carries no `## Whole-repo command` section is drift as well: state that the section is missing, since
  `references/test-selection.md`'s `## Affected form` has such a repository configure one. Reading the
  command text is the whole check; it runs nothing.
- `verification.md` — a document holding test commands and no `## Test paths` section gets an
  **advisory** line, never a drift verdict: state that the default patterns
  (`references/test-selection.md`'s `## Test paths` section: `tests/`, `test/`, `__tests__/`, and `spec/`
  directories at any depth by whole segment, `*.Tests` and `*.Test` directories, and the file names
  `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.py`) apply, and that the operator may add the section to
  name the repository's own test locations. A section with no usable entry, empty or all malformed, gets
  the same line, since the hook then applies the defaults. A `verification.md` with no test command gets no
  such line.
- `verification.md` — a `## Complete selector` section on a focused command with no `{paths}` token gets an
  **advisory** line, never a drift verdict: state that the declaration has no effect there.
- `deployment.md` — the same resolution check, applied to each target's command: a target naming a
  script the manifest no longer defines is drift. A `none` posture, or a `manual`/`auto` posture with an
  empty targets table, has nothing to check here, and reports consistent once confirmed present.
- `issue-tracker.md`, `code-management.md` — a recorded host/owner/repo (or base URL) still matches
  `git remote -v`. Compare the **host/owner/repo path alone** — a remote of the form
  `https://user:TOKEN@host/owner/repo.git` carries userinfo that plays no part in the comparison — and
  report the remote with any userinfo stripped, never verbatim: a caller (`/superdev:sweep`'s config leg
  among them) can write this verdict into a report or an intent file, and a token belongs in an env var,
  never in one. A document naming no such fact (an "Other" backend written as prose) has nothing to check here, and reports consistent once confirmed present.
- `documentation.md` — a `## Writing standard` naming a repo-relative path still resolves to a file,
  and each `## Audit set` glob still matches at least one file.
- `knowledge-base.md` — a local `docs/kb/` path still exists. A configuration carrying
  `- **Body format:** storage` whose `### create` template never reads `SUPERDEV_KB_PARENT_ID` is
  drift: a staged page naming a parent lands where no parent was asked for. Name the Confluence seed's
  `### create` template (`references/knowledge-base-confluence.md`) as its replacement. A software
  backend records no other local fact this check can reach, and reports consistent once confirmed
  present.

Beyond the six config documents, check for a leftover `.claude/rules/` directory holding at least one
`.md` file — superdev's retired rule-compliance home (ADR 0077). Report its path and how many `.md`
files it holds, naming `docs/invariants.md` as where the content belongs, and state that the move is by
hand: `Class` and `Concepts` are mandatory register fields a glob-scoped rule records nowhere, so a
conversion would invent them. An absent `.claude/rules/`, or one holding no `.md` file, gets no line in
the report.

### Seed gaps

Beside those verdicts, compare each present document with its **seed** (CONTEXT.md) and list its **seed
gaps** (ADR 0107). The comparison reads the installed plugin's own files and the document, so `check`
keeps the read-only posture above and the verdicts stay about repository facts.

- **The seed is the one for the backend the document records**, read from
  `${CLAUDE_PLUGIN_ROOT}/references/`: `issue-tracker-<backend>.md`, `code-management-<host>.md`,
  `documentation.md`, `knowledge-base-<backend>.md`, `deployment.md`.
- **A document with no matching seed** — an "Other" prose backend, a `None` knowledge base, a
  `documentation.md` recording the user's own convention — reports `no seed to compare`. So do `toolchain.md` and `verification.md`, which keep the resolution checks above and
  have no seed.
- **Match sections by concept.** Pair each seed section with the document section that does the same
  job, whatever its heading: a document's `## Outline` matches the Confluence seed's `## Audience,
  language & outline`. A **seed gap** is a seed section with no matching document section, or a seed rule
  that a matched section lacks or contradicts. List each by name, the seed section or rule as the seed
  names it, with the document section it belongs under.
- **A rule the current seed replaced is a contradicted rule.** A Forgejo config document written before
  ADR 0111 can carry any of these token or curl rules. The issue tracker has an `**Auth:**` bullet and
  `## REST conventions`. Code management has an `**Auth:**` bullet naming a token env var or an
  `Authorization` header, a `## tea CLI conventions` section whose login line passes `--token`, a
  `## REST conventions (curl)` section, and a `## Degrade when no CLI / token`
  section. Each contradicts the seed's `Login` bullet, `tea conventions` section, or `Degrade when no tea
  login` section, so each is a seed gap listed under the seed rule it contradicts, never a stale deviation
  and never a section only the document carries.
- **A renamed heading, a filled-in value where the seed carries a placeholder, setup-facing instruction
  text, and a section only the document carries are no gap.** Setup-facing text tells this interview what
  to ask; a consumer skill never reads it.
- **A document with no seed gap says so.**
- **`## Seed deviations` is the document's own record of a gap the operator declined.** Each bullet is
  `- Seed deviation: <seed section or rule, as the seed names it> — <the operator's reason> (<YYYY-MM-DD>)`.
  This is the one definition the re-run (§3) writes and `check` reads. A bullet never takes a
  configuration-key shape (`- **Backend:**`, `- **Body format:**`), because `scripts/publish-kb.js` matches
  those anywhere in `knowledge-base.md`. A gap that a bullet names is listed as `recorded`, never as a gap,
  with the reason the bullet carries. The section itself is a section only the document carries.
- **A bullet that names no rule in the current seed is a stale deviation.** `check` also lists, per
  document, each such bullet as a **stale deviation**, by bullet text, never as a gap. A bullet that names
  a rule by concept names it, matched by concept as a gap is. `check` deletes no bullet.
- **The report names the plugin version whose seeds it compared against**, the `version` in
  `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, at its end.

Report the verdicts and the seed gaps, then stop. A plain `/superdev:setup` re-run offers each gap (§3).

## 1. Explore

- `git remote -v` and `.git/config` — GitHub? GitLab? a self-hosted host (Forgejo/Gitea)?
- `docs/agents/` — prior superdev config? (If so, offer to update, not duplicate: §3's re-run reconciles
  each document with its seed.)
- `CLAUDE.md` / `AGENTS.md` at root — which exists? Is there already an `## Agent skills` section? Is an
  `AGENTS.md` hierarchy present (child `AGENTS.md` files in subdirs)?
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
- **Deployment** — scan the same manifests for a candidate deploy target, feeding decision **G**: a
  `deploy:<name>` (or similarly named) script in `package.json`, a `Makefile` `deploy` target, or the
  like.

## 2. Decide (one at a time)

Assume the user may not know these terms. Each decision: a one-line explainer, the choices, and a
proposed default inferred from the remote — `${CLAUDE_PLUGIN_ROOT}/references/cross-exam.md`'s
recommended-answer and live-options rules applied to a config choice: present every choice alongside the
proposed default, and each alternative's description states what choosing it saves, or why it does not
fit this repo. Using `AskUserQuestion`? Mark the default `(Recommended)`.

**A — Slice store.** Where do slices/plans live?

- **GitHub Issues** — slices as GitHub issues. Seed: `references/issue-tracker-github.md`. Ask for
  owner/repo, the feature label, and the **env-var name** for the API token (never the secret).
- **Forgejo / Codeberg Issues** — slices as issues on a Forgejo or Gitea instance (Codeberg included).
  Seed: `references/issue-tracker-forgejo.md`. Detection hint: a `codeberg.org` or self-hosted
  Forgejo/Gitea remote. Ask for host/owner/repo and the feature label, and ask for no token env var: check
  that `tea` is installed and that `tea login list -o json` has an entry whose `url` equals the host. No
  `tea`, or no such entry, stops the step with the `tea login add --url <host>` command for the operator
  to run. Two or more such entries are named, and the operator picks.
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

For an **issue backend whose statuses the seed doesn't already fix** (Jira / other — not GitHub Issues
or Forgejo, whose seeds each map the lifecycle onto open/closed + labels), also capture the
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
it (what `/superdev:implement` and `/superdev:status` check).

Also capture the **assignee** for any issue backend — the account every issue `/superdev:plan` creates is
assigned to (`plan-contract.md` → *Assignee*). Propose the **API token's own identity** as the default:
resolve it from the backend's whoami (the matched `tea` login's `user` on Forgejo/Gitea, `GET /user` on
GitHub, `GET /rest/api/3/myself` on Jira) and offer that login or `accountId`. Accept a different account — the
case that matters when a shared or bot token files the issues — provided it can actually be assigned there
(a repo collaborator, an assignable project user), since an unassignable one fails. Or `none`, to create
the issues unassigned.

**Write the answer to `.superdev/info.json`, never to `issue-tracker.md`** (ADR 0073). The identifier
belongs to the person running superdev, and `issue-tracker.md` is tracked, so a repository maintained by
several people would carry one maintainer's account in its history and file everyone's issues against it.
`.superdev/` is git-ignored, which makes the file untracked by construction:

```json
{
  "issue-tracker": { "assignee": "<the answer, or \"none\">", "displayName": "<the account's name>" }
}
```

- **Look up the display name** for an answer other than `none`, by its identifier, on every backend: the
  whoami calls above do not all return a name (the `tea` login carries none). Forgejo/Gitea: `tea api
  -i /users/<login>` and its `full_name`, reading the HTTP status from stderr, because `tea api` exits 0
  on a 4xx or 5xx answer; GitHub: `GET /users/<login>` and its `name`; Jira:
  `GET /rest/api/3/user?accountId=<accountId>` and its `displayName`. A status other than 2xx is a
  failed lookup. The name is display-only:
  `/superdev:plan` assigns by `assignee` alone (INV-0074).
- **Merge into an existing file**, setting `issue-tracker.assignee` and `issue-tracker.displayName`, so
  another role's key survives. An empty or null name, a failed lookup, or `none` removes `displayName`,
  so no earlier account's name stays beside a new assignee. Report a failed lookup in one line and
  continue: the assignee is written either way.
- **Ensure `.superdev/` is in `.gitignore`**, adding it when absent.
- **Say the path you wrote and that the file is untracked**, so an operator who went looking in
  `docs/agents/` knows why it is not there, and knows a teammate inherits nothing from this answer.
- **Declining leaves no file.** An absent file resolves to the token's own identity anyway, so every
  issue-backed repo gets owned issues with nothing configured.

**B — Code host.** Where does code live / where do PRs go? (Independent of A — code may be on GitHub
while slices live in Jira.)

- **GitHub** (`gh`). Seed: `references/code-management-github.md`.
- **Forgejo / self-hosted** (`tea`). Seed: `references/code-management-forgejo.md`. Ask base URL and
  owner/repo, and ask for no token env var: check for a `tea` login for the base URL, as the slice store does
  above. Check that `jq` is installed too: the pinned merge and a Forgejo wiki's templates build their JSON
  with it. No `jq` stops the step the way no `tea` does.
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
`controlled`, point the user at the standard's *Declare per language* section
(`references/controlled-prose.md`) and record the repo's answers under a `### Declare per language`
heading in that same `docs/agents/documentation.md`: spelling convention, compound formation, and number
format are the repo's to answer, and answering them later means two writers have already disagreed.

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
  page id (it fills the seed's `<parent-id>`, empty when none), and the **env-var names** for the API token + email (never the secrets); the seed's own
  `- **Body format:** storage` bullet needs no question — Confluence's page body is always XHTML
  storage format. For a different wiki
  ("other"), capture the same **backend command contract** (below) that every remote backend declares —
  a backend declaring no `delete` template leaves every `action: delete` staged page unpublishable, and
  one declaring no `read` template, or a non-markdown page body, blocks the aggregate question below.
  Ask whether its page bodies are markdown, and record a `- **Body format:** <value>` bullet only when
  they are not — absent means markdown. Also record that
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
`find` template's JSON object carries — uppercased — reaches `update` and `delete`. One key is named: an
optional `sub_url`, the page's address, which `/superdev:publish-kb` fills a `parent-link` target's
`{sub_url}` placeholder from (ADR 0168). `find` carries the
contract the other four rest on: exit `0` with a JSON object on stdout means the page exists, exit `3` means
the page is genuinely absent, anything else means the backend could not answer. **Probe the `find`
template before writing the section**: run it with `SUPERDEV_KB_TITLE` set to a title that cannot exist
(a random UUID works) and require exit `3` — this is what stands between the template and a duplicated or
overwritten page. Any other outcome — report it to the user, fix the template, probe again — leaves the
`## Commands` section unwritten. A **local** or **none** knowledge base is asked for no commands at all.

**Run that probe under the same bound every backend command runs under** (ADR 0130): pass the Bash tool's
own `timeout` parameter, set to 30000, or to `SUPERDEV_PUBLISH_KB_TIMEOUT_MS`'s own value when the
operator has set it — both are already milliseconds, the unit the Bash tool's `timeout` parameter takes,
so no conversion is needed. The probe reaches the same host `/superdev:publish-kb` does, so an unbounded
one hangs this interview for as long as the kernel's own TCP timeout runs. A probe that exhausts the bound
is a probe failure like any other: report it, leave `## Commands` unwritten, and probe again once the
template or the host is fixed. **State the bound to the operator while capturing the templates**, so a
command they write is one they expect to be killed at it.

**On re-run**, when `knowledge-base.md` already carries a `## Commands` section: show the delta between
the newly captured templates and the existing ones, and keep the operator's own template for a verb
unless they choose to replace it — never rewrite a working command silently.

Then, for a **remote** backend whose page bodies are markdown, ask which of those pages **aggregate**: a
page many scopes each contribute one section to — an index, a changelog, an ADR-summaries digest —
rather than a page one scope owns end to end. **A documented read is a precondition of this question**
(ADR 0027): before any entry can carry the marker, the `## Commands` section above must hold a `### read`
subsection — a backend declaring none can carry no `(aggregate)` entry, because nothing can fetch a live
body to merge into. Mark
each answer in the outline with `(aggregate)`, and pin the heading level its sections take (e.g.
`## <concept>`) — the writer reaches no backend and cannot see the live page's nesting, and a level left
unpinned lets a staged heading as shallow as the page's own title carry the whole page away when it
merges. A marked page is staged one section at a time (`action: patch`) and merged into the live page; an
unmarked one is replaced wholesale, which on an aggregate page drops every section written by a scope the
doc pass cannot see. A digest or index page in the proposed outline is the case to ask about by name.
**None aggregate** → mark nothing. **Skip this question outright** for a backend whose `- **Body
format:**` bullet declares anything other than markdown (Confluence's XHTML storage format, e.g.): mark
no outline entry, since `action: patch` merges by matching markdown headings and finds none there, and
`/superdev:publish-kb` refuses that action on such a backend regardless (ADR 0027). A **local
`docs/kb/`** backend skips this question too: its pages are repository files the doc
pass reads and edits directly, so it stages nothing.

**E — Verification (optional).** What single command runs the repo's test suite (e.g. `npm test`,
`pytest -q`, `cargo test`)? Recorded, it is the suite the implement chain runs: the scope review's exit run
over the integrated scope, the scope's one full-suite run, where no reusable record, carry, or recorded rerun
meets the gate (ADR 0192) (`references/test-selection.md`). No hook runs
it on a merge (ADR 0155). Detect a likely command (package.json scripts, a Makefile `test` target,
`pyproject.toml`) and propose it. No suite (e.g. a docs-only repo) → skip; nothing runs a suite. (The
**F** scan finds the same manifests — draw the proposal from it.)

**A repo with a full command settles the focused test command too**: the command every step inside the
implement loop runs, defined by costing less than the full suite. A repo without one runs its whole suite
on every RED→GREEN increment — hours per scope on a slow suite. `references/test-selection.md` owns the
full contract. Read it, **derive the focused command from the full one and the runner the §1 scan
detected, and write it on the user's confirmation.** **No suite at all** → skip this too; there is nothing
to derive it from. The derivation takes one of two branches:

- **A runner that maps source files to the tests covering them gets a `{paths}` form**, carrying that
  runner's pass-with-no-tests flag — `npx vitest related --passWithNoTests {paths}`, `npx jest
  --passWithNoTests --findRelatedTests {paths}`. The flag is what keeps a change set holding no tests
  green: the implementer's change set and the carry run's range can hold only non-test paths, and a runner that
  fails on an empty collection reports that as RED.
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

**A focused command that carries `{paths}` gets one more question, asked once the focused command is
settled** (ADR 0175): does it select every test any changed path can affect? Name what a yes trusts: gates
then skip the full suite on that strength, carrying a green suite record across a change the focused run
covered (`references/test-selection.md`'s `## Complete selector` owns the contract). A yes writes the
`## Complete selector` section, listing the selector's own files (a runner script, a mapping config) as list
items for each one the operator names. A no, or no answer, writes no section. A fixed fast subset, a
self-detecting flag, and a focused command that repeats the full one carry no `{paths}`, so setup asks
nothing for them. A re-run on a `verification.md` that has no section asks once; one that has the section
asks nothing.

**A repo with a full command proposes its test paths too** (ADR 0117): the glob patterns that name its
test files, which `hooks/run-trace.js` reads to class each recorded edit. Detect the repository's test
locations — the default patterns `references/test-selection.md`'s `## Test paths` section lists, plus
the directories and file patterns its test command and manifests name — propose them, and write the
operator's answer as that section's **unfenced** list, never a fenced block (the two fences stay the full
and focused commands). **No test command** → propose no test paths and write no section.

**On a monorepo, the full command may take an affected form too** (ADR 0105, INV-0105). Setup runs no
test command in any configuration, `check` mode and sweep's chained setup leg included, and those two ask
nothing here. Identify the
tool that owns the repository's dependency graph — the build system or the package manager (nx,
turborepo, pnpm, or `dotnet-affected` over an MSBuild project graph); plain Bun/npm/yarn workspaces with
no such tool have no affected mode. Verify that tool's affected syntax against its own official docs
(`references/doc-verification.md`) before proposing it — never write an unverified command form as fact.

- **The tool is installed.** Propose its affected form against the base branch `docs/agents/
  code-management.md` records, together with the **whole-repo command** beside it — the same tool's
  whole-suite invocation. **Setup runs no test command and never starts the affected form or the
  whole-repo command** (ADR 0189, INV-0175). **Before writing either, validate the form through
  read-only tool queries**: the form has to select a project when a project changed, and its target has
  to exist on the selected projects. A form aimed at the wrong base (`--base=HEAD`) selects nothing on
  every scope, and a mistyped target (`nx affected -t tset --base=main`) names no task on any project.
  The queries run in a throwaway worktree, and the steps run in this order, each step's conditions
  holding from that step on. The probe edits no tracked file of the checkout and pushes nothing; its
  commit stays unreferenced and no branch exists. Each query's syntax comes from the tool's own
  official docs (`references/doc-verification.md`), and every query runs with remote caching off,
  because a remote cache would upload artifacts for the probe commit, an outward write: `NX_NO_CLOUD=true`
  (nx), `--cache=local:rw` (turborepo), and for any other tool its own docs' switch.

  1. **Location.** Put the worktree inside the repository's main checkout, under the git-ignored
     `.superdev/` directory (`.superdev/probe-<random>`), after ensuring `.superdev/` is in `.gitignore`
     as the decision-answer storage above does: module resolution then walks up to the checkout's own
     `node_modules`, so nx and turborepo find their local binary and plugins, the way the scope
     worktrees under `.superdev/scopes/` do.
  2. **Create it.** `git worktree add --detach <dir> <base-tip>`.
  3. **Edit and commit.** Edit one tracked source file of a leaf project the tool lists — one with no
     dependents, where it can tell — and commit it there with `git -c core.hooksPath=/dev/null -c
     commit.gpgsign=false commit`, because `--no-verify` skips no post-commit hook. A probe commit that
     fails is reported and nothing is written.
  4. **List query.** List the projects the form selects on that commit, with the base the form carries:
     `nx show projects --affected --base=<base> --head=HEAD`, `TURBO_SCM_BASE=<base> turbo ls --affected`,
     `pnpm ls --filter "...[<base>]" --depth -1`, or `dotnet affected describe --from <base>` (stdout, no
     file written; exit 166 means nothing changed). A form that selects no project on that change is not
     written: say that it selects nothing on a real change, and why the base is the suspect.
  5. **Target query.** Query whether the form's target exists on the selected projects: `nx show projects
     --affected --base=<base> --head=HEAD --with-target <target>` (the option table spells the flag
     `--withTarget`, the examples `--with-target`), `TURBO_SCM_BASE=<base> turbo run <task> --affected
     --dry=json --cache=local:rw` (a dry run lists the tasks and starts none), for pnpm a read of the
     `scripts` field in each selected project's `package.json` for the script, or, for
     `dotnet-affected`, no query, because it has no target concept. A query that shows
     the target on no selected project means the form is not written: say so, and name the likely cause
     (the target name matches no project task).
  6. **Empty-change exit.** State how the form exits when the change reaches no project, taking the
     behaviour from the tool's own docs (dotnet-affected exits 166 when nothing changed, so the form
     has to map that exit to green). Where the docs do not document the exit, say so and ask the
     operator to state the exit. The operator confirms the stated exit before the form is written.
  7. **Remove the worktree.** Remove the worktree on every exit path, at whichever step setup stops and
     whatever the outcome, an operator answer included (`git worktree remove --force <dir>`); `git
     worktree prune` cleans up after an interrupted run.
  8. **Write.** The affected form and its whole-repo command are written only after step 4, step 5, and
     step 6 pass, or after the operator answers below. A query that fails, cannot run (dependencies
     uninstalled in the fresh worktree), or cannot decide takes no guess: setup removes the worktree and asks the operator to choose one of
     three answers: write the form as is, give a corrected form, or keep the whole-suite full command.
     Nothing is written before the answer. A corrected form goes through steps 1 to 6 again in a new
     probe worktree, which step 7 removes in turn. Every answer that writes a form passes step 6 first.
- **The tool is not installed.** Name it and its official install command, and write no affected form
  until the operator has installed it and every query above passes.
- **No tool owns an affected mode.** Keep the whole-suite full command, and record the reason as prose
  beside the second fence, the same way the already-cheap and cannot-narrow cases below do.

**A repository with a suite never reaches `none`.** The full suite may be **already cheap**, so a
distinct focused command would save nothing worth naming — or **no cheaper subset exists** to narrow to,
because every test in the suite is a slow one. Either way, **ask which case applies, and record the
answer as prose**: the second fence carries the **full** command again, duplicated deliberately, and the
reason beside it is what tells a later reader the duplication is not a copy-paste mistake (ADR 0085,
INV-0007). A runner that maps nothing is not one of these cases: it takes the fast subset above.

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
  restating the command — verification.md stays the single source every test run reads.
- **Skip only when fully empty.** No manifest, no config, no style doc at all → write no `toolchain.md`.
  Any detection (even just a package manager) → write it. Partial ≠ empty.

**G — Deployment (optional).** What does this repository deploy, and how? One **posture** for the whole
repository, never one per target: `none` (nothing deploys), `manual` (the operator deploys outside
superdev; `/superdev:ship` prints each target's command and records it pending), or `auto`
(`/superdev:ship` runs each target's command itself, after the merge, in a tree checked out at the merge
commit, and only then — INV-0098). Seed: `references/deployment.md`.

**Propose `manual` as the default. Never propose `auto`** — list it as opt-in only, and write it solely
when the operator picks it themselves.

For `manual` or `auto`, offer §1's scan as candidate targets and, for each one the operator confirms, ask
its name, the command that deploys it, and a **read-only** way to reach it for verification (a URL, a
health check, a status command — never a command that changes anything).
Under `auto`, a target's command runs in a tree detached at the merge commit that can still carry ignored
files from the run — installed dependencies, build output — so say so when you ask for it: the command
must not rely on their presence or absence, and installs and builds what it needs itself. Zero confirmed
targets is valid:
write the posture with an empty targets table. For `none`, ask nothing else. Either way, write the chosen
answer as a `` `Posture:` `` line under `## Posture` — the one form `/superdev:ship` reads (`references/
deployment.md`).

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
    - Tests — see docs/agents/verification.md  (not restated here)
    - Integration tests — `pnpm test:integration`
    - Lint — `pnpm lint`  (eslint · `.eslintrc.json`)
    - Format — `pnpm format`  (prettier · `.prettierrc`)
    - `make-it-so` — tags and publishes a release  (purpose confirmed with user)
  - Not wired: `.editorconfig` present but no command applies it — formatting not enforced
  - Style prose: `CONTRIBUTING.md §Style`
  ````
- `docs/agents/verification.md` — the full test command as the first fenced block. Skip the file entirely
  if there's no suite. A repository with a suite always carries a **second fenced block** too: the
  focused command decision **E** derived, or, for the already-cheap and cannot-narrow cases, the **full**
  command again — `none` is never an outcome once a suite exists (ADR 0085, INV-0007). Either way, record
  beside the second fence, **as prose outside the fence, never fenced itself**, the reason for its
  content — every reader takes a fenced block by index, so a reason fenced by mistake becomes the
  "focused" command every loop step runs. Example, with a focused command configured:

  ````markdown
  # Verification

  ```sh
  npm test
  ```

  ```sh
  npx vitest related --passWithNoTests {paths}
  ```
  ````

  Example, the suite already cheap, the full command duplicated in the second fence and the reason
  recorded as prose beside it (this repo's own `docs/agents/verification.md` is exactly this shape):

  ````markdown
  # Verification

  ```sh
  npm test
  ```

  ```sh
  npm test
  ```

  **No cheaper focused command, deliberately.** This suite finishes in seconds, so a distinct focused
  command saves nothing worth naming, and every caller runs the full command
  except a test-first step, which runs its own test file (`references/test-selection.md`, ADR 0025, ADR 0074,
  ADR 0085, ADR 0180).
  ````

  Example, a runner that cannot narrow, the full command duplicated the same way:

  ````markdown
  # Verification

  ```sh
  go test ./...
  ```

  ```sh
  go test ./...
  ```

  **No cheaper focused command, deliberately.** This runner has no subset narrower than the full suite to
  name, so every caller runs the full command except a test-first step, which runs its own test file
  (`references/test-selection.md`, ADR 0025, ADR 0074, ADR 0085, ADR 0180).
  ````

  Add the **`## Timing command`** section decision **E** settled, its command in a **backtick span,
  never a fenced block** — a fence lands in the focused slot of a repository that has not yet recorded a
  focused command, and every caller then runs it as the focused command. **No timing command** — whether the runner reports no
  durations or the user declined — writes the one-line reason **E** recorded, as prose, in place of the
  section. Example, with one configured:

  ````markdown
  ## Timing command

  `npx vitest run --reporter=verbose`
  ````

  Add the **`## Complete selector`** section only on the operator's explicit yes to decision **E**'s
  selector question, in the format `references/test-selection.md`'s `## Complete selector` section defines
  (an unfenced list, one backtick-spanned path per item). Example:

  ````markdown
  ## Complete selector

  The focused command selects every test a changed path can affect.

  - `scripts/run-tests.js`
  ````

  Add the **`## Test paths`** section decision **E** settled, in the format
  `references/test-selection.md`'s `## Test paths` section defines: an **unfenced list**, one pattern per
  item. A repository with no test command gets no section.

  Add the **`## Whole-repo command`** section for a monorepo whose full command took the affected form
  above, its command in a **backtick span, never a fenced block**, for the same reason. **No affected
  form** — whether no tool owns an affected mode, or the operator keeps the whole-suite full command after a query failed — writes no section: the
  full command stays the whole suite, and every caller reads it unaffected. Example, with one configured:

  ````markdown
  ## Whole-repo command

  `nx run-many --target=test --all`
  ````
- `docs/agents/deployment.md` — from `references/deployment.md`, decision **G**'s posture and the
  confirmed targets table (empty under `manual`/`auto` with none confirmed). `none` → write the posture
  alone, an empty targets table. **On re-run**, show the delta against the existing targets and write
  only what the operator changed.
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
[the test commands, or "none"]. See `docs/agents/verification.md`.

### Deployment
[the posture — none / manual / auto — and target count]. See `docs/agents/deployment.md`.
```

If neither `CLAUDE.md` nor `AGENTS.md` exists, ask the user which to create — don't pick for them.

### Re-run: reconcile each document with its seed

A plain re-run on a configured repository reconciles every document whose backend stays the same with its
seed (ADR 0107), by §0's definitions of **seed gap** and `## Seed deviations`. `toolchain.md` and the
knowledge base's `## Commands` keep their re-run rules above. `deployment.md` joins the reconcile, and its
targets keep the delta rule above: show the delta against the existing targets and write only what the
operator changed.

Show each document's seed gaps, and offer each gap on its own, with the document's current text beside the
seed's and three choices:

- **Apply.** A missing section goes in at its seed position relative to the matched neighbours. A missing
  or contradicted rule replaces or joins only that rule inside its section: applying the `**Auth:**` gap
  replaces that bullet with the seed's `Login` bullet where the seed's `## Configuration` carries one and
  removes it otherwise (the code-management seed carries its login rule in `tea conventions` only), the `tea conventions` gap replaces the matched
  `## tea CLI conventions` section rather than adding a second one, a `## REST conventions` gap removes
  that section, and the degrade gap replaces `## Degrade when no CLI / token`: no old rule stays beside
  the new one. Every other section keeps the text the operator filled in.
- **Record as a seed deviation.** Ask for the operator's reason and require one. Write §0's bullet into the
  document's `## Seed deviations` section, creating the section at the end of the document when absent.
  Recording changes no other line, so every runtime reader reads the document exactly as before,
  `/superdev:publish-kb`'s reading of the knowledge-base backend and body format included.
- **Leave for later.** Write nothing. The gap is offered again next time.

Nothing is written for a gap without the operator's choice (INV-0107). A gap recorded as a seed deviation
is listed as recorded and never offered again. A re-run with no seed gaps asks nothing.

A re-run also shows each stale deviation (§0) and offers two choices: **Drop** the bullet, or **Keep** it.
Nothing is written for a stale deviation without the operator's choice.
A kept stale deviation is offered again on every later re-run, until the operator drops it.

A gap whose seed text carries a repository-specific value asks the question the fresh path (§2) asks for
it, and writes the answer, never the seed's placeholder. Where §2 asks none, the seed section names the
fill-in itself: the triage label, a repository filter for a store shared across repositories, a `(fill in
at setup)` section such as `## Run state` or the status workflow. Applying a knowledge-base gap writes
`## Commands` only after the `find` probe exits 3 (INV-0072). Applying a seed's `## Assignee` writes no
assignee into a tracked document, and the answer goes to `.superdev/info.json` (INV-0074).

A re-run also reads `.superdev/info.json`. An `issue-tracker.assignee` other than `none` with no
`displayName` beside it gets the display name looked up and written, per decision A, and asks no
question: the name is display-only, so there is nothing to decide.

A backend switch writes the new seed fresh and carries no seed deviation over from the old backend.

## 4. Done

Tell the user setup is complete and that `/superdev:plan` and `/superdev:implement` now read these files.
They can edit `docs/agents/*.md` directly later. Re-run this skill to switch backends, or to pick up what
a newer superdev release added: a re-run reconciles each document with its seed (§3). Say that
`.superdev/info.json` is theirs alone and travels with no clone, so a fresh checkout configures it again
or falls back to the API token's own identity. Record only env-var **names** for secrets — never the token
values, and never in `.superdev/info.json` either, which holds identifiers and their display names only.

If §1 found **no `AGENTS.md` hierarchy**, point the user at **`/superdev:document`** — its bootstrap mode
seeds the initial hierarchy + glossary from the existing code, so per-feature `/superdev:plan` doesn't
start blind.
