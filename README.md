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

A self-contained Claude Code plugin for the full **brainstorm, plan, implement, review, document,
submit-pr, ship** loop, with **no prerequisite plugins**. It gives you interview-driven vertical slicing, an execution tier
sized to the plan, deterministic guardrails, and a pluggable slice store plus code host. A larger plan
runs in parallel in isolated slicetrees, with separate implementer and reviewer subagents. A small
plan runs test-first, inline in the scopetree.

```
/superdev:setup        → configure backends in docs/agents/*.md (once per repo)
/superdev:brainstorm   → (optional) turn a vague idea into a plan-ready intent
/superdev:plan         → interview + slice a feature into the slice store
/superdev:implement    → drive the slices to merge onto the scope branch, then stop
/superdev:status       → read-only DAG progress snapshot for in-flight runs
/superdev:profile      → read-only account of where a scope run's time went, from its transcripts
/superdev:backlog      → read-only survey of the slice store: what needs what, and what to do next
/superdev:review       → whole-scope review against the DoD, with a fix loop
/superdev:document     → reconcile in-repo docs + knowledge base with the code
/superdev:submit-pr    → push the scope branch, open the PR, and leave the run standing
/superdev:ship         → merge the PR once reviewed, deploy per the repo's posture, then stop
/superdev:verify-ship  → observe the deployed system and settle the Definition-of-Done criteria the merge left open
/superdev:wrap-up      → check a shipped scope is fully settled, then close its anchor and take the run down
/superdev:publish-kb   → send a scope's staged knowledge-base pages to the configured backend
/superdev:prose-check  → check one file, range, or pasted text against the controlled-prose standard
/superdev:review-tests → read-only audit of what the test suite costs, ranked and handed to plan
/superdev:sweep        → read-only chain over code, docs, tests, and config, merged into one plan-ready intent
```

## What it does

- **`/superdev:brainstorm`** *(optional)*. A divergent discovery conversation that shapes a vague idea
  into a plan-ready intent. It explores candidate directions and offers at most the two strongest that
  survive a check against the repository. It finds the smallest end-to-end slice worth building, and
  surfaces open questions and rejected directions. It writes its intent as the interview runs, as a draft
  until the handoff, so a closed session loses nothing and a later session can resume or delete the
  draft. The handoff marks the intent ready, and `/superdev:plan` then offers it and routes each rejected
  direction to a durable home. `/superdev:plan` never offers a draft. Near read-only: it writes nothing
  to the slice store.
- **`/superdev:plan`**. A relentless interview pins the intent and a Definition of Done, and captures
  ADRs and a glossary as decisions surface. Before it asks, it checks every option against the repository
  or the official docs, shows that evidence, drops an option that fails, and offers at most two. Every
  alternative to its recommendation names what choosing it saves, or, for an option in a fixed set a
  question requires by name, states why it doesn't fit. A decision with only one defensible answer is
  stated with its reason instead of asked, and the closing summary lists it for your confirmation. A
  defect the interview finds is always fixed: the command asks only whether the fix goes into a planned
  slice, into its own slice, or into a triage record for later. Before it slices, `final-reviewer`
  derives acceptance criteria from the intent alone and the command diffs them against the drafted
  Definition of Done. The command settles each gap itself, as a criterion, a fold into an existing
  criterion, or a named non-goal, and shows the settlement as one proposal you confirm before slicing
  (ADR 0099, ADR 0122).
  Every Definition of Done it writes
  carries a `Reachable:` criterion naming the entrance a user reaches the feature through — or `none` and
  the reason, such as no in-repo consumer or an unchanged entrance on a refactor — so a feature cannot be
  planned without deciding what wires it into the running application. Before it decomposes, it offers a
  **design sketch**: a throwaway HTML page you open in your browser, inventorying the components the plan
  intends to add, change, or delete and how they interact. The command waits there, so a design you did
  not expect gets corrected while no slice has been cut yet. It then decomposes the work into
  **independently-green vertical tracer-bullet slices** with explicit `depends-on` dependencies, written
  to the configured store. On an epic whose shape earns it, the command also draws a `## Slice graph`
  (the `depends-on` DAG), a `## Touch map` (parallel-slice file collisions), or both. Both are markdown,
  both are advisory, and [`references/plan-contract.md`](plugin/references/plan-contract.md) gates each
  one. The command also tells you the execution tier `/superdev:implement` uses for the final slice count
  (see below).

  Run it again against a feature that already has slices, and it **appends**. New slices land on top of
  the ones already merged, and the command never edits, renumbers, or re-litigates any of them. An
  **anchor dependency** is a recorded relation saying this feature waits on another feature. But
  promoting a single-slice feature to an epic migrates its line onto the new epic, removing it from the
  lone record, which otherwise stays untouched. It refuses while a run against that feature is active
  elsewhere, and once that feature has **shipped** — a Definition of Done amended after the fact would
  mix criteria verified against a merged pull request with criteria nobody has verified, so follow-up
  work becomes a new feature holding an anchor dependency on the old one. It surfaces any parked questions the
  feature carries before asking anything new. A parked question is a load-bearing decision an earlier
  interview could not resolve (`skills/plan/SKILL.md` §0).
- **`/superdev:implement`**. The controller drives the slices as a **dependency-ordered DAG**, sized to
  an execution tier derived fresh from the loaded slice count. The tier is never configured and never
  persisted.
  With **more than 3 slices the tier is `full`**: unblocked slices run in **parallel** as `implementer`
  subagents in isolated slicetrees, with TDD and lazy minimalism. A separate **slice-reviewer**
  (correctness, settled before it reads the implementer's progress log) and **simplicity-reviewer**
  (over-engineering) gate each behavior slice, and the
  controller merges **serially**.
  With **3 or fewer slices the tier is `lite`**: the controller implements each slice inline and
  test-first, in a single dedicated **scopetree** (`.superdev/scopes/<scope>/scopetree/`). The
  invoking checkout is never switched, and a same-scope run lock guards against a second concurrent run.
  There are no per-slice slicetrees and no per-slice reviewers. Once every slice is merged, the controller
  also performs the documentation pass itself, in that same scopetree, as the last step before hand-off
  ([ADR 0031](docs/adr/0031-the-lite-tier-writes-its-own-documentation.md)). The `/superdev:document`
  entry below describes what that changes downstream.
  Either tier stops here, once every slice sits on the scope branch. `/superdev:review` runs next: one
  **whole-scope review** that gates the pull request `/superdev:submit-pr` opens later.
- **`/superdev:status`**. A read-only snapshot of every in-flight `/superdev:implement` run in the repo:
  per scope, the slice counts by status and which slices are `blocked`. It also names each scope holding
  **staged** knowledge-base pages, so a page nobody published yet stays visible instead of silent.
  `/superdev:status <scope> --trace` prints that scope's run trace as a timeline instead, and
  `--slice <id>` narrows it to one slice. It never writes, transitions, or merges anything.
- **`/superdev:profile`**. A read-only account of where a scope run's time went, for a run that felt slow.
  It reads the transcripts Claude Code already keeps for every session and subagent, so it needs no setup
  and works on runs that finished long ago. It shows the time of each chain phase split into subagent, idle,
  tool, hook, and model time. It shows the commands that ran most often and cost most in total. One row
  appears per subagent, with the slowest of each parallel batch flagged. A dispatch that never finished is
  named by its status (rejected, denied, blocked, failed, killed, or not yet notified) instead of a duration.
  Time spent waiting for you is always shown on its own. So is idle time: the time the run sat with
  nothing running, for a reason other than you. Without a slug it profiles the scope that ran last
  ([ADR 0103](docs/adr/0103-the-run-profile-reads-claude-codes-transcripts.md)). It sits outside the
  implement chain, and writes nothing.
- **`/superdev:backlog`**. A read-only survey of the **slice store**, where `/superdev:status` reports the
  **runs**. It groups every open scope anchor, every triage record, every stranded run root, and every
  **untriaged item** — an open record you filed and no `/superdev:plan` interview has yet reached — by the
  action it needs — blocked, stranded, in flight, waiting on another feature, needing a plan, unreleased,
  untriaged, or ready to build — and ends with one recommended next move. Untriaged items are capped at 5,
  oldest first, so a store with real reporters doesn't drown the rest of the table. It shows an
  unreleased plan, an anchor nobody decomposed, a triage record a review deferred, and an untriaged item.
  It resolves an ambiguity toward showing the row, because it reports rather than acts
  ([ADR 0049](docs/adr/0049-an-advisory-survey-judges-the-backlog-more-loosely-than-an-actor.md)). It sits
  outside the implement chain, and writes nothing.
- **`/superdev:review`**. Two modes. Given an ad-hoc diff, branch, path, or the working tree, it needs no
  plan and no slice store, and it stays read-only end to end. A path whose diff is empty — an area you
  never changed — is reviewed as **standing code**, the files under it at `HEAD`, so pointing a review at
  an existing module or test tree reports findings rather than an empty range (ADR 0063). Given a live
  scope branch, or a bare invocation on a clean checkout that finds one run in progress, it is the
  whole-scope review gate in the implement chain: it checks the scope against that run's `dod.md`, and it
  can drive one fix loop after asking once. Several runs in progress get listed for you to pick; naming a
  scope by its slug works too (ADR 0078). That loop fixes every finding, Minor ones included, for at most
  three cycles, and only a Critical or Important finding left at the cap holds the run (ADR 0098). It
  changes how the code meets the Definition of Done; a new test, a new row in an existing drift contract
  table, or a prose fix that makes text agree with an existing rule stays in the loop (ADR 0097). A
  finding whose remedy would add a capability nobody planned goes to `/superdev:plan` instead of growing
  the scope under review (ADR 0035). Such a finding gets a
  **triage record** in your slice store as the review defers it: an issue carrying a `triage` label.
  The record reaches your backlog, not just the run's ledger and the pull-request body, both of which
  end with the run, whether or not the scope ever ships
  ([ADR 0046](docs/adr/0046-a-deferred-finding-becomes-a-triage-record.md)). Nothing ever builds
  it: no candidate listing and no slice loader selects it. A real defect the run meets that no slice
  covers, and that the scope did not cause, earns the same kind of record. A flaky test in untouched
  code is an example. Whichever chain command meets
  it writes the record then, never at a handoff, and `/superdev:plan` writes one when you place a found
  defect for later
  ([ADR 0088](docs/adr/0088-an-observation-is-recorded-where-it-is-met.md)). Either way the command
  dispatches `final-reviewer`, plus `simplicity-reviewer` on the `lite` tier. The `full` tier already
  ran that reviewer per slice, so the whole-scope pass skips it rather than re-reading cut-down code
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
- **`/superdev:setup`**. Records the backends in `docs/agents/*.md`, so the workflow never hardcodes a
  tool. For a knowledge base it also captures the **audiences** and the **language**, and proposes a
  human-first outline. It asks which **writing standard** the doc agents write to. When it finds no
  `AGENTS.md` hierarchy in the repo, it points you at `/superdev:document`'s bootstrap mode to seed one.
  On a configured repo, a plain re-run offers each **seed gap**, and `check` lists them.
- **`/superdev:publish-kb`** *(remote knowledge base only)*. Sends a scope's **staged** knowledge-base
  pages to the configured backend, and is the only path from superdev to one. `/superdev:plan` and
  `/superdev:document` write a remote backend's pages under `.superdev/kb-pending/<scope>/` in the main
  working tree, whichever checkout they run in, instead of sending them
  ([ADR 0119](docs/adr/0119-a-staged-page-lives-in-the-main-working-tree.md)). A page sent from unmerged or unreleased work claims a feature no reader can reach
  ([ADR 0023](docs/adr/0023-the-knowledge-base-publish-is-its-own-command.md)). You decide when to run
  it: it warns once when the base branch does not already hold the scope branch's work, but a merge is
  not a release, so it never blocks on that check. Every backend command
  runs under a 30-second bound, and a command that exhausts it **stops the run** — a host that stops
  answering one call stops answering the next, so the remaining pages are reported untried and stay
  staged for a later run
  ([ADR 0076](docs/adr/0076-a-backend-command-runs-under-a-time-bound.md)).
- **`/superdev:prose-check`**. Checks one file, one commit range, or pasted text against the
  **controlled-prose** writing standard, and reports each violation under the standard's own section
  heading. It reads that standard by name in every repo, so it works where the repo's own docs follow a
  different guide or none at all
  ([ADR 0057](docs/adr/0057-prose-check-applies-controlled-prose-unconditionally.md)). The default is a
  read-only report. A trailing `-- fix` rewrites the file in place, or prints the rewrite for pasted
  text.
- **`/superdev:review-tests`**. Audits what the test suite costs. It sweeps the whole test tree in one
  pass, runs the repo's optional **timing command** to measure it, and reports redundant coverage,
  overweight fixtures, tautological tests, dead tests, and expensive tests, ranked by measured duration
  — or labelled `unmeasured` and ranked by judgment where no timing command is configured
  ([ADR 0066](docs/adr/0066-a-measured-test-audit-is-its-own-surface.md)). Every finding is a judgment
  you can reject before it survives. Its only writes are the intent for `/superdev:plan` and the
  one-line `.gitignore` entry that keeps its scratch directory ignored when absent.
- **`/superdev:sweep`**. Chains `/superdev:review`, `/superdev:document audit`, `/superdev:review-tests`,
  and `/superdev:setup check` over a whole repository (or the path you give it) into one merged, ranked
  report, each finding attributed to the leg that found it. Every leg runs read-only, in a **chained
  posture**: the doc and test legs return findings instead of repairing or asking on their own
  ([ADR 0068](docs/adr/0068-a-repository-sweep-chains-the-read-only-surfaces.md)). A checkable fact — a
  grounded doc claim, a config drift verdict, a dead or ignored test — reaches the intent directly; every
  other finding is a judgment you confirm or reject in one `AskUserQuestion` round. Its only write is the
  intent for `/superdev:plan`.

## After the PR

`/superdev:implement` is a goal-based loop. It drives the DAG until every slice sits on the scope branch,
then **stops**. `/superdev:review`, `/superdev:document`, and `/superdev:submit-pr` run next, in that
order, and carry the run the rest of the way to a pull request. The last mile, once the PR is open, is a
time-based loop, so hand review comments and CI on it to `/loop`:

```
/loop 5m check my PR, address review comments, and fix failing CI
```

Once the pull request is reviewed, `/superdev:ship` merges it, deploys the merge under the repository's
deploy posture (`none`/`manual`/`auto`, `docs/agents/deployment.md`, ADR 0101), then stops.
`/superdev:verify-ship` settles the criteria only a deployed system can show. `/superdev:wrap-up` closes the
scope anchor and cleans up the run. All three are human-only. Ship names `/superdev:verify-ship` next while
a criterion is open or a `manual` deploy waits for an answer, and `/superdev:wrap-up` otherwise (ADR 0116).
When staged knowledge-base pages wait, all three name their count and directory, state that wrap-up keeps
them, and offer `/superdev:publish-kb`. `/superdev:wrap-up` refuses to close a run while its scopetree or a
slicetree still holds a staged file, because removing that checkout deletes the file (ADR 0119).

Any chain command (`/superdev:implement`, `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`)
takes `--unattended`. At a stop, the run takes the stop's standing answer, or blocks the scope anchor
instead of asking. Whoever invokes the command passes the token, and superdev ships no driver.
`/superdev:ship` has no unattended mode.

To cap a long `/superdev:implement` run, wrap the call in `/goal`. Give it the Definition of Done as the
stop condition and an explicit turn ceiling (for example, "stop after N tries").

## Roles (subagents)

The subagents are `implementer`, `slice-reviewer`, `simplicity-reviewer`, `final-reviewer`,
`doc-writer`, `doc-reader`, and `test-auditor`. Each runs in an isolated context, and only its result
returns to the controller.

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

- **merge-guard.** Blocks `git merge`, `git push`, `git rebase`, `gh pr merge`, `tea pr merge`, and a
  `tea api` POST or `gh api` PUT or POST to a pull request's `/merge` endpoint from inside a subagent,
  scoped by `agent_id`. A `curl` call to the `/merge` endpoint stays a prose contract the subagent
  bodies carry. The guard also blocks an integrating command when a git global option value holds shell
  syntax that the guard cannot read to its end. The options are `-C`, `-c`, any `--<name>=`, and
  git's value-taking long options in either spelling: `--git-dir`, `--work-tree`, `--namespace`,
  `--config-env`, `--shallow-file`, and `--attr-source`. Examples are nesting past one level, nested
  arithmetic, and a nested `${…}` such as `${X:-${Y:-a b}}`. Some shapes the guard misreads still pass
  (triage #814). The controller integrates.
- **model-explicit.** Blocks a dispatch to a superdev subagent that omits an explicit `model`, so cost
  is always warrant-scaled.
- **green-gate.** After a controller merge, runs the command
  [`references/test-selection.md`](plugin/references/test-selection.md) picks and blocks on a RED result. That
  file owns the full-versus-focused rule the gate follows. "Tests pass on scope after merging" is
  therefore enforced, not merely prompted. A killed suite blocks the merge too, rather than passing it: a
  process the gate's own bound ended carries no verdict (INV-0009, ADR 0086). The gate spawns the
  suite under a bound from its hook ceiling. The gate, not the platform, ends a runaway suite and
  reports the kill. The gate is inactive until `docs/agents/verification.md`
  records a test command, which `/superdev:setup` does. Once it is active, the gate runs the suite in the
  tree the merge names — a `-C <path>` or a `--work-tree <path>`, whichever the command carries, with
  `--work-tree` winning when both are there and a relative `--work-tree` resolved against `-C`, not
  against your own checkout. A merge whose working tree the gate cannot resolve blocks
  instead: a command that changes directory first (`cd <path> && git merge`) and names no tree says
  nothing about which one it landed in, a `--git-dir` with no `--work-tree` updates files in one tree
  while reading refs from another repository, a `-C` or `--work-tree` value holding shell syntax (`$VAR`,
  `$(…)`, a backtick, a leading `~`) names a path the gate reads before the shell expands it, and a `-C`
  path carrying no `docs/agents/verification.md` while your own checkout does is a path pointing somewhere
  other than the merge. The gate also blocks a merge when a git global option value holds shell syntax
  that the gate cannot read to its end. The options are `-C`, `-c`, any `--<name>=`, and git's
  value-taking long options in either spelling: `--git-dir`, `--work-tree`, `--namespace`,
  `--config-env`, `--shallow-file`, and `--attr-source`. Examples are nesting past one level, nested
  arithmetic, and a nested `${…}` such as `${X:-${Y:-a b}}`. Pass literal option values instead, such as
  `git -C <path> merge …`. Some shapes the gate misreads still pass (triage #814). A green the gate never
  verified is worth less than a block naming why.
- **run-lock.** Blocks a `git worktree add` on a scopetree (`.superdev/scopes/<scope>/scopetree`)
  while a fresh `.superdev/scopes/<scope>/run.lock` exists, so two concurrent lite runs on one scope
  cannot collide. A stale lock (older than the staleness threshold) or no lock at all passes through,
  which covers a crash resume and a new run.
- **ledger-guard.** Blocks the direct write shapes to a scope's `ledger.md`: an `Edit`, a `Write`, and a
  `Bash` write (redirect, `tee`, `sed -i`, `cp`, `mv`, `install`) are all denied. An interpreter wrapper
  and some substitution shapes still pass. Only `scripts/scope.js`, the run-state CLI that owns the
  ledger's schema, may write it. A write to the run trace (`trace.log`) is refused the same way, because
  only the hooks and `scripts/scope.js` write it.
- **run-trace.** A hook that records every file edit of a run into the run trace
  (`<run-root>/trace.log`), through the edit tools and through a shell write (redirect, `tee`, `sed -i`,
  `cp`, `mv`, `install`, `git apply`). Each line names its slice, its agent, and whether the file is a
  test or an implementation, by the `## Test paths` section of `docs/agents/verification.md` or the default
  patterns. It also records each test run with its outcome (a run in the background or behind a pipe reads
  `unknown`), each revert or restore of files, and each subagent dispatch and its end. After an
  implementation edit or a passing run on a `behavior` slice, it adds a Missing RED note when the latest
  test edit has no failing run since. The hook registers on `PostToolUse`, `PostToolUseFailure`,
  `SubagentStart`, and `SubagentStop`. An edit outside every run root records nothing. A write behind
  `bash -c` or a variable passes unseen. The hook never blocks a tool call.
- **slicetree-sweep.** A `Stop` hook that removes each slicetree and branch once its slice is
  fully merged. Finished slicetrees therefore cannot pile up when the controller skips the prompted
  cleanup. It
  touches only merged `slice/*` slicetrees under `.superdev/`, and leaves in-progress and reverted slices
  alone. A lite-tier run's single scopetree is not a slicetree, so this hook leaves it
  alone too. `/superdev:wrap-up` removes it at the end of the chain.
- **scope-prune.** A `Stop` hook that deletes a scope's run root (`.superdev/scopes/<scope>/`, its
  `ledger.md` and `dod.md` post-mortem trail). The scope anchor keeps its own published snapshot of the
  ledger, so the record survives this reap on a backend that carries one. It waits for these conditions:
  the run root has sat untouched for 7 days or more, the ledger's `**Stage:**` line reads `closed`,
  **and** the scope branch is **contained in the current branch or gone**. Containment is a content
  question — does base already hold this work — and it is asked with `git merge-tree --write-tree`
  rather than with ancestry, which a squash merge destroys by rewriting the branch's commits
  ([ADR 0053](docs/adr/0053-containment-not-ancestry-decides-that-a-scope-branch-reached-base.md)).
  Where that comparison conflicts — base edited the branch's files after taking its work — it asks
  instead whether base's history carries a commit with the branch's own patch, under a 1000-commit cap
  ([ADR 0082](docs/adr/0082-containment-asks-whether-base-history-took-the-patch.md)).
  They run in that order, cheapest first, because the containment test writes tree objects and this
  hook fires on every finished turn. Absence stands beside containment for the hosts that delete the
  branch on merge, read only from refs the repository already holds: a remote-tracking ref it has not
  fetched still counts as present, so it never prunes on stale information. It never touches a scope
  branch carrying content base does not hold, one whose scopetree or slicetrees are still present, or one whose ledger is
  unreadable or silent on the stage. On a git older than 2.38, which has no `--write-tree`, it falls back
  to ancestry and prunes what that finds. The branch goes with the run root — the local ref and every
  remote-tracking copy of it — so a clone stops collecting one dead branch per shipped feature
  ([ADR 0071](docs/adr/0071-the-prune-reaps-the-scope-branch-with-its-run-root.md)). Only a branch the
  ledger names is deleted, never one matched by shape, and a delete git refuses — this checkout or
  another worktree holds the branch — keeps the run root standing for the next `Stop` to retry.

**update-check** is a Node hook, and a `SessionStart` *notice* rather than a guardrail. See
[Updating](#updating).

## Configuration and backends

`/superdev:setup` records your choices in `docs/agents/*.md`, one small doc per concern, so the commands
never hardcode a tool. Edit those files directly at any time. Re-run setup to switch a backend, or to
reconcile each document with its seed: the re-run offers every section or rule a newer release added, and
never overwrites what you filled in without your choice. `/superdev:setup check` lists those seed gaps without writing anything.
A gap you decline on purpose is recorded in the document's own `## Seed deviations` section and not raised
again. One answer lands outside that tree: the slice store's **assignee** goes to the git-ignored
`.superdev/info.json`, because it identifies you rather than the repository.

- **Slice store.** Where a feature's plan lives: the global **Definition of Done** plus every vertical
  slice (`id`, `depends-on`, `test-applicability`, `spec`, `acceptance`). `/plan` writes it. `/implement`
  reads it, uses its slice count to derive the execution tier, and drives each slice to `merged`. As it
  goes it walks each issue along the tracker's status workflow, mapped at setup: dispatch moves it to
  in-progress, review moves it to in-review, and a merge moves it to done. The **lite** tier has no
  per-slice review, so it skips straight from in-progress to done.
  The choices are:
  - *GitHub Issues*: each slice is an issue and a sub-issue of its epic, with `depends-on` as a native
    `blocked_by` dependency.
  - *Jira*: each slice is an issue, with `depends-on` as an "is blocked by" link.
  - *Forgejo or Codeberg Issues*: each slice is an issue on a Forgejo or Gitea instance. `depends-on` is
    a `**Depends on:**` body-text line, or the native dependency link when the instance's
    issue-dependencies unit is enabled.
  - *other*: you describe your tracker's CRUD and dependency link in prose.

  Setup also asks who owns the created issues. That **assignee** is a login
  or an `accountId`, and it defaults to the API token's own identity, or to `none`. The answer goes to
  `.superdev/info.json`, not to a config doc: the account is yours rather than the repository's, and
  `.superdev/` is git-ignored, so a repository several people maintain records none of them. A checkout
  without the file assigns to whoever the API token belongs to.

  Each slice-store backend also states where it mirrors a run's ledger, the **published snapshot** it
  writes to the scope anchor as a `## Run state` section. `/superdev:implement` reads a live snapshot back
  when no local run root exists, which is what lets a run resume from a fresh clone on another machine. A
  backend whose anchor cannot carry the mirror safely declares itself snapshot-less. Jira defaults to
  this: the run publishes nothing and adopts nothing there.

  Independent of that snapshot, a controller ticks the anchor's own Definition of Done checklist through
  the store's own `## Definition of Done ticks` section as the run works. No backend is exempt: Jira
  ticks its anchor's checklist too, the same as every other store.
- **Code host.** Where the scope branch is pushed and the PR or MR opens, plus the default posture
  (`draft`, `ready`, or `push-only`) and the base branch. The choices are GitHub (`gh`), Forgejo or
  self-hosted (`tea` or REST), and *other*. With no host CLI present, the step degrades to a push plus a
  printed compare URL and a ready-to-run command. The answers go to `docs/agents/code-management.md`.
- **Documentation (in-repo).** How durable technical docs are kept: an **`AGENTS.md` hierarchy**, where
  the root is project-wide and each child covers one boundary. `/plan` also records the glossary
  (`CONTEXT.md`), ADRs (`docs/adr/`), and invariants (the register, `docs/invariants.md`) under this
  convention, and `/document` reconciles it after a scope lands. This doc also names the **writing
  standard** the doc agents write to: `controlled` (the language-neutral rule set in
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
  inactive. A second fenced block holds the focused test command, the one every step inside the loop
  runs: the implementer's TDD loop, the lite tier's inline loop, the slice-reviewer's Lens 2 re-run, the
  green-gate hook, and the documentation step's own run over its doc commits. What defines it is that it
  costs less than the full suite. Setup derives it from the runner it detected — a runner that maps
  source files to the tests covering them gets a `{paths}` form carrying that runner's pass-with-no-tests
  flag, and every other runner gets a fast subset instead. Where the full suite is already cheap or no
  cheaper subset exists, the second fence records the full command again, with the reason as prose beside
  it. A `verification.md` carrying only the first fence records a repository whose focused command was
  never configured: a prose caller finding it stops and names `/superdev:setup`, running no command, and
  `hooks/green-gate.js` runs the full command it found and emits a one-line notice instead of stopping.
  [`references/test-selection.md`](plugin/references/test-selection.md) owns the full-versus-focused rule.
  In a monorepo the full command may take an **affected form**: it runs every project the change reaches,
  dependents included, as the repository's own dependency-graph tool (nx, turborepo, pnpm, or
  `dotnet-affected`) computes them. Such a repository also records an optional `## Whole-repo command`
  section, a command in a backtick span that runs every project's suite. `/superdev:submit-pr` runs it
  before opening the pull request, and `/superdev:ship` merges only a tip it passed on
  ([ADR 0105](docs/adr/0105-an-affected-full-command-and-a-whole-repo-gate-before-the-pull-request.md)).
  Setup writes an affected form only after probing it. The answer goes to `docs/agents/verification.md`.

To add a backend, write a new seed template in `references/` plus a config doc. No command and no agent
changes.

## What superdev writes to your repo

```
docs/agents/*.md          backend config — the docs above (committed)
CONTEXT.md                glossary / ubiquitous language, authored by /plan
docs/adr/NNNN-*.md        architecture decision records, authored by /plan
docs/invariants.md        invariant register — rules the system may never break, authored by /plan
docs/kb/                  knowledge base, only if the local-file KB backend is chosen
.superdev/scopes/<scope>/  git-ignored run scratch, namespaced per scope branch so parallel runs
                          don't collide: the concrete DoD + ledger (both execution tiers), plus
                          per-slice progress logs + the cross-slice interface record + per-slice
                          slicetrees (full tier only, >3 slices), or a single scopetree +
                          run.lock (lite tier only, ≤3 slices) — never committed, never in the PR
.superdev/brainstorm/<intent-slug>.md   git-ignored scratch intent notes, written by /brainstorm as the
                          interview runs, a draft until the handoff marks it ready — sibling to
                          .superdev/scopes/, not inside it, so /status (which
                          only scans .superdev/scopes/*/) never mistakes it for a run root; never
                          committed
.superdev/design/<feature-slug>.html   git-ignored throwaway design sketch, written by /plan only when
                          the operator accepts it — sibling to .superdev/scopes/, not inside it;
                          overwritten per feature slug, never committed
.superdev/kb-pending/<scope>/<title-slug>.md   git-ignored staged pages for a remote knowledge-base
                          backend (a `patch` page instead names itself
                          `<title-slug>--<section-slug>.md`, ADR 0027), written by /plan and /document
                          into the main working tree from any checkout (ADR 0119) instead of a live
                          publish, sent by /publish-kb (ADR 0023); outlives the run root, so /wrap-up
                          never removes it
```

Everything except `.superdev/` is committed. The design docs (the glossary, the ADRs, and the invariant
register) **must** be on the scope branch — `/superdev:plan` commits them there, in the scopetree it cut,
never on the base branch. Both tiers work from fresh scopetree or slicetree checkouts, and a checkout sees
only what is committed. On the full tier those checkouts belong to the per-slice `implementer` subagents.
On the lite tier the controller itself works in the scopetree.

## Worked example

A tiny feature end to end, with GitHub Issues as the slice store and GitHub as the code host:

- **`/superdev:setup`** (once per repo). A short interview, then `docs/agents/*.md` is written. The slice
  store is GitHub Issues and the code host is GitHub (`gh`). The documentation convention is the
  `AGENTS.md` hierarchy, verification is `npm test`, and there is no knowledge base.
- **`/superdev:plan add a health-check endpoint`**. Interviews for the intent and a Definition of Done,
  then creates the issues. New behaviour, so the change type is `feat`, and every issue carries the
  feature label `feat/health-check`. The epic issue holds the DoD and description. Two slice issues sit
  beneath it as sub-issues, for example "Route handler" and "Wire into the router", where the second
  `depends-on` the first through a native `blocked_by` link. You see the slice list printed back, ready
  for `/implement`, along with the tier it runs under. Two slices is 3 or fewer, so the tier is **lite**.
  Releasing the plan applies the `released` label to the epic.
- **`/superdev:implement feat/health-check`**. Sets up `.superdev/scopes/health-check/`, the git-ignored run
  scratch holding the concrete DoD and the ledger. Two slices selects the **lite** tier. The controller
  cuts a single scopetree at `.superdev/scopes/health-check/scopetree/` for the branch
  `feat/health-check`, which is the feature label verbatim. It never switches the
  invoking checkout. It implements the first slice test-first in that scopetree and commits. The second slice then
  unblocks and follows the same loop. There are no per-slice slicetrees and no reviewer subagents. Once
  both slices sit on the scope branch, the controller **stops** and prints the resolved
  `/superdev:review` call. You see a one-line status per slice as it lands.
- **`/superdev:review <range>`**. Dispatches `final-reviewer` and `simplicity-reviewer` against `dod.md`.
  A clean verdict sets the ledger's stage to `reviewed` and prints the resolved `/superdev:document` call.
- **`/superdev:document <range>`**. Reconciles `README.md` and the `AGENTS.md` hierarchy with the two
  merged slices. It sets the stage to `documented` and prints `/superdev:submit-pr health-check`.
- **`/superdev:submit-pr health-check`**. Pushes the scope branch and opens the pull request. You see the
  pull-request URL, and the run stands: the scopetree and the scope anchor are still there.
- **`/superdev:ship health-check`**, once the pull request is reviewed. Merges it and deploys nothing (this
  repository's own deploy posture is `none`), then stops with the stage at `shipped`. Every criterion is already ticked and nothing waits on a deploy,
  so it prints `/superdev:wrap-up health-check`. `/superdev:verify-ship` runs only for a scope with a
  criterion left open or a `manual` deploy to confirm.
- **`/superdev:wrap-up health-check`**. Checks the merge and the deploy record, closes the slice issues and
  the epic, removes the scopetree and the run, and sets the stage `closed`.
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
- For the chosen backends, the relevant CLI or token: `gh`, `tea` with a login for the Forgejo host, or a
  Jira token in an env var. The PR step degrades to a push plus a printed command when a host CLI is
  absent.

## Other harnesses

superdev is a Claude Code plugin, and Claude Code is the only harness it supports (ADR 0102). Release
`v0.54.1` is the last one that carries the OpenCode and Codex renders. If you run superdev under OpenCode
or Codex, stay on `v0.54.1`: later releases carry no render for either.

## Attribution

Distills MIT-licensed material from [superpowers](https://github.com/obra/superpowers) (© Jesse
Vincent) and ponytail (© Dietrich Gebert), plus engineering-skill patterns. The writing standard draws on
ASD-STE100 (© ASD) and cites the tekom Praxisleitfaden as prior art. See `NOTICE`.

## License

MIT. See `LICENSE`.
