# Scope mode

`/superdev:review`, `/superdev:document`, and `/superdev:submit-pr` share one rule. Each reads this
file at runtime and keeps only what is specific to it: the stage it reads or writes, and what it prints
next.

This file holds the run basics: the scope slug, the change type, a live scope run, resolving an empty
argument, the scope branch, the scope checkout, the run lock, the scope's range base, `## Unattended`, the
verification ceiling, and the stage rule. The other sections moved into four files by job. A
citation of one of them written against this file, with the section's heading, leads here, to the file that holds it:

- **`scope-branch.md`** — `## Containment`, `## Cutting the scope branch`, `## Pushing the scope branch`,
  `## Bringing the scope branch to base`.
- **`run-state.md`** — `## The ledger`, `## Publishing run state`.
- **`scope-findings.md`** — `## Degraded passes`, `## Unresolved defects`, `## Deferred findings`,
  `## Warm cycles`, `## Observations`.
- **`shipped-run.md`** — `## Reading the posture at the merge commit`, `## Routing a shipped run`,
  `## Adopting a shipped original`, `## Staged pages at close`.

**Several sections have a wider audience than these three.** `/superdev:implement` and both
execution playbooks read `## Unattended`, `scope-findings.md`'s `## Degraded passes`, `## The run lock`, `## The scope
checkout`, and `scope-branch.md`'s `## Bringing the scope branch to
base` (`/superdev:review` also reads it) and `## The scope's range base`. `/superdev:implement`
reads `## The scope slug`, which sends it to `## The change type`. `run-state.md`'s `## The ledger` is read by
`/superdev:implement`, `/superdev:status`, and `/superdev:submit-pr` besides `/superdev:review`. `##
Resolving an empty argument` is read by `/superdev:implement`, `/superdev:review`, and
`/superdev:submit-pr` on their own empty-argument entrance. `/superdev:plan` reads `scope-branch.md`'s `## Cutting the scope
branch`, `## Containment`, and this file's `## The run lock` for its own cut. A run is unattended from its
first command, so the token cannot wait for the stage where the other rules begin.

## The scope slug

A scope slug must match `[a-zA-Z0-9][a-zA-Z0-9_-]*`. It becomes the second segment of a branch name
(`<type>/<slug>`, per `## The change type`) and a run-root path segment (`.superdev/scopes/<scope>/`).
Every source it comes from — a feature label resolved from the slice store, an epic's feature label read
off a tracker anchor — is external input with no such guarantee: a stray `/`, a leading `-`, `..`, a
space, or `~` are all legal label characters and none are safe in either place.

**Validate both segments.** A feature label is `<type>/<slug>`, and the whole label becomes the branch
name, so the type reaches `git worktree add … -b` exactly as the slug does.

- **The slug** — what follows the first `/` — matches the charset above.
- **The type** — what precedes it — is one of the eleven in `## The change type`, matched exactly.
  A label leading with `-x` reaches git as an option. A type outside the set makes `hooks/scope-prune.js`
  misread a live, unmerged branch as gone, one of the three conditions a scope needs to be prunable,
  alongside the staleness TTL and a `closed` stage.

**Either segment failing is the same stop.** Say which one failed and why, and build no branch and no
path out of the label. A label with no `/`, or an empty segment on either side, fails here too.

## The change type

A scope branch is `<type>/<slug>`. `<type>` is the **change type**: the Conventional Commits type of the
work, one of `feat`, `fix`, `refactor`, `docs`, `perf`, `test`, `build`, `ci`, `chore`, `style`,
`revert`. It leads the feature label the slice store carries, so a run reads the type off that label
instead of choosing one. `/superdev:plan` picks it when it writes the plan.

The scope branch is the feature label verbatim. The run root is keyed on the slug alone
(`.superdev/scopes/<scope>/`), so every command finds a run root from a scope slug without knowing the type.

## A live scope run

A range or a scope slug names a live run when two conditions hold: its head is the scope branch
`<type>/<scope>`, and a run root exists for that scope. A run root is a `.superdev/scopes/*/` directory
holding a `ledger.md`.

Capture `<run-root>` with `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js root <scope>`'s printed absolute
path — the repository's main working tree, whichever checkout the command runs from. Build no
path against the invoking checkout's own cwd. Address every artifact by that absolute path:
`<run-root>/ledger.md`, `<run-root>/dod.md`, `<run-root>/run.lock`.

## Resolving an empty argument

A command that takes a scope argument and accepts it empty names its own **candidate set** (CONTEXT.md).
This section owns the one cascade that resolves whichever set a caller hands it:

- **Exactly one candidate** — use it.
- **Several candidates** — list each one with its stage, and ask the operator which one to use.
  **`--unattended`** → block instead of asking, per `## Unattended`, naming the candidates found.
- **No candidate** — report that none exists, together with every run root the repository does hold and
  that run root's own stage, and stop. Never guess at a subject nothing named.

A caller may add its own step after a no-candidate result, in place of the stop. That step still
reports every run root with its stage before it acts: `/superdev:review` reads standing code of the whole
repository there.

**Run-root enumeration.** A run root is a `.superdev/scopes/*/` directory holding a `ledger.md`, per
`## A live scope run`. The calling command names the stages that qualify — `/superdev:submit-pr`
names every stage but `shipped` and `closed`, `/superdev:review` names `merged` and `documented-unreviewed`.
This section scans every run root, reads each one's stage with `scope.js get stage --root <run-root>`, and
keeps only the ones whose stage is named. A directory holding no `ledger.md` is no run root and never
a candidate. A run root whose `get stage` prints `absent` matches no named stage and is never a
candidate. `/superdev:implement` reads its candidate set from the slice store (the features whose
slices are ready) and hands that set straight to this cascade, so this
section never enumerates run roots on its behalf.

**A caller that cannot ask stops and lists instead.** `plugin/scripts/publish-kb.js` has no interview
loop behind it. With several candidates, or none, it refuses and lists them, the same shape this
section's several-candidate and no-candidate branches print.

## The scope branch

A scope slug does not name its branch: the type leads and the slug follows, and nothing recovers a type
from a slug. Read the branch rather than compute it.

- **The ledger's `**Branch:**` line.** Run init writes it beside `**Stage:**`
  (`scope.js init` writes both from the feature label). Read it with
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js get branch --root <run-root>`, then verify with
  `git rev-parse --verify <branch>` before trusting it: run init writes the line before it cuts the
  branch, so a run that died in between names a branch that was never cut. It verifies → this is the
  answer. A command given only a scope slug still finds the run root from that slug, and the branch here.
- **No such line, or the named branch does not verify — fall back to the shape.** Scan the branches for
  one whose last segment is `<scope>` and whose leading segment is a change type, the rule
  `hooks/scope-prune.js` applies. **Say which route you took**, because this one is a guess: two runs
  whose slugs differ only by change type both match, and the scan cannot separate them. **No branch
  matches** → say so and stop, rather than proceeding against whatever HEAD happens to be.

## The scope checkout

**Resolve the scope branch first**, per `## The scope branch`, never from the slug alone. Then find the
working tree holding it, from disk.

`<run-root>/scopetree` is the scope checkout, at both tiers. Run every git
command that writes to the scope branch there — `git -C <run-root>/scopetree ...` — never in
the invoking checkout, which stays wherever it was.

- **Present** → work there.
- **The ledger's `**Stage:**` reads `shipped` or `closed`, and the checkout is absent** → `/superdev:wrap-up`'s
  cleanup, or an operator, removed it. No command recreates it at `closed`, a terminal stage nothing
  removes scaffolding from. A read-only command (`/superdev:review`, `/superdev:document`,
  `/superdev:verify-ship`, `/superdev:wrap-up`) says so and reviews or reconciles read-only, and recreates no checkout. A writing
  command has nothing left to write to a shipped scope.
  **The one exception is `/superdev:ship` itself, reading any `shipped` ledger.** Its §3 reads the posture
  with `git show` from the invoking checkout, which needs no scope checkout. Ship recreates the checkout
  below, as an `Absent` one does, in one case only: a ledger whose `auto` deploy stopped mid-way, whose §5
  detaches it.

  A `shipped` ledger with nothing left to deploy, or a posture other than `auto`, is
  "already shipped". Ship recreates no checkout for it.
- **Absent** → recreate it: `git worktree add <run-root>/scopetree <branch>`, the same call
  the `resumed` run kind already makes. The run's own lock stays as it is: no hook refuses the call.
  **Prepare the recreated scopetree** before its first test run:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" prepare <run-root>/scopetree`, per `scope-branch.md`'s
  `## Preparing a worktree`; a failing preparation stops the command, and `--unattended` blocks.
- **A different working tree already holds `<branch>`** → git's own refusal on that `worktree add` call
  names the tree holding it. Say so and stop, writing nothing, rather than switching a checkout superdev
  does not own.

## The run lock

**`/superdev:implement`'s own entry into an existing run root consults liveness before its first write**, because a second, independent invocation can redispatch onto a scope already
mid-implementation. `run-init.md`'s entry step reads the ledger's stage (`scope.js get stage`) and the lock's mtime together,
before `dod.md` is written or the ledger's stage moves:

- **Stage `planned`, any lock age** — `/superdev:plan` cut this and nobody has implemented a slice yet.
  This is the ordinary hand-off, not a collision: proceed, exactly as the rest of this section describes.
- **Any stage other than `planned`, with a lock under an hour old** — a live implement run (`CONTEXT.md`). Attended:
  name the lock's age and content and the ledger's stage, and ask whether to continue. Unattended: block,
  per `## Unattended` below.
- **A stale (over an hour) or absent lock, at any stage** — proceed, exactly as the rest of this section
  describes.

**This check governs `/superdev:implement`'s own entry alone.** `/superdev:review`,
`/superdev:document`, `/superdev:submit-pr`, and `/superdev:ship` skip it: each enters at the chain's
designed hand-off, with a fresh lock by construction.

The check does not cover these:

- A run that writes no trace line for over an hour, such as a read-only reviewer dispatch that long: its lock goes stale while it works.
- A session end: its closing trace lines leave the lock fresh for an hour after the session stopped.
- Another session's work in the run's trees: its trace lines keep the run's lock fresh too.
- An identity scheme in the lock's content: it stays freeform text a human reads, where the check asks, to judge self from another session.
- The `planned`-stage window: two `/superdev:implement` invocations that both enter while the stage reads `planned` both proceed. Only the stage's advance to `implementing` in `run-init.md` closes it.

**`/superdev:plan` checks through `scope.js open`, unaffected by the rule above.** Each plan run writes a
nonce of its own into the lock, `plan <nonce>`, and passes it back on its later calls. `open` stops with
`locked` on a lock under an hour old that names another nonce: with no live ledger, any such lock; on a
`planned` ledger, only while the ledger's step stands, the rule `/superdev:status` applies to a run live in
another session.

**Write `<run-root>/run.lock` once `scope-branch.md`'s `## Cutting the scope branch` has cut the scopetree, at both
tiers**, and once `/superdev:plan` has made its own cut. Refresh the file if it already exists, the case a `resumed` run finds, once
`/superdev:implement`'s own liveness check above has passed. The execution playbooks and `/superdev:plan` each write the lock
into the run root right after their own cut. Plan's `scope.js open` writes it, refreshes it on plan's §6 call, and checks it itself. **On a `resumed` run, the liveness check above is what tells a live second
`/superdev:implement` invocation from this run's own stale or absent lock.** The playbook's own Resume
section only reconciles the ledger against `git log` and performs no liveness check.

**Every other caller — `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, `/superdev:ship`,
`/superdev:verify-ship`, `/superdev:wrap-up` — only ever refreshes this file. Never create it.** A tail command reaches a scope only after an execution playbook, or
`/superdev:plan`, already ran, so a missing lock there means no live run to refresh.

The lock's mtime marks the run as live across the whole chain. A lock older
than an hour is dead (`scope.js open` and implement's entry check read that bound). Each command in the chain refreshes the mtime at its own step, and every line written to the run's
`trace.log` refreshes it too: the run-trace hook's edit, run, and dispatch lines and the `scope.js` verbs'
lines keep a working run live between those steps. That refresh creates no lock and leaves its content as it is.

## The scope's range base

The **range base** is the commit every range of a scope's own work starts from: review's range, the doc
pass, run handoff's `BASE`, resume's cross-check, and ship's `deployment.md` diff are all
`<range-base>..<branch>`. It is the newer of two candidates: `merge-base(<base>, <branch>)`,
and the tip the base step recorded in the `**Base:**` header (`run-state.md`'s `## The ledger`), when that record
resolves to a commit and is an ancestor of `<branch>`. The newer candidate is the one the other is an
ancestor of. With no usable record, or with two candidates where neither holds the other, the range base
is `merge-base(<base>, <branch>)`.

The record keeps a merged remote tip out of a scope's range while the local `<base>` lacks it
(the usual setup, where git refuses to fast-forward a checked-out `<base>`). The local `<base>` may also
run ahead of the record, after a later pull or a ship that merged a newer base, and `merge-base` is the
newer candidate then. One limit stays: when the local `<base>` holds commits never pushed and a merge
brought it into `<branch>` (ship §4 or the degraded path) while a tip is on record, the two candidates are
incomparable, the fallback applies, and the recorded tip's remote
commits can enter the range.

**Compute it with the verb, never by hand.** On a live scope run:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" base resolve --branch <branch> --base <base> --root <run-root>`
prints it. An ad-hoc range with no run root has no record, so `merge-base(<base>, <branch>)` is its
base. Containment (`scope-branch.md`'s `## Containment`) asks a different question, whether the branch's work is in
`<base>`, and keeps its own test.

## Unattended

`--unattended` in a command's arguments means nobody is watching this invocation. Whoever invokes a
chain command passes it. It is an argument and never a run-root field, so it cannot outlive the run
that passed it: the next command a maintainer types after an interrupted unattended run
asks its questions as usual.

**Take it out before parsing anything else.** The token is never part of the range, the area path, or the
scope slug a command resolves from its remaining arguments.

**A command carrying the token never asks a question, and never starts an interview command** (e.g.
`/superdev:setup`, `/superdev:plan`) **either**: nobody is there to answer. At each stop where it would otherwise do either:

- **A standing answer is written at that stop** → take it. Each stop states its own, next to the question
  it replaces.
- **No standing answer is written** → **block**, and stop. This catch-all keeps a question added later
  from stalling a whole run: an unanswerable stop costs one scope anchor, not the run.

**Blocking** means: move the slice, where one is in play, and the scope anchor to `blocked` per the
status map in `docs/agents/issue-tracker.md`; comment on the anchor naming the stop reached and why; then
stop, leaving the scope branch standing and unshipped. A command whose step stands runs `scope.js step block`
before that stop, per `run-state.md`'s `## The ledger` exit rule. **A block at the denial cap names
`scope.js degraded reset-denials` in that comment**, beside the quoted refusal, so the maintainer who
fixes the cause finds the way back (`scope-findings.md`'s `## Degraded passes` states it in
full: the reset call plus clearing the `blocked` label this same procedure just wrote). A store with no
comment concept records the same reason in the anchor's body. Both writes are best-effort, as every
status write is: the ledger drives control flow, so a failed write is logged and the block still holds.

**Without the token nothing changes.** Every command asks exactly what it asks today, in the same words.

## Verification ceiling

**Verifying a Definition-of-Done criterion observes.** It changes no system outside the repository. A criterion needing a deploy, a migration, or any other outward-facing change to
verify stays unticked, with a note naming what it needs, for the operator to verify after merge.

## The stage never moves backwards

These writers move the ledger's `**Stage:**` line — `/superdev:review`, `/superdev:document`, run handoff
(`merged`), `/superdev:submit-pr` (`submitted`), `/superdev:ship` (`shipped`), and `/superdev:wrap-up` (`closed`) — all through `scope.js
stage set`, which enforces every rule in this section in code and refuses a write that breaks one: **a
stage write never undoes completed work.**

- `shipped` stops `/superdev:ship` from merging a second time.
  A later command overwriting the stage with an earlier one would disarm that check.
- `closed` is the terminal stage: nothing outranks it, `stage set` refuses any move out of it, and `hooks/scope-prune.js` reaps only a run root that reads it.
- `shipped` is not terminal.
- `submitted` is an ordinary in-flight stage: `/superdev:submit-pr`'s own stage gate, not the rank rule, keeps a second run from opening a
  second pull request.
- `documented` is not terminal either, since `documented → submitted → shipped` is the chain's own last move.

The rule protects work that is still valid, not the ordering of the values. One move that reads as
backwards is sanctioned, because it records a fact rather than a distance: `/superdev:review` writes
`reviewed` over `documented-unreviewed` when its fix loop landed commits. The doc pass really did run,
and those commits made it stale. The stage is one scalar, so it cannot say "reviewed and documented, but
documented too early"; `reviewed` is the value that gets the doc pass re-run.
