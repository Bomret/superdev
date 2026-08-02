# superdev

An agent left alone will ship with confidence — whether or not anyone agreed what "done" means, whether
or not its own tests prove anything, whether or not the diff ever got a second look.

superdev makes it stop and check first.

**Before / after**

You ask your agent for a feature. Four hundred lines land across six files, the suite is green, a PR
opens. Nobody agreed what "done" meant before the first line was written, nobody but the model reviewed
it, and by the time a corner-cut surfaces, it's already merged.

With superdev: `/superdev:plan` interviews you until the Definition of Done is checkable,
`/superdev:implement` cuts the work into small slices, a separate reviewer subagent checks each one
before it merges, and a hook — not a prompt — blocks the merge outright if the suite goes red.

A self-contained Claude Code plugin for the full **brainstorm, plan, implement, review, document, ship**
loop, with **no prerequisite plugins**. It gives you interview-driven vertical slicing, an execution tier
sized to the plan, deterministic guardrails, and a pluggable slice store plus code host. A larger plan
runs in parallel in isolated git worktrees, with separate implementer and reviewer subagents. A small
plan runs test-first and inline.

```
/superdev:setup      → configure backends in docs/agents/*.md (once per repo)
/superdev:brainstorm → (optional) turn a vague idea into a plan-ready intent
/superdev:plan       → interview + slice a feature into the slice store
/superdev:implement  → drive the slices to merge onto the scope branch, then stop
/superdev:status     → read-only DAG progress snapshot for in-flight runs
/superdev:review     → whole-scope review against the DoD, with a fix loop
/superdev:document   → reconcile in-repo docs + knowledge base with the code
/superdev:ship       → tick the DoD, close the scope anchor, open the PR, and clean up
/superdev:afk        → sweep the planned backlog through the whole chain unattended
```

## What it does

- **`/superdev:brainstorm`** *(optional)*. A divergent discovery conversation that shapes a vague idea
  into a plan-ready intent. It explores candidate directions, finds the smallest end-to-end slice worth
  building, and surfaces open questions and rejected directions. It then hands off to `/superdev:plan`,
  which routes each rejected direction to a durable home. Near read-only: it writes nothing to the slice
  store.
- **`/superdev:plan`**. A relentless interview pins the intent and a Definition of Done, and captures
  ADRs and a glossary as decisions surface. It then decomposes the work into **independently-green
  vertical tracer-bullet slices** with explicit `depends-on` dependencies, written to the configured
  store. On an epic whose shape earns it, the command also draws a `## Slice graph` (the `depends-on`
  DAG), a `## Touch map` (parallel-slice file collisions), or both. Both are markdown, both are advisory, and
  [`references/plan-contract.md`](references/plan-contract.md) gates each one. The command also tells you
  the execution tier `/superdev:implement` will use for the final slice count (see below).
- **`/superdev:implement`**. The controller drives the slices as a **dependency-ordered DAG**, sized to
  an execution tier derived fresh from the loaded slice count. The tier is never configured and never
  persisted.
  With **more than 3 slices the tier is `full`**: unblocked slices run in **parallel** as `implementer`
  subagents in isolated worktrees, with TDD and lazy minimalism. A separate **slice-reviewer**
  (correctness) and **simplicity-reviewer** (over-engineering) gate each behavior slice, and the
  controller merges **serially**.
  With **3 or fewer slices the tier is `lite`**: the controller implements each slice inline and
  test-first, in a single dedicated **scope worktree** (`.superdev/scopes/<scope>/worktree/`). The
  invoking checkout is never switched, and a same-scope run lock guards against a second concurrent run.
  There are no per-slice worktrees and no per-slice reviewers.
  Either tier stops here, once every slice sits on the scope branch. `/superdev:review` runs next: one
  **whole-scope review** that gates the pull request `/superdev:ship` opens later.
- **`/superdev:status`**. A read-only snapshot of every in-flight `/superdev:implement` run in the repo:
  per scope, the slice counts by status and which slices are `blocked`. It never writes, transitions, or
  merges anything.
- **`/superdev:review`**. Two modes. Given an ad-hoc diff, branch, path, or the working tree, it needs no
  plan and no slice store, and it stays read-only end to end. Given a live scope branch, it is the
  whole-scope review gate in the implement chain: it checks the scope against that run's `dod.md`, and it
  can drive one fix loop after asking once. Either way it dispatches the same `final-reviewer` and
  `simplicity-reviewer` subagents and reports one consolidated verdict.
- **`/superdev:document`**. Dispatches the `doc-writer` to reconcile the in-repo docs (the `AGENTS.md`
  hierarchy) and the optional knowledge base with the current code. It adds what is new and **removes
  stale or obsolete** text. It then reader-tests the result: the fresh-context `doc-reader` reads the
  changed docs cold and verifies their claims against the repo. Ungrounded or stale text goes back to
  the `doc-writer` for one fix round. Both agents also apply a **content-type lens**
  ([`references/content-types.md`](references/content-types.md)): does a reader learn *why* a thing
  exists and *when* to use it, not only what it's called and how to run it. That check is always on,
  unlike the **writing standard**, which the repo may configure to `none`. Where a writing standard is
  configured, the `doc-writer` writes to it and the `doc-reader` verifies it. It is the third command of the
  four-command chain, run over the range `/superdev:review` hands it, and it also runs on demand at any
  time. On demand it does a full reconcile, a reconcile scoped to a range or area, or an `audit` for a
  reader-first check.
  Called empty on a **brownfield repo with no `AGENTS.md` hierarchy**, it **bootstraps** one instead. It
  seeds a root `AGENTS.md`, child files where they are warranted, and a proposed `CONTEXT.md` glossary,
  all from the existing code. It confirms them with you before anything commits.
- **`/superdev:afk`**. Sweeps the planned backlog with nobody watching. It takes each **eligible epic**
  through the whole chain, oldest first. Eligibility needs an open, unblocked epic with no live run on
  its scope, among other conditions `commands/afk.md` §2 states in full. It invokes
  `/superdev:implement`, `/superdev:review`, `/superdev:document`, and `/superdev:ship`, each carrying
  `--unattended`. That token is an argument to one invocation, not scope state. A stop with a **standing
  answer** takes it, and a stop with none **blocks** that epic and moves to the next. The sweep stops
  when no eligible epic is left, when two epics block in a row, or when `/superdev:ship` fails to reach
  the code host. It never asks a question and never starts an interview command.
- **`/superdev:setup`**. Records the backends in `docs/agents/*.md`, so the workflow never hardcodes a
  tool. For a knowledge base it also captures the **audience(s)** and **language**, and proposes a
  human-first outline. It asks which **writing standard** the doc agents write to. When it finds no
  `AGENTS.md` hierarchy in the repo, it points you at `/superdev:document`'s bootstrap mode to seed one.

## After the PR

`/superdev:implement` is a goal-based loop. It drives the DAG until every slice sits on the scope branch,
then **stops**. `/superdev:review`, `/superdev:document`, and `/superdev:ship` run next, in that order, and
carry the run the rest of the way to a pull request. The last mile, once the PR is open, is a time-based
loop, so hand review comments and CI on it to `/loop`:

```
/loop 5m check my PR, address review comments, and fix failing CI
```

To cap a long `/superdev:implement` run, wrap the call in `/goal`. Give it the Definition of Done as the
stop condition and an explicit turn ceiling (for example, "stop after N tries").

## Roles (subagents)

The subagents are `implementer`, `slice-reviewer`, `simplicity-reviewer`, `final-reviewer`,
`doc-writer`, and `doc-reader`. Each runs in an isolated context, and only its result returns to the
controller.

The **full** execution tier dispatches `implementer`, `slice-reviewer`, and `simplicity-reviewer` per
slice. The **lite** tier (3 slices or fewer) has the controller implement inline instead. Both tiers hand
off to the same chain once every slice sits on the scope branch: `/superdev:review` dispatches
`final-reviewer` and `simplicity-reviewer` over the whole scope, then `/superdev:document` dispatches
`doc-writer` to reconcile the docs, reader-tested by `doc-reader`. The doc reconcile always runs **after**
the review, and never concurrent with it, so the `doc-writer`'s commits cannot shift the diff the reviewer
read ([ADR 0003](docs/adr/0003-doc-reconcile-runs-serially.md)).

## Guardrails (deterministic hooks)

The hooks are cross-platform Node. Claude Code provides `node` as a runtime dependency, so there are no
bash or PowerShell variants.

- **merge-guard.** Blocks `git merge`, `git push`, and `git rebase` from inside a subagent, scoped by
  `agent_id`. The controller integrates.
- **model-explicit.** Blocks a dispatch to a superdev subagent that omits an explicit `model`, so cost
  is always warrant-scaled.
- **green-gate.** After a controller merge, re-runs the configured test command and blocks on a RED
  suite. "Tests pass on scope after merging" is therefore enforced and not merely prompted. The gate is
  inactive until `docs/agents/verification.md` records a test command, which `/superdev:setup` does.
- **run-lock.** Blocks a `git worktree add` on a scope worktree (`.superdev/scopes/<scope>/worktree`)
  while a fresh `.superdev/scopes/<scope>/run.lock` exists, so two concurrent lite runs on one scope
  cannot collide. A stale lock (older than the staleness threshold) or no lock at all passes through,
  which covers a crash resume and a new run.
- **worktree-sweep.** A `Stop` hook that removes each per-slice worktree and branch once its slice is
  fully merged. Finished worktrees therefore cannot pile up when the controller skips the prompted
  cleanup. It
  touches only merged `slice/*` worktrees under `.superdev/`, and leaves in-progress and reverted slices
  alone. A lite-tier run's single scope worktree is not a per-slice worktree, so this hook leaves it
  alone too. `/superdev:ship` removes it at the end of the chain.
- **scope-prune.** A `Stop` hook that deletes a scope's run root (`.superdev/scopes/<scope>/`, its
  `ledger.md` and `dod.md` post-mortem trail). It waits until the scope branch is merged, the run root has
  sat untouched for 7 days or more, **and** the ledger's `**Stage:**` line reads `shipped`. It never
  touches an unmerged scope, one whose worktree is still present, or one whose ledger is unreadable or
  silent on the stage.

A seventh Node hook, **update-check**, is a `SessionStart` *notice* rather than a guardrail. See
[Updating](#updating).

## Configuration and backends

`/superdev:setup` records your choices in `docs/agents/*.md`, one small doc per concern, so the commands
never hardcode a tool. Edit those files directly at any time. Re-run setup only to switch a backend.

- **Slice store.** Where a feature's plan lives: the global **Definition of Done** plus every vertical
  slice (`id`, `depends-on`, `test-applicability`, `spec`, `acceptance`). `/plan` writes it. `/implement`
  reads it, uses its slice count to derive the execution tier, and drives each slice to `merged`. As it
  goes it walks each issue along the tracker's status workflow, mapped at setup: dispatch moves it to
  in-progress, review moves it to in-review, and a merge moves it to done. The **lite** tier has no
  per-slice review, so it skips straight from in-progress to done.
  The choices are *local files* (a directory `docs/plans/<feature-slug>/` per feature, where `00-epic-*`
  holds the DoD and description and `NN-<test-applicability>-*` is one file per slice, with the number as
  the id, and which suits solo work or a repo with no tracker), *GitHub Issues* (each slice an issue and
  a sub-issue of its epic, with `depends-on` as a native `blocked_by` dependency), *Jira* (each slice an
  issue, with `depends-on` as an "is blocked by" link), and *other* (describe your tracker's CRUD and
  dependency link in prose). For any issue-backed choice, setup also asks who owns the created issues.
  That **assignee** is a login or an `accountId`, and it defaults to the API token's own identity, or to
  `none`. The answers go to `docs/agents/issue-tracker.md`.
- **Code host.** Where the scope branch is pushed and the PR or MR opens, plus the default posture
  (`draft`, `ready`, or `push-only`) and the base branch. The choices are GitHub (`gh`), Forgejo or
  self-hosted (`tea` or REST), and *other*. With no host CLI present, the step degrades to a push plus a
  printed compare URL and a ready-to-run command. The answers go to `docs/agents/code-management.md`.
- **Documentation (in-repo).** How durable technical docs are kept: an **`AGENTS.md` hierarchy**, where
  the root is project-wide and each child covers one boundary. `/plan` also records the glossary
  (`CONTEXT.md`), ADRs (`docs/adr/`), and path-scoped rules (`.claude/rules/`) under this convention, and
  `/document` reconciles it after a scope lands. This doc also names the **writing standard** the doc
  agents write to: `controlled` (the language-neutral rule set in
  [`references/controlled-prose.md`](references/controlled-prose.md)), a path to your own style guide, or
  `none`. The answers go to `docs/agents/documentation.md`.
- **Knowledge base** *(optional)*. A **separate, human-first** record for *readers* rather than agents:
  feature specifications, design overviews, and ADR summaries. It is distinct from the agent-first
  `AGENTS.md` docs. You pick the backend (Confluence, a local `docs/kb/`, other, or none), its
  **audience(s)**, its **language**, and an agreed **outline** that `/plan` and `/document` fill rather than
  reinvent. The answers go to `docs/agents/knowledge-base.md`.
- **Toolchain** *(detected)*. The repo's package manager and its build, lint, format, and release
  commands, plus style-doc pointers. Setup detects these rather than asking, because the toolchain is not
  a pluggable backend. It records one section per workspace, so agents use the right tools instead of
  rediscovering them. The `test` entry defers to Verification. The result goes to
  `docs/agents/toolchain.md`.
- **Verification** *(optional)*. The repo's test command. Recorded, it **arms the green-gate** hook,
  which re-runs the suite after every controller merge. Omitted, the gate stays inactive. The answer goes
  to `docs/agents/verification.md`.

To add a backend, write a new seed template in `references/` plus a config doc. No command and no agent
changes.

## What superdev writes to your repo

```
docs/agents/*.md          backend config — the six docs above (committed)
docs/plans/<feature-slug>/  slices + Definition of Done (local store): 00-epic-* = DoD + description,
                          NN-<test-applicability>-* = one file per slice (number = id)
CONTEXT.md                glossary / ubiquitous language, authored by /plan
docs/adr/NNNN-*.md        architecture decision records, authored by /plan
.claude/rules/*.md        path-scoped conventions the implementers auto-load, authored by /plan
docs/kb/                  knowledge base, only if the local-file KB backend is chosen
.superdev/scopes/<scope>/  git-ignored run scratch, namespaced per scope branch so parallel runs
                          don't collide: the concrete DoD + ledger (both execution tiers), plus
                          per-slice progress logs + the cross-slice interface record + per-slice
                          worktrees (full tier only, >3 slices), or a single scope worktree +
                          run.lock (lite tier only, ≤3 slices) — never committed, never in the PR
.superdev/brainstorm/<intent-slug>.md   git-ignored scratch intent notes, optionally written by
                          /brainstorm — sibling to .superdev/scopes/, not inside it, so /status (which
                          only scans .superdev/scopes/*/) never mistakes it for a run root; never
                          committed
```

Everything except `.superdev/` is committed. The design docs (the glossary, the ADRs, and the rules)
**must** be on the branch. Both tiers work from fresh worktree checkouts, and a checkout sees only what
is committed. On the full tier those checkouts belong to the per-slice `implementer` subagents. On the
lite tier the controller itself works in the scope worktree.

## Worked example

A tiny feature end to end, with the local-file slice store and GitHub as the code host:

- **`/superdev:setup`** (once per repo). A short interview, then `docs/agents/*.md` is written. The slice
  store is local files and the code host is GitHub (`gh`). The documentation convention is the
  `AGENTS.md` hierarchy, verification is `npm test`, and there is no knowledge base.
- **`/superdev:plan add a health-check endpoint`**. Interviews for the intent and a Definition of Done,
  then writes `docs/plans/health-check/`. That holds `00-epic-*` (the DoD and description) plus two
  slices, for example `01-behavior-route-handler.md` and `02-behavior-wire-into-router.md`, where the
  second `depends-on` the first. You see the slice list printed back, ready for `/implement`, along with
  the tier it will run under. Two slices is 3 or fewer, so the tier is **lite**.
- **`/superdev:implement health-check`**. Sets up `.superdev/scopes/health-check/`, the git-ignored run
  scratch holding the concrete DoD and the ledger. Two slices selects the **lite** tier. The controller
  cuts a single scope worktree at `.superdev/scopes/health-check/worktree/`, and never switches the
  invoking checkout. It implements slice 01 test-first in that worktree and commits. Slice 02 then
  unblocks and follows the same loop. There are no per-slice worktrees and no reviewer subagents. Once
  both slices sit on the scope branch, the controller **stops** and prints the resolved
  `/superdev:review` call. You see a one-line status per slice as it lands.
- **`/superdev:review <range>`**. Dispatches `final-reviewer` and `simplicity-reviewer` against `dod.md`.
  A clean verdict sets the ledger's stage to `reviewed` and prints the resolved `/superdev:document` call.
- **`/superdev:document <range>`**. Reconciles `README.md` and the `AGENTS.md` hierarchy with the two
  merged slices. It sets the stage to `documented` and prints `/superdev:ship health-check`.
- **`/superdev:ship health-check`**. Ticks `dod.md`, opens the pull request, removes the scope worktree,
  and closes the scope anchor. You see the pull-request URL.
- **After.** Review comments and flaky CI on the open pull request are a `/loop` job, not this chain's
  concern. See [After the PR](#after-the-pr).

## Install

superdev ships as a single-plugin Claude Code **marketplace**
(`.claude-plugin/marketplace.json`). Both the marketplace and the plugin are named `superdev`, so you
install `superdev@superdev`. It requires Claude Code **v2.1.128** or later.

**From the git host** (interactive):

```
/plugin marketplace add https://codeberg.org/bomret/superdev.git
/plugin install superdev@superdev
```

**From a local clone** (for hacking on it):

```
git clone https://codeberg.org/bomret/superdev.git
/plugin marketplace add /absolute/path/to/superdev
/plugin install superdev@superdev
```

**Manage:** `/plugin list` and `/plugin details superdev@superdev`. Pull updates with
`/plugin marketplace update superdev`, then `/reload-plugins`.

Then, in each repo you want to use it, run **`/superdev:setup`** once. After that, run `/superdev:plan`
and `/superdev:implement`.

## Updating

The easiest route is **`/superdev:upgrade`**. It checks for a newer release and installs it in place.
Restart Claude Code afterwards to load it. There are no manual `/plugin` steps.

superdev is a third-party marketplace, so **auto-update is off by default** and updates are otherwise
pull-based. The manual equivalent of `/superdev:upgrade`:

```
/plugin marketplace update superdev     # refresh the catalog from the git host
/plugin update superdev@superdev        # upgrade the installed plugin
/reload-plugins                         # activate it
```

For a hands-off setup, enable it once through `/plugin`, then **Marketplaces**, then `superdev`, then
**Enable auto-update**. Claude then upgrades it at startup and prompts `/reload-plugins`.

A best-effort `SessionStart` hook prints a one-line notice when a newer version is published. It checks
at most once a day and stays silent when offline. "Newer" means the `version` in
`.claude-plugin/plugin.json`, so a release **must bump that field**. `/plugin update` cannot see an
unchanged version.

**Maintainers:** releases are deterministic and commit-driven. semantic-release bumps the version,
writes `CHANGELOG.md`, tags, and publishes a Codeberg Release from the Conventional Commits. See
[`RELEASING.md`](RELEASING.md).

## Requirements

- Claude Code, which provides `node` for the hooks.
- For the chosen backends, the relevant CLI or token: `gh`, or a Jira or Forgejo token in an env var.
  The PR step degrades to a push plus a printed command when a host CLI is absent.

## Attribution

Distills MIT-licensed material from [superpowers](https://github.com/obra/superpowers) (© Jesse
Vincent) and ponytail (© Dietrich Gebert), plus engineering-skill patterns. The writing standard draws on
ASD-STE100 (© ASD) and cites the tekom Praxisleitfaden as prior art. See `NOTICE`.

## License

MIT. See `LICENSE`.
