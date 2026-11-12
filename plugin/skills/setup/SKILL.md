---
name: setup
description: Configure this repo for superdev: slice store, code host, documentation convention, knowledge base, toolchain, and test command. Run once; /superdev:plan and /superdev:implement auto-invoke it if config is missing.
argument-hint: "[check | (empty = full interview)]"
---

# superdev setup

## Role and terms

Applies to every start. You write the per-repo config documents the superdev skills read. You explore, propose defaults, and confirm one decision at a time. You write once every decision is confirmed.

- Seed templates live in `${CLAUDE_PLUGIN_ROOT}/references/`.

- **The config documents**: the files under `docs/agents/` this skill owns.

  | File | Holds |
  |---|---|
  | `issue-tracker.md` | the **slice store**: where slices live and the calls every command makes to read, update, and close them |
  | `issue-tracker-plan.md` | the slice store's calls only `/superdev:plan` makes: creating issues, the anchor lines, the assignee, the tag rewrite, and append mode |
  | `code-management.md` | the **code host**: push, open a PR or MR, and the default posture |
  | `documentation.md` | the in-repo **documentation** convention |
  | `knowledge-base.md` | the optional **knowledge base**: software, local file, or none |
  | `toolchain.md` | the detected **toolchain** profile (package manager, build, lint, format, and release commands, style pointers), one section per workspace |
  | `verification.md` | the optional **test commands**: a full one and, for every repository with a suite, a required focused one, which the implement chain's test runs read, an optional **timing command**, which a test audit reads, and the **prepare command**, which every test worktree runs first |
  | `deployment.md` | the repository's **deploy posture** (`none` / `manual` / `auto`) and its **deploy targets**, which `/superdev:ship` reads once a feature's pull request has merged |

- **The operator file**: `.superdev/info.json`, the **operator configuration** (`CONTEXT.md`). It is no config document. It holds the slice store's assignee and display name under `issue-tracker`, a Forgejo knowledge base's tea login under `knowledge-base`, and the time bounds an operator sets (`assignee.md` → *Assignee* lists every key). It is git-ignored.
- **An operator-file write**: merge into the operator file and keep each key already there. First ensure `.superdev/` is in `.gitignore`, adding it when absent.
- **A remote backend**: a knowledge base on software (Confluence, a Forgejo, Gitea, or GitHub wiki, an "other" wiki). A local `docs/kb/` and none are not remote.
- **A seed gap** and **`## Seed deviations`**: as §0's **Seed gaps** defines them.

## 0. Check mode (`check`)

**The mode.** Applies to every start. `$ARGUMENTS` carrying the literal word `check` runs this read-only drift check and skips §1–§4. Any other `$ARGUMENTS`, including none, runs the full interview.

- The operator names the mode. The command sniffs nothing.

**The posture.** Applies to `check`. Write no file, make no slice-store or code-host call, and start no interview. Check each present document's facts against the repository alone.

**The verdicts.** Applies to each config document. Report one of three verdicts:

- **Absent.** The file does not exist. A repository that never ran `/superdev:setup` reports every document this way. That is no failure, and it starts no interview.
- **Present, consistent.** The file exists and every fact it records still holds against the repository.
- **Present, drifted.** The file exists and names a fact the repository no longer supports. State the fact and what the repository shows instead, never just "drift found."

**The fact checks.** Applies to each present document. Read the command text and run nothing.

| Document | Check |
|---|---|
| `verification.md`, `toolchain.md` | Every command named (the full, focused, timing, and whole-repo commands, each toolchain entry) still resolves: a package-manager script is still declared in its manifest (`package.json`, `pyproject.toml`, a `Makefile` target, …), and a bare executable is still reachable. A command the manifest no longer defines is drift. A full command that looks affected (`nx affected`, `turbo --affected`, `pnpm` with a `--filter "...[<base>]"` selector, `dotnet-affected`, or another dependency-graph tool's affected mode, per decision E) in a `verification.md` with no `## Whole-repo command` section is drift: state that the section is missing (`references/test-selection.md`'s `## Affected form`). |
| `verification.md` | Test commands and no `## Test paths` section get an **advisory** line, never a drift verdict: state that the default patterns of `references/test-selection.md`'s `## Test paths` section apply, and that the operator may add the section to name the repository's own test locations. A section with no usable entry, empty or all malformed, gets the same line. A `verification.md` with no test command gets no such line. |
| `verification.md` | A `## Complete selector` section on a focused command with no `{paths}` token gets an **advisory** line, never a drift verdict: state that the declaration has no effect there. |
| `verification.md` | Test commands and no `## Prepare command` section, or a section holding neither a command nor `none`, is reported: state that no test worktree is prepared and that a **Fail-to-pass run** reuses no traced control (`references/test-selection.md`'s `## Prepare command`), and that a re-run of `/superdev:setup` proposes the section. A command the section names gets the resolution check of the first row. |
| `deployment.md` | The same resolution check on each target's command: a target naming a script the manifest no longer defines is drift. A `none` posture, or a `manual`/`auto` posture with an empty targets table, reports consistent once confirmed present. |
| `issue-tracker.md`, `issue-tracker-plan.md`, `code-management.md` | A recorded host/owner/repo (or base URL) still matches `git remote -v`. Compare the host/owner/repo path alone, ignoring userinfo such as `https://user:TOKEN@host/owner/repo.git`. Report the remote with any userinfo stripped, never verbatim. A document naming no such fact (an "Other" backend written as prose) reports consistent once confirmed present. |
| `documentation.md` | A `## Writing standard` naming a repo-relative path still resolves to a file, and each `## Audit set` glob still matches at least one file. |
| `knowledge-base.md` | A local `docs/kb/` path still exists. A configuration carrying `- **Body format:** storage` whose `### create` template never reads `parentId` is drift: name the Confluence seed's `### create` template (`references/knowledge-base-confluence.md`) as its replacement. A software backend records no other local fact, and reports consistent once confirmed present. A `## Commands` command naming an environment variable that starts with `SUPERDEV` and `_KB_` joined is a seed gap: name it and offer the seed's current command for that verb. |

**A leftover rules directory.** Applies to a `.claude/rules/` directory holding at least one `.md` file. Report its path and how many `.md` files it holds. Name `docs/invariants.md` as where the content belongs. State that the move is by hand.

- An absent `.claude/rules/`, or one holding no `.md` file, gets no line.

### Seed gaps

**The comparison.** Applies to each present document, beside its verdict. Compare it with its **seed** (CONTEXT.md) and list its **seed gaps**. The comparison reads the installed plugin's files and the document only.

- **The seed** is the one for the backend the document records, read from `${CLAUDE_PLUGIN_ROOT}/references/`: `issue-tracker-<backend>.md`, `issue-tracker-<backend>-plan.md` for `issue-tracker-plan.md`, `code-management-<host>.md`, `documentation.md`, `knowledge-base-<backend>.md`, `deployment.md`.
- **A knowledge-base document recording a Forgejo, Codeberg, Gitea, or GitHub wiki** maps to its own seed, whoever wrote it: `knowledge-base-forgejo.md` for the first three, `knowledge-base-github-wiki.md` for GitHub, never the other's.
- **An absent `issue-tracker-plan.md`** beside a present `issue-tracker.md` with a seed is one seed gap of the store document: name the `-plan` seed and the store-document sections that move into it (§3's **An absent plan document**).
- **No matching seed** reports `no seed to compare`: an "Other" prose backend, a `None` knowledge base, a `documentation.md` recording the user's own convention, `toolchain.md`, and `verification.md`. The last two keep the fact checks.

**Matching.** Applies to a document with a seed. Pair each seed section with the document section that does the same job, whatever its heading. A seed gap is a seed section with no matching document section, or a seed rule that a matched section lacks or contradicts. List each by the seed's name for it, with the document section it belongs under.

- A document's `## Outline` matches the Confluence seed's `## Audience, language & outline`.

**A replaced rule.** Applies to a rule the current seed replaced. Such a rule is a contradicted rule. List it as a seed gap under the seed rule it contradicts, never as a stale deviation or a section only the document carries.

- A knowledge-base outline entry holding a placeholder (`<...>`, such as `How it works: <mechanism>`), or an outline lacking the rule, contradicts the seed's **Every outline entry names a topic page** rule. Explicit entries that differ from the seed's example entries are filled-in values, no gap.
- A slice-store close that strips no status label contradicts the seed's **Close an issue** rule: a bare `tea issues close <index>` (Forgejo), a bare close `PATCH` (GitHub, the abandoned `not_planned` close included), or a bare `merged` transition where the ready marker is a label (Jira). The triage record's **Close it** call is no such close.

**No gap.** Applies to a difference of these kinds: a renamed heading, a filled-in value where the seed carries a placeholder, setup-facing instruction text, and a section only the document carries. List none of them as a gap. A document with no seed gap says so.

**`## Seed deviations`.** Applies to a document carrying the section, the document's record of a gap the operator declined. Each bullet is `- Seed deviation: <seed section or rule, as the seed names it> — <the operator's reason> (<YYYY-MM-DD>)`. List a gap a bullet names as `recorded`, with the bullet's reason.

- A bullet never takes a configuration-key shape (`- **Backend:**`, `- **Body format:**`), because `scripts/publish-kb.js` matches those anywhere in `knowledge-base.md`.
- The section itself is a section only the document carries.

**A stale deviation.** Applies to a bullet that names no rule in the current seed, matched by concept as a gap is. List it per document as a **stale deviation**, by bullet text, never as a gap. Delete no bullet.

**The report.** Applies at the end of `check`. Report the verdicts and seed gaps. Name at the end the plugin version compared against, the `version` in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Then stop.

- A plain `/superdev:setup` re-run offers each gap (§3).

## 1. Explore

Applies to the full interview. Scan these before any decision:

- `git remote -v` and `.git/config`: GitHub, GitLab, or a self-hosted host (Forgejo/Gitea).
- `docs/agents/`: prior superdev config. If present, offer to update rather than duplicate, by §3's re-run.
- `CLAUDE.md` / `AGENTS.md` at the root: which exists, whether it holds an `## Agent skills` section, and whether an `AGENTS.md` hierarchy is present (child `AGENTS.md` files in subdirectories).
- **Toolchain**, feeding decision **F**:
  - **build and package manifests**, giving the package manager and its scripts: `package.json` (with its lockfile or `packageManager` field → npm/pnpm/yarn/bun), `*.sln`/`*.csproj`/`nuget.config`, `pom.xml`, `build.gradle(.kts)` (with `gradlew`/`mvnw` wrappers), `pyproject.toml`/`poetry.lock`/`uv.lock`, `Cargo.toml`, `go.mod`, a `Makefile`, …
  - **formatter and linter configs**: `.editorconfig`, `.prettierrc*`, `.eslintrc*`, `rustfmt.toml`, `.clang-format`, `.rubocop.yml`, …
  - **style-prose docs**: `CONTRIBUTING`, `CODING.md`, `STYLE.md`, and any coding-guideline section in `CLAUDE.md`/`AGENTS.md`.
  - **a monorepo**: several package roots or languages side by side, each noted as its own workspace.
- **Deployment**, feeding decision **G**: a candidate deploy target in the same manifests, such as a `deploy:<name>` script in `package.json` or a `Makefile` `deploy` target.

## 2. Decide (one at a time)

**Each decision.** Applies to every decision below. Give a one-line explainer, every choice, and a proposed default inferred from the remote, per `${CLAUDE_PLUGIN_ROOT}/references/cross-exam.md`'s recommended-answer and live-options rules. Each alternative's description states what choosing it saves, or why it does not fit this repository.

- With `AskUserQuestion`, mark the default `(Recommended)`.

### A — Slice store

**The choice.** Applies to decision A: where do slices and plans live?

| Choice | Seed | Ask |
|---|---|---|
| **GitHub Issues** | `references/issue-tracker-github.md` | owner/repo, the feature label, and the **env-var name** for the API token (never the secret) |
| **Forgejo / Codeberg Issues** (Forgejo or Gitea, Codeberg included; hint: a `codeberg.org` or self-hosted Forgejo/Gitea remote) | `references/issue-tracker-forgejo.md` | host/owner/repo and the feature label, and no token env var. Take **The tea check**. |
| **Jira** | `references/issue-tracker-jira.md` | base URL, project key, the issue types per role, the "is blocked by" link type, the ready status or label, and the **env-var names** for the API token and email (never the secrets) |
| **Other** (GitLab Issues, Linear, …) | none | a paragraph describing create, read, list, update, and the dependency-link mechanism; write `issue-tracker.md` from that prose |

**The tea check.** Applies to a Forgejo slice store. Check that `tea` is installed. Check that `tea login list -o json` has an entry whose `url` equals the host.

- No `tea`, or no such entry, stops the step with the `tea login add --url <host>` command for the operator to run.
- Two or more such entries are named, and the operator picks.

**Trust boundary.** Applies to decision A. Tell the operator that an implementer executes slice specifications from this store as build instructions.

- Keep write access to the tracker (or the feature label) restricted to trusted authors.
- Run `/superdev:implement` only on slices the run owner authored or approved.

**The status map.** Applies to Jira and Other, whose statuses no seed fixes. Probe or ask for the available statuses and transitions. Agree a status map from superdev's lifecycle (`todo` → `in-progress` → `in-review` → `merged`/done, plus `blocked`) to the tracker's statuses, with how to perform each move (transition name or id, or CLI verb). Record it in `issue-tracker.md`.

- A missing state (no separate `in-review` or `blocked`) maps to the nearest sensible status with the collapse noted.

**Jira issue types.** Applies to Jira. Record the issue types per role (scope anchor, slice, triage record) as `<name> (id <id>): <use for>` in the seed's per-role bullets.

- Probe `GET <base>/rest/api/3/issue/createmeta/<PROJ>/issuetypes`, paging on `startAt`/`maxResults`/`total` until every type is read.
- Offer the anchor role only types with `hierarchyLevel` 1, and the slice and triage roles only types with `hierarchyLevel` 0 and `subtask: false`.
- Ask which types the operator allows per role, the first being the role's default, each with a one-line "use for" in the operator's words. Finish no role without a type.
- A failed or denied probe is reported with its HTTP status, and setup asks for the types by name and id.

**Jira component.** Applies to Jira. Ask for the optional **repository component** (CONTEXT.md → *Repository component*). List `GET <base>/rest/api/3/project/<PROJ>/components`. Offer each component plus `none`, which writes no bullet and changes nothing.

- A failed or denied listing is reported with its HTTP status, and setup asks for the component by name or `none`.
- Before writing the `Repository component` bullet, list the repository's open superdev issues lacking it: open issues with `component is EMPTY` (the seed's JQL transport) whose feature label matches `<type>/<slug>`, whose triage label or `[triage] ` summary prefix marks a triage record, and whose type a role allows. Show them and offer to add the component to each (`{"update": {"components": [{"add": {"name": "<component>"}}]}}`, sent through the seed's transport rules). The operator chooses which.

**The release signal.** Applies to any issue backend. Ask what marks a ticket ready for work here: a label (`released`, `ready-for-work`), a status, or a board column. Record the signal as a `## Release` section in `issue-tracker.md` (`plan-contract.md` → *Release*), with the calls that **apply** it (`/superdev:plan`) and **read** it (`/superdev:implement`, `/superdev:status`). State these two properties back to the user:

- It sits on the **scope anchor**, the epic or a single-slice feature's lone issue.
- It **survives the lifecycle moves** `/superdev:implement` makes, so the status map's `ready` label cannot be the signal. Propose a separate label.

**The assignee.** Applies to any issue backend. Capture the account every issue `/superdev:plan` creates is assigned to (`assignee.md` → *Assignee*). Propose the API token's own identity, resolved from the backend's whoami: the matched `tea` login's `user` on Forgejo/Gitea, `GET /user` on GitHub, `GET /rest/api/3/myself` on Jira.

- Accept a different account that can be assigned there (a repo collaborator, an assignable project user).
- Accept `none` to create issues unassigned.

**The assignee write.** Applies to an assignee answer. Make an operator-file write, never a write to `issue-tracker.md`:

```json
{
  "issue-tracker": { "assignee": "<the answer, or \"none\">", "displayName": "<the account's name>" }
}
```

- **The display name.** For an answer other than `none`, look it up by its identifier: Forgejo/Gitea `tea api -i /users/<login>` and its `full_name`, reading the HTTP status from stderr, not the exit code; GitHub `GET /users/<login>` and its `name`; Jira `GET /rest/api/3/user?accountId=<accountId>` and its `displayName`. A status other than 2xx is a failed lookup. `/superdev:plan` assigns by `assignee` alone.
- **The merge.** Set `issue-tracker.assignee` and `issue-tracker.displayName`. An empty or null name, a failed lookup, or `none` removes `displayName`. Report a failed lookup in one line and continue, since the assignee is written either way.
- **The report.** Say the path written and that the file is untracked.
- **Declining** leaves no file. An absent file resolves to the token's own identity.

### B — Code host

**The choice.** Applies to decision B: where does code live and where do PRs go? It is independent of A.

| Choice | Seed | Ask |
|---|---|---|
| **GitHub** (`gh`) | `references/code-management-github.md` | |
| **Forgejo / self-hosted** (`tea`) | `references/code-management-forgejo.md` | base URL and owner/repo, and no token env var. Take the slice store's **The tea check** for the base URL, and check that `jq` is installed. No `jq` stops the step the way no `tea` does. |
| **Other** (GitLab, …) | none | a paragraph describing push, open-MR, and base computation |

**Posture and base.** Applies to every code host. Confirm the **default PR posture** (`draft` recommended | `ready` | `push-only`) and the **base branch** (default `main`).

**The push bound.** Applies when the operator asks for a push bound other than 60000 milliseconds. Write `code-host.pushTimeoutMs` by an operator-file write (`assignee.md` → *Assignee*).

- An operator naming no bound gets no key.

### C — Documentation (in-repo)

**The convention.** Applies to decision C. Propose an **`AGENTS.md` hierarchy** (walk before editing, update the affected `AGENTS.md` after meaningful changes, keep it concise and current), seed `references/documentation.md`. Capture a user's different convention as prose.

**The writing standard.** Applies to decision C, next. Ask for the prose style the doc agents apply, and record the answer as the `## Writing standard` section of `docs/agents/documentation.md`.

- **`controlled`** (recommended): the language-neutral rule set `references/controlled-prose.md` (active voice, a sentence-length cap, one name for one thing, no hedging or marketing adjectives, in the docs' own language).
- **A repo-relative path**: the project's own style guide, which the agents read.
- **`none`**: no standard.

**Declare per language.** Applies to `controlled`. Point the user at the standard's *Declare per language* section and record the repository's answers (spelling convention, compound formation, number format) under a `### Declare per language` heading in `docs/agents/documentation.md`.

**The audit set.** Applies to decision C, last. Scan for directories holding markdown that the default tree does not reach. Offer what you found for the user to edit. Record it as the `## Audit set` section of `docs/agents/documentation.md`, one repo-relative glob per bullet.

- The default tree is the `AGENTS.md` hierarchy, `README.md`, `CONTEXT.md`, and the local knowledge-base pages.
- Nothing outside the default tree writes no section.

### D — Knowledge base (optional)

**The choice.** Applies to decision D: is there a knowledge base for durable, reader-facing topic pages, each holding one subject a reader looks up?

- **Knowledge base software**, such as **Confluence** → **Confluence**, or **Other wiki** for a different one.
- **Forgejo / Gitea repo wiki** (`tea`, Codeberg included) → **Forgejo wiki**.
- **GitHub repo wiki** (`gh`, GitHub Enterprise included) → **GitHub wiki**.
- **Local file storage**: markdown under `docs/kb/`, seed `references/knowledge-base-local.md`.
- **None**: the in-repo docs are the only record.

**Confluence.** Applies to Confluence, seed `references/knowledge-base-confluence.md`. Ask the base URL, the space key (it fills `<SPACE>`), what to publish, an optional parent page or folder id (it fills `<parent-id>`, empty when none), and the **env-var names** for the API token and email (never the secrets). Record the space key with the space id from `GET <base>/api/v2/spaces?keys=<key>`.

- Check a parent id read-only with `GET <base>/api/v2/pages/<id>`, then `GET <base>/api/v2/folders/<id>` when that finds no page.
- Ask again for a parent id neither call finds.
- The seed's `- **Body format:** storage` bullet needs no question.

**Other wiki.** Applies to a different wiki. Capture the backend command contract below. Ask whether its page bodies are markdown, and record `- **Body format:** <value>` only when they are not. Record a `## Staging` section stating that `/superdev:publish-kb` is the only caller of this backend, and that `/superdev:document` stages its pages.

- Tell the operator that a backend declaring no `delete` template leaves every `action: delete` staged page unpublishable.

**Wiki templates.** Applies to a Forgejo, Gitea, or GitHub repo wiki (**Forgejo wiki**, **GitHub wiki**). The seed carries all five templates, so ask no per-verb template question. **The probes** still run. A probe exit `2` (on Forgejo a disabled or external wiki, on GitHub a wiki with no page yet): report the cause the template wrote to stderr, and leave `## Commands` unwritten.

**Forgejo wiki.** Applies to a Forgejo or Gitea repo wiki, seed `references/knowledge-base-forgejo.md`. Ask the base URL and owner/repo. Fill every `<host>` and `<owner>/<repo>` placeholder with the base URL in the form `tea login list` reports (scheme included, no trailing slash) and owner/repo. Check `tea`, a `tea login list -o json` entry whose `url` equals the base URL, and `jq`, as the Forgejo code host does.

- A missing one stops the step with its fix: install `tea` or `jq`, or run `tea login add --url <base URL>`.

- **The tea login.** Write it to `knowledge-base.teaLogin` by an operator-file write before the probe, which reads it from the file as `/superdev:publish-kb` does. Propose the one matching entry's name, and ask which when several match. Unset with several matches, every template exits `2` with "several tea logins".

**GitHub wiki.** Applies to a GitHub repo wiki, seed `references/knowledge-base-github-wiki.md`. Ask the host and owner/repo. Propose both from the git remote (`git@<host>:o/r.git`, `https://<host>/o/r(.git)`, `ssh://git@<host>/o/r`) with `.git` stripped and `github.com` as the default host. With several remotes, ask which. Fill every `<host>` (bare host, no scheme) and `<owner>/<repo>` placeholder with the answers. Check `gh`, `gh auth status --hostname <host>`, and `jq`.

- A missing one stops the step with its fix: install `gh` or `jq`, or run `gh auth login --hostname <host>`.
- **The probes.** Run the find probe and skip the second auth probe, since the `gh` login is the credential.

**Audience and outline.** Applies to a software or local knowledge base. Shape it for human readers first and agents second.

1. **Audience** (multi-select): end-users, internal developers, ops/support, stakeholders. Record the list.
2. **Language**: the single natural language KB prose is written in. Code and in-repo docs keep theirs.
3. **Outline**: scan the README and top-level structure, and propose a top-level section per audience with a few explicit topic entries under each, each naming one page by its exact title (*User Guide → Getting started, FAQ*; *Developer Docs → Architecture, Setup*). Propose no placeholder entry and no page per feature, and carry the seed's **Every outline entry names a topic page** rule. Discuss and adjust with the user, and record the agreed outline in `knowledge-base.md` as the skeleton `/superdev:document` extends.
4. **A Forgejo or GitHub wiki outline** names a root page with no parent, gives each entry its parent page and the section in that parent, and records the seed's link line form (the `**Links.**` line of the wiki's own seed) under the wiki's own URL.

**The command contract.** Applies to a remote backend other than a Forgejo or GitHub wiki. Ask, verb by verb, for the shell command each of `find`, `read`, `create`, `update`, and `delete` runs. Write each under a `## Commands` section of `knowledge-base.md` as a `### <verb>` subsection holding one fenced `sh` block.

- Leave a verb the backend has no use for absent.
- Every command runs as `sh -c <template> sh <path>`, where `$1` names a JSON values file the template reads with `jq`.
- Check that `jq` is installed for every remote backend. A missing `jq` stops the step with its fix (install `jq`) and leaves `## Commands` unwritten.
- State every value to the user: `title` reaches every call; `bodyFile` (a path to the staged body, never the body inline) reaches `create` and `update`; `parentId` reaches `create` when the page names a parent; `found` (the `find` template's JSON object, types kept) reaches `read`, `update`, and `delete`; `operator` (the `knowledge-base` section of the operator file, `{}` when absent) reaches every call.
- Name two `found` keys: an optional `sub_url`, the page's address, from which `/superdev:publish-kb` fills a `parent-link` target's `{sub_url}` placeholder, and an optional `type`, whose value `folder` marks a container, so `/superdev:publish-kb` refuses an upsert or delete and names the folder.
- `find` exit `0` with a JSON object on stdout means the page exists, exit `3` means it is absent, and anything else means the backend could not answer.

**The probes.** Applies before `## Commands` is written for a remote backend. Run `find` with a values file whose `title` cannot exist (a random UUID), requiring exit `3`. For a backend whose auth is an environment variable, run `find` again with that variable set to a value that cannot authenticate, requiring an exit other than `0` and `3`. Leave `## Commands` unwritten until both pass.

- Report any other outcome, fix the template, and run the probe again.
- A backend whose auth is no environment variable (a CLI login) skips the second probe, and setup tells the operator so.

**The probe bound.** Applies to each `find` probe of **The probes**. Pass the Bash tool's `timeout` parameter, set to 30000, or to `knowledge-base.timeoutMs` of the operator file when set, both in milliseconds. State the bound to the operator while capturing the templates.

- A probe that exhausts the bound is a probe failure.
- Record `knowledge-base.timeoutMs` by an operator-file write when the operator asks for a bound other than 30000.

**A re-run's templates.** Applies when `knowledge-base.md` already carries `## Commands`. Show the delta between the newly captured templates and the existing ones. Keep the operator's template for a verb unless they choose to replace it.

**The aggregate question.** Applies to a remote backend whose page bodies are markdown and whose `## Commands` holds a `### read` subsection. Ask which pages **aggregate**: a page many scopes each contribute one section to (an index, a changelog, a glossary), naming any digest or index page in the outline. Mark each answer in the outline with `(aggregate)` and pin the heading level its sections take (e.g. `## <concept>`).

- **None aggregate** marks nothing.
- Every other backend (no `### read`, a non-markdown `- **Body format:**`, a local `docs/kb/`) skips the question and marks nothing.

### E — Verification (optional)

**The full command.** Applies to decision E. Ask for the single command that runs the repository's test suite (`npm test`, `pytest -q`, `cargo test`). Detect a likely one from the §1 scan (package.json scripts, a Makefile `test` target, `pyproject.toml`), and propose it.

- **No suite** (a docs-only repository) skips this question, and nothing runs a suite. The fail-to-pass floor, focused, timing, and test-paths questions are skipped too.

**The fail-to-pass floor.** Applies to a repository with a full command, when the operator asks for a floor other than 10000 milliseconds. Write `verification.failToPassFloorMs` by an operator-file write (`assignee.md` → *Assignee*).

- An operator naming no floor gets no key.

**The focused command.** Applies to a repository with a full command. Read `references/test-selection.md`, which owns the contract. Derive the focused command from the full one and the runner the §1 scan detected, and write it on the user's confirmation.

- **A runner that maps source files to their tests** gets a `{paths}` form with its pass-with-no-tests flag: `npx vitest related --passWithNoTests {paths}`, `npx jest --passWithNoTests --findRelatedTests {paths}`.
- **A runner that maps nothing** gets a `{paths}`-less form, never a `{paths}` form:
  - **a fixed fast subset**, the unit tests without the slow integration tests (`pytest tests/unit`, `go test ./internal/...`, `cargo test --lib`);
  - **a self-detecting runner flag** with the runner's pass-with-no-tests flag: `npx vitest --changed --passWithNoTests`, `npx jest -o --passWithNoTests`.

**No cheaper subset.** Applies to a repository with a suite whose full suite is **already cheap**, or where **no cheaper subset exists** because every test is slow. A repository with a suite never reaches `none`. Ask which case applies. Record the answer as prose beside a second fence carrying the full command again. A runner that maps nothing takes the fast subset instead.

**The complete selector.** Applies to a focused command carrying `{paths}`, once it is settled. Ask whether it selects every test any changed path can affect. Name what a yes trusts: gates then skip the full suite and carry a green suite record across a change the focused run covered (`references/test-selection.md`'s `## Complete selector`). A yes writes the `## Complete selector` section, listing as items each selector file the operator names (a runner script, a mapping config).

- A no, or no answer, writes no section.
- **A slow full suite.** Ask roughly how long the full suite runs. Where it runs for several minutes or more, recommend the declaration: review's and ship's gates then carry a green record across a covered change, and a failed full run's fix cycle carries by rerunning the repaired test files and the focused command.
- A re-run on a `verification.md` without the section asks once. One with the section asks nothing.

**The test paths.** Applies to a repository with a full command. Propose the glob patterns naming its test files: the defaults `references/test-selection.md`'s `## Test paths` lists, plus the directories and file patterns its test command and manifests name. Write the operator's answer as that section's **unfenced** list.

- No test command proposes no test paths and writes no section.

**The prepare command.** Applies to a repository with a full command. Read `references/test-selection.md`'s `## Prepare command`, which owns the contract. Propose the one command that makes a new worktree ready to run the tests, derived from the manifests and lockfiles the §1 scan found (a `bun.lock` with workspaces, a `pnpm-lock.yaml`, a `*.sln` to restore), each tool's form verified against its official docs (`references/doc-verification.md`), or `none` where a fresh checkout runs the tests as it stands. Settle it before **The affected form**.

- **Try a proposed command first.** Create a probe worktree as **The probe worktree**'s steps 1 and 2 place it, run the command once at its root, then run `git status --porcelain --untracked-files=no` there, and remove the worktree as its step 7 does, on every exit path. Running it is no test run.
- **A run that fails, or that changed a tracked file** (the status lists a path; the fresh worktree held none) → show the command, its exit, each path the status lists, and the tail of its output. Write it only on the operator's confirmation. A corrected command goes through the same run in a new probe worktree.
- **`none`** runs nothing and is written on the operator's confirmation.
- A re-run on a `verification.md` without the section asks once. One with the section asks nothing.

**The affected form.** Applies to a monorepo's full command. Identify the tool that owns the dependency graph (nx, turborepo, pnpm, or `dotnet-affected` over an MSBuild project graph). Verify its affected syntax against its official docs (`references/doc-verification.md`) before proposing it. Write no unverified form.

- `check` mode and sweep's chained setup leg ask nothing here.
- Plain Bun/npm/yarn workspaces with no such tool have no affected mode.
- **The tool is installed** → propose its affected form against the base branch `docs/agents/code-management.md` records, with the **whole-repo command** beside it (the same tool's whole-suite invocation), and validate it by **The probe worktree**.
- **The tool is not installed** → name it and its official install command, and write no affected form until it is installed and every query passes.
- **No tool owns an affected mode** → keep the whole-suite full command and record the reason as prose beside the second fence.

**No test run.** Applies to every configuration of this skill. Setup runs no test command and never starts the affected form or the whole-repo command. Running the prepare command in a probe worktree is no test run.

**The probe worktree.** Applies to an installed affected-mode tool, before the affected form or whole-repo command is written. Run read-only tool queries in a throwaway worktree, in the order below, each step's conditions holding from that step on. Take each query's syntax from the tool's official docs (`references/doc-verification.md`). Turn remote caching off: `NX_NO_CLOUD=true` (nx), `--cache=local:rw` (turborepo), and for any other tool its own docs' switch.

- The probe edits no tracked file of the checkout and pushes nothing. Its commit stays unreferenced and no branch exists.

1. **Location.** `.superdev/probe-<random>` inside the repository's main checkout, after ensuring `.superdev/` is in `.gitignore`, so module resolution reaches the checkout's own `node_modules`.
2. **Create it.** `git worktree add --detach <dir> <base-tip>`. Then run the settled prepare command at its root, directly, since the base tip's `verification.md` has no section yet. A failing run, or one after which `git status --porcelain --untracked-files=no` lists a path, is **A failed query**.
3. **Edit and commit.** Edit one tracked source file of a leaf project the tool lists (one with no dependents, where it can tell) and commit it with `git -c core.hooksPath=/dev/null -c commit.gpgsign=false commit`, adding `-c hook.<name>.enabled=false` for each `<name>` that `git config --name-only --get-regexp '^hook\..+\.(command|event)$'` lists as `hook.<name>.command` or `hook.<name>.event`, so a config-based hook (as hk installs them), which `core.hooksPath` does not reach, runs neither. A probe commit that fails is reported and nothing is written.
4. **List query.** List the projects the form selects on that commit, with the form's base: `nx show projects --affected --base=<base> --head=HEAD`, `TURBO_SCM_BASE=<base> turbo ls --affected`, `pnpm ls --filter "...[<base>]" --depth -1`, or `dotnet affected describe --from <base>` (stdout, no file written; exit 166 means nothing changed). A form selecting no project is not written: say that it selects nothing on a real change, and that the base is the suspect.
5. **Target query.** Query whether the form's target exists on the selected projects: `nx show projects --affected --base=<base> --head=HEAD --with-target <target>` (the option table spells it `--withTarget`, the examples `--with-target`), `TURBO_SCM_BASE=<base> turbo run <task> --affected --dry=json --cache=local:rw`, for pnpm a read of each selected project's `package.json` `scripts` field, and for `dotnet-affected` no query, since it has no target concept. A target on no selected project means the form is not written: say so, and name the likely cause (the target name matches no project task).
6. **Empty-change exit.** State how the form exits when the change reaches no project, from the tool's docs (dotnet-affected exits 166, so the form maps that exit to green). Where the docs are silent, say so and ask the operator to state the exit. The operator confirms the stated exit before the form is written.
7. **Remove the worktree.** On every exit path, at whichever step setup stops, an operator answer included: `git worktree remove --force <dir>`. `git worktree prune` cleans up after an interrupted run.
8. **Write.** The affected form and its whole-repo command are written only after steps 4, 5, and 6 pass, or after the operator's answer below.

**A failed query.** Applies to a query that fails, cannot run (dependencies uninstalled in the fresh worktree), or cannot decide. Take no guess. Remove the worktree, and ask the operator to write the form as is, give a corrected form, or keep the whole-suite full command. Write nothing before the answer.

- A corrected form goes through steps 1 to 6 in a new probe worktree, which step 7 removes.
- Every answer that writes a form passes step 6 first.

**The timing command.** Applies to a repository with a full command. Read `references/test-selection.md`, which owns the contract. Derive the proposal from the full command and the detected runner (`vitest --reporter=verbose`, `pytest --durations=0`, `go test -v ./...`, or the full command alone where the runner times only the whole suite). Write the section on the user's confirmation.

- **A runner reporting no durations** records no section, with the runner stated as the reason in prose.
- **A user who declines** records no section either: ask what makes that right here, and record the reason as prose (a suite finishing in seconds is one).

### F — Toolchain (optional)

**The profile.** Applies to decision F. From §1's scan, propose the package manager, the build, lint, format, and release commands agents should use, and pointers to the linter and formatter configs and style-prose docs. Record pointers, never copied rules.

- **Describe each command by intent.** Infer the conventional ones (`test` → unit tests, `test:integration` → integration tests, `lint`, `format`, `build`, a `release` or publish script).
- **Ask about an unclear component.** A script, task, or binary whose intent you cannot infer (a `make-it-so` script, an opaque MSBuild target, an unknown `compiler.exe` in `./bin`) gets "is this relevant, and if so what for?", and the answer is its description.
- **Note orphaned tooling.** A formatter or linter config no command runs (a `.prettierrc` with no `format` script and prettier not a dependency) is noted "not wired / not enforced", without grading it and without asking the user.
- **`test` defers to E.** The toolchain doc points at `docs/agents/verification.md` and restates no test command.
- **Skip only when fully empty.** No manifest, no config, and no style doc writes no `toolchain.md`. Any detection writes it.

### G — Deployment (optional)

**The posture.** Applies to decision G, seed `references/deployment.md`. Ask for one posture for the whole repository: `none` (nothing deploys), `manual` (the operator deploys outside superdev; `/superdev:ship` prints each target's command and records it pending), or `auto` (`/superdev:ship` runs each target's command after the merge, in a tree checked out at the merge commit, and only then). Propose `manual`, and list `auto` as opt-in only.

- Write `auto` only when the operator picks it.

**The targets.** Applies to `manual` and `auto`. Offer §1's scan as candidates. For each one the operator confirms, ask its name, the command that deploys it, and a **read-only** way to reach it (a URL, a health check, a status command). Zero confirmed targets writes the posture with an empty targets table.

- Under `auto`, say when asking that the command runs in a tree detached at the merge commit that may carry ignored files from the run (installed dependencies, build output). The command must not rely on their presence or absence, and installs and builds what it needs itself.

**`none`.** Applies to `none`. Ask nothing else.

## 3. Confirm, then write

**The draft.** Applies to the full interview. Show the user a draft of every file and the `## Agent skills` block, and let them edit before writing.

**The writes.** Applies once the draft is confirmed.

- `issue-tracker.md`: the chosen seed with the specifics filled in, or the user's prose for Other.
- `issue-tracker-plan.md`: the chosen backend's `-plan` seed with the same specifics filled in. For Other, the part of the user's prose that creates issues, records dependencies, and assigns them.
- `code-management.md`: the same, from the chosen host seed.
- `documentation.md`: from `references/documentation.md`, or the user's convention as prose. It always carries `## Writing standard` with decision C's answer, `none` included. It carries `## Audit set` only when decision C named documentation outside the default tree.
- `knowledge-base.md`: the chosen KB seed filled in, or the Other prose. **None** writes a one-line file stating there is no separate KB, or skips the file. A remote backend carries decision D's `## Commands`, written only once the probes passed, with a re-run's verbs per **A re-run's templates**.
- `toolchain.md`: decision F's profile, by **The toolchain document**.
- `verification.md`: by **The verification document**. Skip the file when there is no suite.
- `deployment.md`: from `references/deployment.md`, decision G's posture as a `` `Posture:` `` line under `## Posture` and the confirmed targets table, empty under `none` or with none confirmed. A re-run shows the delta against the existing targets and writes only what the operator changed.
- The `## Agent skills` block, by **The Agent skills block**.

**The toolchain document.** Applies to `toolchain.md`. Write freeform markdown with one section per workspace (one section outside a monorepo), each command an intent phrase and its invocation, omitting absent categories.

- **A re-run** re-scans and reconciles: add new elements, update changed ones, drop removed ones, keep the human-authored descriptions of components that still exist, re-ask only about newly unclear ones, and show the delta before writing.

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

**The verification document.** Applies to `verification.md`. The first fenced block is the full command. A second fenced block always follows: decision E's focused command, or the full command again for the already-cheap and cannot-narrow cases. Record the reason for the second fence's content beside it as prose outside any fence.

````markdown
# Verification

```sh
npm test
```

```sh
npx vitest related --passWithNoTests {paths}
```
````

The suite already cheap, or a runner that cannot narrow (the prose names which):

````markdown
# Verification

```sh
go test ./...
```

```sh
go test ./...
```

**No cheaper focused command, deliberately.** This suite finishes in seconds, so every caller runs the
full command except a test-first step, which runs its own test file (`references/test-selection.md`).
````

**The verification sections.** Applies to `verification.md`, after the fences. A command inside these sections takes a backtick span, never a fenced block.

| Section | Written when | Form |
|---|---|---|
| `## Timing command` | decision E settled one | its command in a backtick span. No timing command writes E's one-line reason as prose in its place. |
| `## Complete selector` | the operator's explicit yes to E's selector question | `references/test-selection.md`'s format: an unfenced list, one backtick-spanned path per item |
| `## Test paths` | decision E settled them | `references/test-selection.md`'s format: an unfenced list, one pattern per item. No test command writes no section. |
| `## Prepare command` | decision E settled a command or `none` | the command, or `none`, in a backtick span |
| `## Whole-repo command` | a monorepo whose full command took the affected form | its command in a backtick span. No affected form (no tool owns one, or the operator kept the whole-suite command after a failed query) writes no section. |

````markdown
## Timing command

`npx vitest run --reporter=verbose`
````

````markdown
## Complete selector

The focused command selects every test a changed path can affect.

- `scripts/run-tests.js`
````

````markdown
## Whole-repo command

`nx run-many --target=test --all`
````

````markdown
## Prepare command

`bun install --frozen-lockfile`
````

**The Agent skills block.** Applies to the root instruction file. Add the block to whichever of `CLAUDE.md` / `AGENTS.md` already exists, and create no other. Duplicate no existing block. If neither exists, ask the user which to create.

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

### Re-run: reconcile each document with its seed

**The reconcile.** Applies to a plain re-run on a configured repository, for every document whose backend stays the same. Show each document's seed gaps. Offer each gap on its own, with the document's current text beside the seed's and three choices.

- `toolchain.md`, the knowledge base's `## Commands`, and `deployment.md`'s targets keep their re-run rules above.
- **Apply.** A missing section goes in at its seed position relative to the matched neighbours. A missing or contradicted rule replaces or joins only that rule inside its section, and no old rule stays beside the new one. Every other section keeps the operator's text.
- **Record as a seed deviation.** Ask for the operator's reason and require one. Write §0's bullet into `## Seed deviations`, creating the section at the end of the document when absent. Change no other line.
- **Leave for later.** Write nothing. The gap is offered again next time.

**The operator's choice.** Applies to every gap and stale deviation. Write nothing without the operator's choice. List a recorded gap as recorded, and never offer it again.

- A re-run with no seed gaps asks nothing.

**A stale deviation on re-run.** Applies to each stale deviation (§0). Offer **Drop** the bullet or **Keep** it. A kept one is offered again on every later re-run.

**A gap with a repository value.** Applies to a gap whose seed text carries a repository-specific value. Ask the question §2 asks for it, and write the answer, never the seed's placeholder.

- Where §2 asks none, the seed section names the fill-in: the triage label, a repository filter for a store shared across repositories, a `(fill in at setup)` section such as `## Run state` or the status workflow.
- Applying a knowledge-base gap writes `## Commands` only after §2's **The probes** pass.
- Applying a seed's `## Assignee` writes no assignee into a tracked document; the answer goes to the operator file.

**The operator file on re-run.** Applies to every re-run. Read the operator file. An `issue-tracker.assignee` other than `none` with no `displayName` gets the display name looked up and written per decision A, with no question.

**An absent plan document.** Applies to a re-run where `issue-tracker.md` is present and `issue-tracker-plan.md` is absent. Offer it as one seed gap. **Apply** writes `issue-tracker-plan.md` from the `-plan` seed, filled in with the store document's values, carries over the operator's text of every store-document section that matches a `-plan` seed section (append mode, the assignee, issue creation, the anchor-line writes, the tag rewrite, writing slices), and removes those sections from `issue-tracker.md`. Every store-document `## Seed deviations` bullet naming a moved rule moves with it.

**A backend switch.** Applies to a re-run that changes a document's backend. Write the new seed fresh and carry no seed deviation over.

## 4. Done

**The report.** Applies at the end of the full interview. Tell the user these things:

- Setup is complete, and `/superdev:plan` and `/superdev:implement` now read these files.
- They can edit `docs/agents/*.md` directly.
- A re-run switches backends or picks up what a newer release added, by reconciling each document with its seed (§3).
- The operator file is theirs alone and travels with no clone, so a fresh checkout configures it again or falls back to the API token's own identity.

**Secrets.** Applies to every write. Record only env-var **names** for secrets, never token values. The operator file holds identifiers, display names, and time bounds only.

**No hierarchy.** Applies when §1 found no `AGENTS.md` hierarchy. Point the user at `/superdev:document`, whose bootstrap mode seeds the initial hierarchy and glossary from the existing code.
