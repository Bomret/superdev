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
plan runs test-first, inline in the scope worktree.

```
/superdev:setup       → configure backends in docs/agents/*.md (once per repo)
/superdev:brainstorm  → (optional) turn a vague idea into a plan-ready intent
/superdev:plan        → interview + slice a feature into the slice store
/superdev:implement   → drive the slices to merge onto the scope branch, then stop
/superdev:status      → read-only DAG progress snapshot for in-flight runs
/superdev:backlog     → read-only survey of the slice store: what needs what, and what to do next
/superdev:review      → whole-scope review against the DoD, with a fix loop
/superdev:document    → reconcile in-repo docs + knowledge base with the code
/superdev:ship        → tick the DoD, close the scope anchor, open the PR, and clean up
/superdev:afk         → sweep the planned backlog through the whole chain unattended
/superdev:publish-kb  → send a scope's staged knowledge-base pages to the configured backend
/superdev:prose-check → check one file, range, or pasted text against the controlled-prose standard
```

## What it does

- **`/superdev:brainstorm`** *(optional)*. A divergent discovery conversation that shapes a vague idea
  into a plan-ready intent. It explores candidate directions, finds the smallest end-to-end slice worth
  building, and surfaces open questions and rejected directions. It then hands off to `/superdev:plan`,
  which routes each rejected direction to a durable home. Near read-only: it writes nothing to the slice
  store.
- **`/superdev:plan`**. A relentless interview pins the intent and a Definition of Done, and captures
  ADRs and a glossary as decisions surface. Every Definition of Done it writes carries a `Reachable:`
  criterion naming the entrance a user reaches the feature through — or `none` and the reason, such as no
  in-repo consumer or an unchanged entrance on a refactor — so a feature cannot be planned without
  deciding what wires it into the running application. Before it decomposes, it offers a **design sketch**: a
  throwaway HTML page you open in your browser, inventorying the components the plan intends to add,
  change, or delete and how they interact. The command waits there, so a design you did not expect gets
  corrected while no slice has been cut yet. It then decomposes the work into **independently-green
  vertical tracer-bullet slices** with explicit `depends-on` dependencies, written to the configured
  store. On an epic whose shape earns it, the command also draws a `## Slice graph` (the `depends-on`
  DAG), a `## Touch map` (parallel-slice file collisions), or both. Both are markdown, both are advisory, and
  [`references/plan-contract.md`](plugin/references/plan-contract.md) gates each one. The command also tells you
  the execution tier `/superdev:implement` uses for the final slice count (see below).

  Run it again against a feature that already has slices, and it **appends**. New slices land on top of
  the ones already merged, and the command never edits, renumbers, or re-litigates any of them. An
  **anchor dependency** is a recorded relation saying this feature waits on another feature. But
  promoting a single-slice feature to an epic migrates its line onto the new epic, removing it from the
  lone record, which otherwise stays untouched. It refuses while a run against that feature is active
  elsewhere. It surfaces any parked questions the
  feature carries before asking anything new. A parked question is a load-bearing decision an earlier
  interview could not resolve (`skills/plan/SKILL.md` §0).
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
  There are no per-slice worktrees and no per-slice reviewers. Once every slice is merged, the controller
  also performs the documentation pass itself, in that same worktree, as the last step before hand-off
  ([ADR 0031](docs/adr/0031-the-lite-tier-writes-its-own-documentation.md)). The `/superdev:document`
  entry below describes what that changes downstream.
  Either tier stops here, once every slice sits on the scope branch. `/superdev:review` runs next: one
  **whole-scope review** that gates the pull request `/superdev:ship` opens later.
- **`/superdev:status`**. A read-only snapshot of every in-flight `/superdev:implement` run in the repo:
  per scope, the slice counts by status and which slices are `blocked`. It also names each scope holding
  **staged** knowledge-base pages, so a page nobody published yet stays visible instead of silent. It
  never writes, transitions, or merges anything.
- **`/superdev:backlog`**. A read-only survey of the **slice store**, where `/superdev:status` reports the
  **runs**. It groups every open scope anchor, every triage record, every stranded run root, and every
  **untriaged item** — an open record you filed and no `/superdev:plan` interview has yet reached — by the
  action it needs — blocked, stranded, in flight, waiting on another feature, needing a plan, unreleased,
  untriaged, or ready to build — and ends with one recommended next move. Untriaged items are capped at 5,
  oldest first, so a store with real reporters doesn't drown the rest of the table. It shows the four
  things `/superdev:afk` passes over by design: an unreleased plan, an anchor nobody decomposed, a triage
  record a review deferred, and an untriaged item. Its rules are looser than that command's, because it
  reports rather than acts
  ([ADR 0049](docs/adr/0049-an-advisory-survey-judges-the-backlog-more-loosely-than-an-actor.md)). It sits
  outside the implement chain, and writes nothing.
- **`/superdev:review`**. Two modes. Given an ad-hoc diff, branch, path, or the working tree, it needs no
  plan and no slice store, and it stays read-only end to end. Given a live scope branch, it is the
  whole-scope review gate in the implement chain: it checks the scope against that run's `dod.md`, and it
  can drive one fix loop after asking once. That loop changes how the code meets the Definition of Done; a
  finding whose remedy would add a capability nobody planned goes to `/superdev:plan` instead of growing
  the scope under review (ADR 0035). Such a finding gets a **triage record** in your slice store as the
  review defers it: an issue carrying a `triage` label, or a file under `docs/plans/triage/` on the local
  plan-file store. On an issue backend, the record reaches your backlog, not just the run's ledger and
  the pull-request body, both of which end with the run. On the local plan-file store, the record reaches
  your backlog only once the scope that created it ships
  ([ADR 0046](docs/adr/0046-a-deferred-finding-becomes-a-triage-record.md),
  [ADR 0048](docs/adr/0048-a-local-store-triage-record-needs-its-scope-to-ship.md)). Nothing ever builds
  it: no candidate listing and no slice loader selects it. Either way the command dispatches
  `final-reviewer`, plus `simplicity-reviewer` on the `lite` tier. The `full` tier already ran that
  reviewer per slice, so the whole-scope pass skips it rather than re-reading cut-down code
  ([ADR 0037](docs/adr/0037-the-full-tier-skips-the-whole-scope-over-engineering-pass.md)). It reports
  one consolidated verdict.
- **`/superdev:document`**. Dispatches the `doc-writer` to reconcile the in-repo docs (the `AGENTS.md`
  hierarchy) and the optional knowledge base with the current code. It adds what is new and **removes
  stale or obsolete** text. For a remote knowledge-base backend it writes each page as a **staged page**
  instead of sending it. `/superdev:publish-kb` sends it later, once a human decides the feature has
  reached its readers ([ADR 0023](docs/adr/0023-the-knowledge-base-publish-is-its-own-command.md)). It
  then reader-tests the result: the fresh-context `doc-reader` reads the
  changed docs cold and verifies their claims against the repo. Ungrounded or stale text goes back to
  the `doc-writer` for one fix round. **On a `lite` scope that already documented itself inline**
  ([ADR 0031](docs/adr/0031-the-lite-tier-writes-its-own-documentation.md)), it dispatches no `doc-writer`.
  It dispatches only the `doc-reader`, over the doc files that run's own commits touched, and nothing when
  those commits touched none. A review fix loop that lands commits clears that record, so the next run of
  this command dispatches the writer again. Both agents also apply a **content-type lens**
  ([`references/content-types.md`](plugin/references/content-types.md)): does a reader learn *why* a thing
  exists and *when* to use it, not only what it is called and how to run it. That check is always on,
  unlike the **writing standard**, which the repo may configure to `none`. Where a writing standard is
  configured, the `doc-writer` writes to it and the `doc-reader` verifies it. It is the third command of the
  four-command chain, run over the range `/superdev:review` hands it, and it also runs on demand at any
  time. On demand it does a full reconcile, a reconcile scoped to a range or area, or an `audit` for a
  reader-first check.
  Called empty on a **brownfield repo with no `AGENTS.md` hierarchy**, it **bootstraps** one instead. It
  seeds a root `AGENTS.md`, child files where they are warranted, and a proposed `CONTEXT.md` glossary,
  all from the existing code. It confirms them with you before anything commits.
- **`/superdev:afk`**. Sweeps the planned backlog with nobody watching. A **scope anchor** is a feature's
  root, whether that root is a multi-slice epic or a single-slice plan's own lone slice. It takes each
  **eligible scope anchor** through the whole chain, oldest first except where a plan says otherwise: an
  anchor recording an **anchor dependency** on another feature is **deferred** until that feature's anchor
  is closed or its scope has shipped, and the report names what it waits on. Eligibility needs an open,
  unblocked anchor with no live run on its scope, among other conditions `skills/afk/SKILL.md` §2 states in
  full. It invokes `/superdev:implement`, `/superdev:review`, `/superdev:document`, and
  `/superdev:ship`, each carrying `--unattended`. That token is an argument to one invocation, not scope
  state. A stop with a **standing answer** takes it, and a stop with none **blocks** that anchor and
  moves to the next. The sweep stops when no eligible anchor is left, when two anchors block in a row,
  or when `/superdev:ship` fails to reach the code host. It never asks a question and never starts an
  interview command.
- **`/superdev:setup`**. Records the backends in `docs/agents/*.md`, so the workflow never hardcodes a
  tool. For a knowledge base it also captures the **audiences** and the **language**, and proposes a
  human-first outline. It asks which **writing standard** the doc agents write to. When it finds no
  `AGENTS.md` hierarchy in the repo, it points you at `/superdev:document`'s bootstrap mode to seed one.
- **`/superdev:publish-kb`** *(remote knowledge base only)*. Sends a scope's **staged** knowledge-base
  pages to the configured backend, and is the only path from superdev to one. `/superdev:plan` and
  `/superdev:document` write a remote backend's pages under `.superdev/kb-pending/<scope>/` instead of
  sending them. A page sent from unmerged or unreleased work claims a feature no reader can reach
  ([ADR 0023](docs/adr/0023-the-knowledge-base-publish-is-its-own-command.md)). You decide when to run
  it: it warns once when the base branch does not already hold the scope branch's work, but a merge is
  not a release, so it never blocks on that check. `/superdev:afk` never drives it.
- **`/superdev:prose-check`**. Checks one file, one commit range, or pasted text against the
  **controlled-prose** writing standard, and reports each violation under the standard's own section
  heading. It reads that standard by name in every repo, so it works where the repo's own docs follow a
  different guide or none at all
  ([ADR 0057](docs/adr/0057-prose-check-applies-controlled-prose-unconditionally.md)). The default is a
  read-only report. A trailing `-- fix` rewrites the file in place, or prints the rewrite for pasted
  text. `/superdev:afk` never drives it.

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
slice. The **lite** tier (3 slices or fewer) has the controller implement inline instead, and also
performs the documentation pass itself, as the last step before hand-off (ADR 0031). Both tiers hand
off to the same chain once every slice sits on the scope branch: `/superdev:review` dispatches
`final-reviewer` over the whole scope, plus `simplicity-reviewer` too on the `lite` tier. The `full`
tier already ran that reviewer per slice, so the whole-scope pass skips it
([ADR 0037](docs/adr/0037-the-full-tier-skips-the-whole-scope-over-engineering-pass.md)). Then
`/superdev:document` dispatches
`doc-writer` to reconcile the docs, reader-tested by `doc-reader`. On a `lite` scope that already
documented itself, it dispatches `doc-reader` alone instead. The doc reconcile always runs **after**
the review, and never concurrent with it, so the `doc-writer`'s commits cannot shift the diff the reviewer
read ([ADR 0003](docs/adr/0003-doc-reconcile-runs-serially.md)).

## Guardrails (deterministic hooks)

The hooks are cross-platform Node. Claude Code provides `node` as a runtime dependency, so there are no
bash or PowerShell variants.

- **merge-guard.** Blocks `git merge`, `git push`, and `git rebase` from inside a subagent, scoped by
  `agent_id`. The controller integrates.
- **model-explicit.** Blocks a dispatch to a superdev subagent that omits an explicit `model`, so cost
  is always warrant-scaled.
- **green-gate.** After a controller merge, runs the command
  [`references/test-selection.md`](plugin/references/test-selection.md) picks and blocks on a RED result. That
  file owns the full-versus-focused rule the gate follows. "Tests pass on scope after merging" is
  therefore enforced, not merely prompted. The gate is inactive until `docs/agents/verification.md`
  records a test command, which `/superdev:setup` does. Once it is active, the gate runs the suite in the
  tree the merge names — a `-C <path>` or a `--work-tree <path>`, whichever the command carries, with
  `--work-tree` winning when both are there and a relative `--work-tree` resolved against `-C`, not
  against your own checkout. A merge whose working tree the gate cannot resolve blocks
  instead: a command that changes directory first (`cd <path> && git merge`) and names no tree says
  nothing about which one it landed in, a `--git-dir` with no `--work-tree` updates files in one tree
  while reading refs from another repository, and a `-C` path carrying no `docs/agents/verification.md`
  while your own checkout does is a path pointing somewhere other than the merge. Run such a merge as
  `git -C <path> merge …`. A green the gate never verified is worth less than a block naming why.
- **run-lock.** Blocks a `git worktree add` on a scope worktree (`.superdev/scopes/<scope>/worktree`)
  while a fresh `.superdev/scopes/<scope>/run.lock` exists, so two concurrent lite runs on one scope
  cannot collide. A stale lock (older than the staleness threshold) or no lock at all passes through,
  which covers a crash resume and a new run.
- **ledger-guard.** Blocks every write to a scope's `ledger.md`: an `Edit`, a `Write`, and a `Bash`
  write (redirect, `tee`, `sed -i`, `cp`, `mv`, `install`) are all denied. Only `scripts/scope.js`,
  the run-state CLI that owns the ledger's schema, may write it.
- **worktree-sweep.** A `Stop` hook that removes each per-slice worktree and branch once its slice is
  fully merged. Finished worktrees therefore cannot pile up when the controller skips the prompted
  cleanup. It
  touches only merged `slice/*` worktrees under `.superdev/`, and leaves in-progress and reverted slices
  alone. A lite-tier run's single scope worktree is not a per-slice worktree, so this hook leaves it
  alone too. `/superdev:ship` removes it at the end of the chain.
- **scope-prune.** A `Stop` hook that deletes a scope's run root (`.superdev/scopes/<scope>/`, its
  `ledger.md` and `dod.md` post-mortem trail). The scope anchor keeps its own published snapshot of the
  ledger, so the record survives this reap on a backend that carries one. It waits for three conditions:
  the run root has sat untouched for 7 days or more, the ledger's `**Stage:**` line reads `shipped`,
  **and** the scope branch is **contained in the current branch or gone**. Containment is a content
  question — does base already hold this work — and it is asked with `git merge-tree --write-tree`
  rather than with ancestry, which a squash merge destroys by rewriting the branch's commits
  ([ADR 0053](docs/adr/0053-containment-not-ancestry-decides-that-a-scope-branch-reached-base.md)).
  The three run in that order, cheapest first, because the containment test writes tree objects and this
  hook fires on every finished turn. Absence stands beside containment for the hosts that delete the
  branch on merge, read only from refs the repository already holds: a remote-tracking ref it has not
  fetched still counts as present, so it never prunes on stale information. It never touches a scope
  branch carrying content base does not hold, one whose worktree is still present, or one whose ledger is
  unreadable or silent on the stage. On a git older than 2.38, which has no `--write-tree`, it falls back
  to ancestry and prunes what that finds.

**update-check** is an eighth Node hook, and a `SessionStart` *notice* rather than a guardrail. See
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
  The choices are:
  - *local files*: a directory `docs/plans/<type>/<feature-slug>/` per feature, where `00-epic-*` holds
    the DoD and description and `NN-<test-applicability>-*` is one file per slice, with the number as
    the id. It suits solo work or a repo with no tracker.
  - *GitHub Issues*: each slice is an issue and a sub-issue of its epic, with `depends-on` as a native
    `blocked_by` dependency.
  - *Jira*: each slice is an issue, with `depends-on` as an "is blocked by" link.
  - *Forgejo or Codeberg Issues*: each slice is an issue on a Forgejo or Gitea instance. `depends-on` is
    a `**Depends on:**` body-text line, or the native dependency link when the instance's
    issue-dependencies unit is enabled.
  - *other*: you describe your tracker's CRUD and dependency link in prose.

  For any issue-backed choice, setup also asks who owns the created issues. That **assignee** is a login
  or an `accountId`, and it defaults to the API token's own identity, or to `none`. The answers go to
  `docs/agents/issue-tracker.md`.

  Each slice-store backend also states where it mirrors a run's ledger, the **published snapshot** it
  writes to the scope anchor as a `## Run state` section. `/superdev:implement` reads a live snapshot back
  when no local run root exists, which is what lets a run resume from a fresh clone on another machine. `/superdev:ship`
  ticks the anchor's own Definition of Done alongside the local copy. A backend whose
  anchor cannot carry the mirror safely declares itself snapshot-less. The local-file store and Jira
  default to this: the run publishes nothing and adopts nothing there, and `/superdev:ship` ticks only the
  local Definition of Done.
- **Code host.** Where the scope branch is pushed and the PR or MR opens, plus the default posture
  (`draft`, `ready`, or `push-only`) and the base branch. The choices are GitHub (`gh`), Forgejo or
  self-hosted (`tea` or REST), and *other*. With no host CLI present, the step degrades to a push plus a
  printed compare URL and a ready-to-run command. The answers go to `docs/agents/code-management.md`.
- **Documentation (in-repo).** How durable technical docs are kept: an **`AGENTS.md` hierarchy**, where
  the root is project-wide and each child covers one boundary. `/plan` also records the glossary
  (`CONTEXT.md`), ADRs (`docs/adr/`), and path-scoped rules (`.claude/rules/`) under this convention, and
  `/document` reconciles it after a scope lands. This doc also names the **writing standard** the doc
  agents write to: `controlled` (the language-neutral rule set in
  [`references/controlled-prose.md`](plugin/references/controlled-prose.md)), a path to your own style guide, or
  `none`. The answers go to `docs/agents/documentation.md`.
- **Knowledge base** *(optional)*. A **separate, human-first** record for *readers* rather than agents:
  feature specifications, design overviews, and ADR summaries. It is distinct from the agent-first
  `AGENTS.md` docs. You pick the backend (Confluence, a local `docs/kb/`, other, or none), its
  **audiences**, its **language**, and an agreed **outline** that `/plan` and `/document` fill rather than
  reinvent. The answers go to `docs/agents/knowledge-base.md`. For a **remote** backend, `/plan` and
  `/document` stage each page under `.superdev/kb-pending/<scope>/` instead of sending it. `/superdev:publish-kb`
  is the only command that reaches the backend
  ([ADR 0023](docs/adr/0023-the-knowledge-base-publish-is-its-own-command.md)). A local `docs/kb/`
  backend stages nothing, because its pages ride the branch.
- **Toolchain** *(detected)*. The repo's package manager and its build, lint, format, and release
  commands, plus style-doc pointers. Setup detects these rather than asking, because the toolchain is not
  a pluggable backend. It records one section per workspace, so agents use the right tools instead of
  rediscovering them. The `test` entry defers to Verification. The result goes to
  `docs/agents/toolchain.md`.
- **Verification** *(optional)*. The repo's test command, the first fenced block of
  `docs/agents/verification.md`. Recorded, it **arms the green-gate** hook. Omitted, the gate stays
  inactive. A second fenced block holds the focused test command, which setup derives from the runner it
  detected wherever that runner can narrow a run. It narrows five callers to a set of changed paths. They
  are the implementer's TDD loop, the lite tier's inline loop, the slice-reviewer's Lens 2 re-run, the
  green-gate hook, and the documentation step's own run over its doc commits. A runner that cannot narrow
  records no such command, with the reason, and every caller runs the full one.
  [`references/test-selection.md`](plugin/references/test-selection.md) owns the full-versus-focused rule. The
  answer goes to `docs/agents/verification.md`.

To add a backend, write a new seed template in `references/` plus a config doc. No command and no agent
changes.

## What superdev writes to your repo

```
docs/agents/*.md          backend config — the six docs above (committed)
docs/plans/<type>/<slug>/ slices + Definition of Done (local store): 00-epic-* = DoD + description,
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
.superdev/design/<feature-slug>.html   git-ignored throwaway design sketch, written by /plan only when
                          the operator accepts it — sibling to .superdev/scopes/, not inside it;
                          overwritten per feature slug, never committed
.superdev/base.lock       git-ignored repo-level lock, held while /plan or /implement commits the
                          design docs above to the base branch — sibling to .superdev/scopes/, since
                          those files belong to no scope; reclaimed after 5 minutes (ADR 0058)
.superdev/kb-pending/<scope>/<title-slug>.md   git-ignored staged pages for a remote knowledge-base
                          backend (a `patch` page instead names itself
                          `<title-slug>--<section-slug>.md`, ADR 0027), written by /plan and /document
                          instead of a live publish, sent by /publish-kb (ADR 0023); outlives the run
                          root, so /ship never removes it
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
  then writes `docs/plans/feat/health-check/`. New behaviour, so the change type is `feat`. That holds
  `00-epic-*` (the DoD and description) plus two
  slices, for example `01-behavior-route-handler.md` and `02-behavior-wire-into-router.md`, where the
  second `depends-on` the first. You see the slice list printed back, ready for `/implement`, along with
  the tier it runs under. Two slices is 3 or fewer, so the tier is **lite**.
- **`/superdev:implement feat/health-check`**. Sets up `.superdev/scopes/health-check/`, the git-ignored run
  scratch holding the concrete DoD and the ledger. Two slices selects the **lite** tier. The controller
  cuts a single scope worktree at `.superdev/scopes/health-check/worktree/` for the branch
  `feat/health-check`, which is the feature label verbatim. It never switches the
  invoking checkout. It implements slice 01 test-first in that worktree and commits. Slice 02 then
  unblocks and follows the same loop. There are no per-slice worktrees and no reviewer subagents. Once
  both slices sit on the scope branch, the controller **stops** and prints the resolved
  `/superdev:review` call. You see a one-line status per slice as it lands.
- **`/superdev:review <range>`**. Dispatches `final-reviewer` and `simplicity-reviewer` against `dod.md`.
  A clean verdict sets the ledger's stage to `reviewed` and prints the resolved `/superdev:document` call.
- **`/superdev:document <range>`**. Reconciles `README.md` and the `AGENTS.md` hierarchy with the two
  merged slices. It sets the stage to `documented` and prints `/superdev:ship health-check`.
- **`/superdev:ship health-check`**. Ticks `dod.md` and the anchor's own Definition of Done, opens the
  pull request, removes the scope worktree, and closes the scope anchor. You see the pull-request URL.
- **After.** Review comments and flaky CI on the open pull request are a `/loop` job, not this chain's
  concern. See [After the PR](#after-the-pr).

## Install

superdev ships as a single-plugin Claude Code **marketplace**
(`.claude-plugin/marketplace.json`). Both the marketplace and the plugin are named `superdev`, so you
install `superdev@superdev`. Verified on Claude Code **v2.1.237** (2026-08-20). No lower bound is
claimed, because none has been tested.

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

**Manage:** `/plugin list` and `/plugin details superdev@superdev`. For updates use
**`/superdev:upgrade`**, or the manual steps under [Updating](#updating). Refreshing the catalog alone
does not upgrade an installed plugin.

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
`plugin/.claude-plugin/plugin.json`, so a release **must bump that field**. `/plugin update` cannot see
an unchanged version.

**Maintainers:** releases are deterministic and commit-driven. semantic-release bumps the version,
writes `CHANGELOG.md`, tags, and publishes a Codeberg Release from the Conventional Commits. See
[`RELEASING.md`](RELEASING.md).

## Requirements

- Claude Code, which provides `node` for the hooks.
- For the chosen backends, the relevant CLI or token: `gh`, or a Jira or Forgejo token in an env var.
  The PR step degrades to a push plus a printed command when a host CLI is absent.

## OpenCode

superdev's chain also runs under **OpenCode**, unattended sweeps included. `plugin/scripts/adapter.js`
renders the same shipped `plugin/skills/` and `plugin/agents/` tree into OpenCode's own on-disk layout,
so no second copy of the prompts, the agents, or the guardrails exists to maintain.

**Install and render**, from the OpenCode project you want superdev in:

```
git clone https://codeberg.org/bomret/superdev.git
node superdev/plugin/scripts/adapter.js --dest . \
  --model-map sonnet=<provider>/<model> \
  --model-map opus=<provider>/<model> \
  --model-map haiku=<provider>/<model>
```

`--dest` names the project root, where the render creates a `.opencode/` tree. `--model-map` resolves
a rendered agent's `model:` alias (superdev ships `sonnet`, `opus`, and `haiku`) to the
provider and model your OpenCode configuration names for that alias. Agents are the only surface that
takes one: OpenCode skill frontmatter has no `model` key, so the three skills that pin a cheap model
under Claude Code — `backlog`, `status`, `upgrade` — run on your session's model instead. An alias with no map entry is
resolved interactively instead of failing the render: the CLI queries the OpenCode config for the
models it already knows, lists them, and asks for a pick — one prompt per alias `--model-map` doesn't
cover, never for one it does. `--plugin-root` defaults to the adapter script's own plugin root,
resolved from the script's location, so the example above needs no such flag. Pass `--plugin-root` only
to render a different plugin tree than the one the script lives in.

**Model selection.** `adapter.js` also exports `queryOpenCodeModels()`, which reads the `model` and
`small_model` fields already configured in the project's `opencode.json`, the `OPENCODE_CONFIG`
file, and the global `~/.config/opencode/opencode.json`, read from these locations and unioned, then
returned sorted — it does not walk the richer `provider.*.models` or `agent.*.model` config shapes,
so the list a prompt offers can be incomplete.

The CLI's own interactive resolution (`resolveModelMap()`, not itself exported) asks for one of
those models per still-missing alias, in turn:

```
Models named in your OpenCode config, for 'haiku':
  1) acme/haiku-1
  2) acme/sonnet-1
  3) acme/opus-1
Select a model for 'haiku':
```

It re-prompts on an answer that is not a number in range, sharing a single `readline` interface
across the whole pass — so a piped, multi-line answer resolves every missing alias instead of only
the first — and an alias `--model-map` already covers is never asked about at all. It refuses,
naming the alias and `--model-map`, when no models are configured at all or when the input closes
before an answer arrives (a non-interactive process, or stdin already at EOF).

The render creates:

```
.opencode/skills/superdev-<name>/SKILL.md   one per skill, except afk
.opencode/commands/superdev/afk.md          afk alone (see below)
.opencode/agents/<name>.md                  one per subagent
.opencode/plugins/superdev.js               the hook bridge, forwarding OpenCode's plugin events to
                                             the eight shipped hooks, spawned as
                                             node <plugin-root>/hooks/<hook>.js
```

You invoke a rendered skill by typing `/superdev-<name>`, the flat slash command OpenCode registers
every skill under. The `superdev-` prefix is not decoration: OpenCode's skill registry is flat and
globally unique across every directory it scans, so an unprefixed `plan` would collide with your own.

Running the command again is safe. It removes its own generated content first — the `superdev/`
commands directory wholesale, the bridge plugin file by name, and, in the shared `.opencode/agents/`
and `.opencode/skills/` directories, only the files and skill directories it wrote in a past render —
so a renamed or removed skill or agent leaves no stale file behind, while another plugin under
`.opencode/plugins/`, your own agent under `.opencode/agents/`, and your own skill under
`.opencode/skills/` all survive untouched. That last one holds even for a skill of yours named
`superdev-something`, as long as it isn't one of the twelve canonical names: cleanup matches a marker
the render writes, never the name. A skill of yours that shares one of those twelve names —
`superdev-plan`, say — is not spared: the render writes that exact path unconditionally on every run,
marker or not.

**Updating.** `/superdev-upgrade` is the OpenCode equivalent of `/superdev:upgrade`: it pulls the
`superdev` clone and re-runs the render command above, then tells you to start a new OpenCode
session so the refreshed skills, agents, and hook bridge load. Or do it by hand: `git pull` in the
clone, then re-run the render command above, in case the rendered skill itself is ever broken or
unavailable.

**Verify each render target.** Confirm the four paths above exist under the project's `.opencode/`.
Run `opencode debug skill` in the project and confirm it lists all twelve `superdev-` skills, which is
how OpenCode reports what it actually loaded. Start an OpenCode session and check its log for a
plugin-loader error: a plugin whose module export is not a function fails to load and reports exactly
that. After one
session, confirm the bridge ran by checking that `<plugin-root>/.data/.update-check` now exists, the
cache file the bridged `update-check` hook writes on `session.created`. From a subagent's session, run
a command one of the guardrails blocks under Claude Code, for example `git merge`, and confirm OpenCode
refuses it the same way.

Two gaps stand in the render today, each a recorded triage record rather than a silent one. The
`update-check` hook's version notice never reaches you, because the bridge runs the hook but has
nowhere to print its output. The `model-explicit` check reads only the project's own
`.opencode/agents/<type>.md`, so it names no model for an agent your OpenCode configuration points at
from anywhere else.

**A rendered agent's own configuration wins over your project's OpenCode permission rules** —
OpenCode's own agent-beats-global precedence, not a superdev bug. That includes any custom rule you've
written yourself, and a deliberate loosening of OpenCode's built-in `.env` read guard: both stay
overridden by the six rendered agents' own `tools:`/`permission:` config. The render does re-assert
OpenCode's own `.env`-ask default specifically for the `read` tool, so a plain install still asks
before an agent reads a `.env` file through `read` — not through `bash` or `grep`, which every rendered
agent keeps and which the guard does not cover.

**afk is a command, not a skill — deliberately.** Every other surface renders as a skill so that afk
can invoke it: a skill is the only prompt surface OpenCode's model can start on its own, through the
built-in `skill` tool. A command is not, and that is exactly why afk is one. Under Claude Code afk
carries `disable-model-invocation: true`, because a model that can start an unattended sweep over your
whole backlog on its own judgment is a hazard. OpenCode has no such frontmatter key, so the command
render reproduces it instead — with no configuration on your side to get right.

You start a sweep from a shell:

```
opencode run --auto --command superdev/afk
```

`--auto` approves every permission not explicitly denied. Without it a sweep stalls the first time
OpenCode's `doom_loop` or `external_directory` permission asks, both of which default to `ask` and
neither of which anyone is there to answer. A headless run also denies the `question` tool outright,
which is the behavior an unattended run already assumes: superdev's standing answers exist so nothing
gets asked, and a stop with no standing answer is a block rather than a question.

## Attribution

Distills MIT-licensed material from [superpowers](https://github.com/obra/superpowers) (© Jesse
Vincent) and ponytail (© Dietrich Gebert), plus engineering-skill patterns. The writing standard draws on
ASD-STE100 (© ASD) and cites the tekom Praxisleitfaden as prior art. See `NOTICE`.

## License

MIT. See `LICENSE`.
