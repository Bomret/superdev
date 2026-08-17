# Scope mode

`/superdev:review`, `/superdev:document`, and `/superdev:ship` share one rule (ADR 0013). Each reads this
file at runtime and keeps only what is specific to it. That is the stage it reads or writes, and what it
prints next.

**Several sections below have a wider audience than these three.** `/superdev:implement` and both
execution playbooks read `## Unattended` and `## Degraded passes`; `/superdev:implement` and
`/superdev:afk` both read `## The scope slug`, which in turn sends both to `## The change type` for its
eleven-type list; `/superdev:afk` also relies on `## The run lock` and `## The scope checkout`; and
`## The ledger` is read by `/superdev:implement`, `/superdev:status`, and `/superdev:ship`, besides
`/superdev:review` above. A run is unattended from its first command, so the token cannot wait for the
stage where the other rules begin.

## The scope slug

A scope slug must match `[a-zA-Z0-9][a-zA-Z0-9_-]*`. It becomes the second segment of a branch name
(`<type>/<slug>`, per `## The change type` below) and a
run-root path segment (`.superdev/scopes/<scope>/`), and every source it comes from — a feature label
resolved from the slice store, an epic's feature label read off a tracker anchor — hands it over as
external input with no such guarantee: a stray `/`, a leading `-`, `..`, a space, or `~` are all legal
label characters, and none are safe in either place.

**Validate both segments.** A feature label is `<type>/<slug>`, and the whole label becomes the branch
name — so the type reaches `git switch -c` exactly as the slug does, and the same argument covers it.

- **The slug** — what follows the first `/` — matches the charset above. On a store that renders the label
  as a path (`docs/plans/<type>/<slug>/`), the label is still `<type>/<slug>`: take the slug from the
  label, never a fragment of the rendered path.
- **The type** — what precedes it — is one of the eleven in `## The change type` below, matched exactly.
  This is stronger than a charset test: a label leading with `-x` reaches git as an option, and a type
  outside the set makes `hooks/scope-prune.js` misread a live, unmerged branch as gone — gone is one of
  the two conditions a scope needs to be prunable (ADR 0007) — and reap a run root still in progress.

**Either segment failing is the same stop.** Say which one failed and why, and build no branch and no path
out of the label. A label with no `/`, or with an empty segment on either side, fails here too.

## The change type

A scope branch is `<type>/<slug>`. `<type>` is the **change type**: the Conventional Commits type of the
work the feature does, one of `feat`, `fix`, `refactor`, `docs`, `perf`, `test`, `build`, `ci`, `chore`,
`style`, `revert`. It leads the feature label the slice store carries, so a run reads the type off that
label instead of choosing one. `/superdev:plan` picks it when it writes the plan, and the branch, the
label, and the slice commits then all say the same thing about what the work is.

The scope branch is the feature label verbatim. The run root is keyed on the slug alone
(`.superdev/scopes/<scope>/`), so it never doubles the type into a path segment, and every command finds a
run root from a scope slug without knowing the type.

## A live scope run

A range or a scope slug names a live run when two conditions hold. Its head is the scope branch
`<type>/<scope>`. A run
root exists for that scope. A run root is a `.superdev/scopes/*/` directory that holds a `ledger.md`.

Capture `<run-root>` as the absolute path to `.superdev/scopes/<scope>/`. Do this while the invoking
checkout is still the current directory. Address every run-root artifact by that absolute path:
`<run-root>/ledger.md`, `<run-root>/dod.md`, and `<run-root>/run.lock`.

## The ledger

`<run-root>/ledger.md` is one document: labeled header lines, then a slice table.
`${CLAUDE_PLUGIN_ROOT}/scripts/scope.js` owns its schema and is its only read and write path (ADR 0022):
`init` creates the document, `stage` / `slice` / `degraded add` move it, and `get` / `status` read it
back. No command or playbook edits or parses the file directly — the `ledger-guard` hook denies any
other write, naming `scope.js`.

**The slice table** (written by `init` from the slice JSON it receives, moved row by row with
`slice <id> <status>`, read back with `get slices`) carries one row per slice: its id, store issue,
title, `test-applicability` type, dependencies, `plan-contract.md` status, and commit range.

**The header lines**, above the table:

- **`**Stage:**`** — how far the scope has moved through the chain. Read with `get stage`, written with
  `stage set <value>`; `## The stage never moves backwards` below owns the value set, and `scope.js`
  enforces its write rules in code.
- **`**Branch:**`** — the scope branch. `## The scope branch` below owns how it is written and resolved.
- **`**Anchor:** <key> — <title>`** — the scope anchor's store key and title, e.g. `**Anchor:** #183 —
  Audit fixes`. `/superdev:implement` Phase 0 hands it to `init`, per the store's `## Scope anchor`
  contract (`docs/agents/issue-tracker.md`); `/superdev:review` reads the title back with `get anchor`
  for the PR-facing summary (ADR 0020) instead of deriving one from the diff.
- **`**Degraded:**`** — the run's degrade record. `## Degraded passes` below owns the value shape and when
  a command writes it.
- **`**Unresolved:**`** — the run's unresolved-defect record. `## Unresolved defects` below owns the value
  shape and when a command writes it.

A ledger written before a line existed carries none of it — `scope.js` parses a pre-CLI ledger
unchanged, and `get` reports an absent header line as `absent`, never as a parse error.

## The scope branch

A scope slug does not name its branch. The type leads the branch and the slug follows it, and nothing
recovers a type from a slug — so read the branch rather than compute it.

- **The ledger's `**Branch:**` line.** `/superdev:implement` Phase 0 writes it, beside `**Stage:**`
  (`scope.js init` writes both from the feature label). Read it with
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js get branch --root <run-root>`, then verify it with
  `git rev-parse --verify <branch>` before trusting it — Phase 0 writes the line before it
  cuts the branch, so a run that died in between leaves a ledger naming a branch that was never cut. It
  verifies → this is the answer. A command that receives only a scope slug still finds the run root from
  that slug, and the branch from this line.
- **No such line, or the named branch does not verify — fall back to the shape.** A ledger written before
  the line existed carries none, and one written but not yet followed by a cut branch names one that does
  not exist. Scan the branches for one whose last segment is `<scope>` and whose leading segment is a
  change type, which is the rule `hooks/scope-prune.js` applies. **Say which route you took**, because
  this one is a guess: two runs whose slugs differ only by their change type both match, and the scan
  cannot separate them. **No branch matches** → say so and stop, rather than proceeding against whatever
  HEAD happens to be.

## Cutting the scope branch

`/superdev:implement`'s Phase 0 computes this run's **run kind** — `CONTEXT.md`'s glossary entry names all
three values — and hands it to the execution playbook it reads. Both playbooks act on that value instead
of deriving it a second time from git state.

- **`fresh`** — no ledger existed, so the scope branch does not exist either. Cut it from `<base>`:
  `git switch -c <type>/<scope> <base>` on the `full` tier, and
  `git worktree add <path> -b <type>/<scope> <base>` on the `lite` tier. **The name already exists** — a
  prior scope's branch survived a non-squash merge and outlived its reaped run root
  (`hooks/scope-prune.js`'s seven-day TTL, ADR 0007): `-c` and `-b` both fail rather than reset it, which
  is the safe outcome. Stop, name the branch found, and cut nothing — a human renames or deletes it
  before the run retries.
- **`appended`** — a `shipped` ledger was rotated aside, and the branch may have survived its pull request,
  because `/superdev:ship` opens the request from that branch and never deletes it. Read `<branch>` from
  the ledger's own line — `scope.js get branch --root <run-root>`, then `git rev-parse --verify <branch>` —
  rather than resolving it per `## The scope branch` above, whose shape-scan fallback risks a foreign
  branch; this step cuts and hands the name onward, unlike that section's read-only callers. Then decide on
  the same test that decides a scope is finished with (ADR 0007): merged into `<base>`, or gone entirely —
  the test `hooks/scope-prune.js` runs and
  `commands/plan.md`'s refusal bullet reads back, not a bare `git merge-base --is-ancestor` on a name a
  squash-merging host already deleted, which exits 128 rather than answering true or false. **Gone** —
  `<branch>` does not verify: nothing survives to reuse, so cut fresh from `<base>` exactly as `fresh`
  does. **Present** — test containment with `git merge-base --is-ancestor <branch> <base>`. **Contained**
  — `<base>` holds every commit on the branch, so reuse loses nothing: the `full` tier switches to the
  branch — stopping first when that checkout is dirty or another worktree holds the branch, naming what
  it found, the same stop `resumed` takes below — then runs `git merge --ff-only <base>`, and the `lite`
  tier works in its existing scope worktree when one already holds the branch, stopping first when a
  different worktree holds it instead, or otherwise runs `git worktree add <path> <branch>` — either way
  then fast-forwarding inside that worktree — the same either-or `resumed` takes below when `/superdev:ship`
  has or has not removed that worktree.
  **Not contained** — commits live only on that branch: print `git log <base>..<branch> --oneline` so
  the operator sees what is at risk, ask, and print
  `git branch -m <branch> <branch>-<date>` as the remedy. **`--unattended` → block**, per `## Unattended`.
  A code host that squash-merges and deletes the branch on merge reads gone here; one that squash-merges
  without deleting it reads present and not contained, so it asks — the ordinary outcome there.
- **`resumed`** — the branch holds unmerged slice work by design, so no ancestor test runs and nothing is
  cut. Read `<branch>` from the ledger's own line — `scope.js get branch --root <run-root>`, verified with
  `git rev-parse --verify <branch>` — never by rebuilding `<type>/<scope>` and never through `## The scope
  branch` above's shape-scan fallback, which can return a foreign branch just as it can for `appended`. A
  `resumed` branch is expected to exist, so a name that does not verify is a stop, not a fallback to guess
  from — say so rather than proceeding on a shape match. The `full` tier switches the invoking checkout
  onto it, and stops, naming what it found, when that checkout is dirty or another worktree holds the
  branch. The `lite` tier
  works in its existing scope worktree, and reattaches the branch with `git worktree add <path> <branch>`
  when `/superdev:ship` has already removed that worktree.

**No forcing flag, at any run kind.** `git switch -C` and `git worktree add -B` reset the branch to
`<base>` and leave every slice already merged into it unreachable from any ref, while the ledger still
records those slices as `merged` — so nothing in the run rebuilds what it lost (ADR 0028). Fast-forwarding
to `<base>` is the one re-pointing this rule permits.

**Every stop above writes nothing.** No run starts and no ledger entry is written. None of them is a
degraded pass either: `## Degraded passes` records work done a lesser way, and here no work happens.

## The scope checkout

**Resolve the scope branch first**, per `## The scope branch` above, never from the slug alone. Then find
the working tree that holds it, from disk.

- `.superdev/scopes/<scope>/worktree` exists. That directory is the scope checkout, from a `lite` run. Run
  every git command that writes to the scope branch with it as the current directory.
- No such directory exists. The invoking checkout holds the branch, because a `full` run left it switched
  to it. Confirm with `git rev-parse --abbrev-ref HEAD`. A different branch means the
  checkout is wrong. Say so and stop. When the ledger's `**Stage:**` line reads `shipped`, say instead
  that `/superdev:ship`'s §6 returned this checkout to base by design, and that `git switch
  <type>/<scope>` restores it before a writing command re-runs. On a read-only command, review
  read-only instead.

## The run lock

Refresh `<run-root>/run.lock` if the file exists. Never create it.

`references/implement-lite.md` is the only place that creates the lock. The `run-lock` hook guards one
operation, `git worktree add` on a scope worktree. Only the `lite` tier runs that operation. A `full` run
has no worktree to guard, so it never gets a lock. A command that created one anyway would guard an
operation that never happens. `/superdev:ship` would then delete a file no run made.

The lock's mtime marks the run as live across the whole chain. The `run-lock` hook treats a lock older
than an hour as dead. Each command in the chain refreshes the mtime at its own step.

## Unattended

`--unattended` in a command's arguments means nobody is watching this invocation. `/superdev:afk` passes
it on every command it drives. It is an argument and never a run-root field, so it cannot outlive the run
that passed it (ADR 0016): a sweep interrupted at any point leaves the next command a maintainer types
asking its questions exactly as it always did.

**Take it out before parsing anything else.** The token is never part of the range, the area path, or the
scope slug a command resolves from its remaining arguments — strip it first, wherever it sits, then parse
what is left.

**A command carrying the token never asks a question, and never starts an interview command** (e.g.
`/superdev:setup`, `/superdev:plan`) **either** — nobody is there to answer that interview's questions
any more than this one's. At each stop where it would otherwise do either:

- **A standing answer is written at that stop** → take it. Each stop states its own, next to the question
  it replaces.
- **No standing answer is written** → **block**, and stop. This catch-all is what keeps a question added
  later from stalling a whole run: an unanswerable stop costs one scope anchor, not the night.

**Blocking** means: move the slice, where one is in play, and the scope anchor to `blocked` per the status
map in `docs/agents/issue-tracker.md`; comment on the anchor naming the stop that was reached and why; then
stop, leaving the scope branch standing and unshipped. A store with no comment concept records the same
reason in the anchor's body. Both writes are best-effort, as every status write is — the ledger drives
control flow, so a failed write is logged and the block still holds.

**Without the token nothing changes.** Every command asks exactly what it asks today, in the same words.

## Degraded passes

A **degraded pass** is a step of the chain that did not get the assurance the chain promises. Two shapes
occur, and each takes its own action:

- **A dispatch the permission classifier denies.** The controller asked for an independent pass and did
  not get one. A prompt-rewriting plugin installed alongside superdev can trigger this, because the
  subagent's prompt reaches the classifier carrying text the controller never wrote. **Attended** → do
  the pass inline, say so in the report, and write the entry below — an inline pass is worth more than no
  pass, and worth less than an independent one, which is what the entry records. **Unattended** →
  **block**, per this file's `## Unattended` section, which owns what blocking means. Nobody is there to
  weigh an inline pass, and a pull request whose only review was its author reviewing itself is the
  outcome this rule exists to prevent. The block comment names the denied dispatch, **and the entry below
  is written too**: the comment tells the tracker, and the bullet tells the run, which is what
  `/superdev:status` reads and what a maintainer resuming the scope by hand sees first.
- **A pass that cannot complete its own work.** The step ran, and something it needed was unreachable. A
  knowledge-base pass the writer could not stage is the live case: the pass reaches no backend, so what
  remains is a staging path it could not write. **Record and continue, attended or unattended alike** —
  the step already ran what it could, so blocking the night's sweep on a staging path it cannot write
  protects nothing that inlining protects in the first shape.

**Recognising a denial.** It comes back as a permission refusal naming the classifier. A failed dispatch
that is not that — a timeout, a network error, any other tool failure — is an ordinary error to retry or
report, not a degraded pass.

**A pass the command was already free to skip is not degraded when denied.** `/superdev:review`'s §2 is
the standing case: it already skips `simplicity-reviewer` on judgment (a tiny or already-lean diff), so a
denied dispatch there records nothing — the run loses nothing it was not already choosing to skip. Any
command with a similar judgment-call skip defers to this rule rather than stating its own.

Neither shape is a failure of the code under review, so neither stops a run on its own except where the
first shape's unattended path blocks. What matters is that the run's shortfall stays visible after the
session that saw it has ended.

**The entry.** A `**Degraded:**` line in `<run-root>/ledger.md`, beside `**Stage:**`, carrying one bullet
per degraded pass. Write each bullet with
`node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js degraded add "<text>" --root <run-root>`, which creates the
line when absent and appends when present. Each bullet names the pass, why it degraded, and the date:

```markdown
**Stage:** reviewed
**Degraded:**
- whole-scope review ran inline — final-reviewer dispatch denied by the permission classifier (2026-08-02)
```

A run with nothing to report carries **no such line at all**. The line is absent, never present and
empty. **An ad-hoc run — no run root exists** — has nowhere to write it: report the degraded pass in that
command's own output instead, and write nothing.

**A degraded pass is not a stage.** It is the line above, never a new stage value — ADR 0018 has the
reasoning.

## Unresolved defects

An **unresolved defect** is a defect the run finds in the code and leaves standing: a full suite still
red at the three-strike cap, a finding the operator declines to fix, or an unattended block reached at
that cap. It answers a different question than `## Degraded passes` above — that section says how much
of the chain ran; this one says whether the branch is sound (ADR 0026).

**A command writes the entry where the run gives up**, never where the defect first appears. A defect
found and then fixed leaves no trace, because nothing is left standing.

A **blocked slice** is not an unresolved defect. It already carries a durable record, its own `blocked`
status in the ledger's slice table (`plan-contract.md`). This line is for scope-level defects, which have
none.

**The entry.** An `**Unresolved:**` line in `<run-root>/ledger.md`, beside `**Stage:**`, carrying one
bullet per unresolved defect. Write each bullet with
`node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js unresolved add "<text>" --root <run-root>`, which creates
the line when absent and appends when present. Each bullet names the defect, where it stands, and the
date:

```markdown
**Stage:** reviewed
**Unresolved:**
- full suite red at the three-strike cap — two tests in payment/checkout still fail (2026-08-12)
```

A run with nothing to report carries **no such line at all**. The line is absent, never present and
empty.

**`unresolved clear` drops the whole line.** A run that resumes, fixes the defect, and re-verifies the
scope with a green suite clears the record with
`node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js unresolved clear --root <run-root>`. Clearing is wholesale,
never per-bullet: the run that clears the line has re-verified the whole scope, so no bullet needs to
survive individually. `unresolved clear` on a ledger carrying no such line succeeds and changes nothing.

## The stage never moves backwards

`/superdev:review` and `/superdev:document` both write the ledger's `**Stage:**` line — through
`scope.js stage set`, which enforces every rule in this section in code and refuses a write that breaks
one: **a stage write never undoes completed work.** `shipped` is what stops
`/superdev:ship` from opening a second pull request, so a later command that overwrote it with an earlier
stage would disarm that check. `documented` and `shipped` are therefore terminal. No command in the chain
writes over either one.

The rule protects work that is still valid, not the ordering of the values. One move that reads as
backwards is sanctioned, because it records a fact rather than a distance: `/superdev:review` writes
`reviewed` over `documented-unreviewed` when its fix loop landed commits. The doc pass really did run, and
those commits made it stale, so the run needs it again. The stage is one scalar, so it cannot say "reviewed
and documented, but documented too early". `reviewed` is the value that gets the doc pass re-run, which is
the outcome that matters.
