# Scope mode

Applies to every command that works on a scope run. Read the section your command cites at runtime, and keep only
what is specific to your command: the stage it reads or writes, and what it prints next.

## Section map

**Where each section lives.** Applies to a citation of a scope-run section written against this file. Each list item
names the file that holds the sections it maps. Read a mapped section from the file its item names.

- **`scope-mode.md`** — `## The scope slug`, `## The change type`, `## A live scope run`, `## Resolving an empty
  argument`, `## The scope branch`, `## The scope checkout`, `## The run lock`, `## The scope's range base`,
  `## Unattended`, `## Verification ceiling`, and `## The stage never moves backwards`.
- **`scope-branch.md`** — `## Containment`, `## Cutting the scope branch`, `## Preparing a worktree`,
  `## Pushing the scope branch`, and `## Bringing the scope branch to base`.
- **`run-state.md`** — `## The ledger` and `## Publishing run state`.
- **`scope-findings.md`** — `## Degraded passes`, `## Unresolved defects`, `## Deferred findings`,
  `## Warm cycles`, and `## Observations`.
- **`shipped-run.md`** — `## Reading the posture at the merge commit`, `## Routing a shipped run`,
  `## Adopting a shipped original`, and `## Staged pages at close`.

**Who reads what.** Applies to a command deciding which scope-run sections it reads. `/superdev:review`,
`/superdev:document`, and `/superdev:submit-pr` read the whole rule. The other readers are these:

| Reader | Sections |
|---|---|
| `/superdev:implement` and both execution playbooks | `scope-mode.md`'s `## Unattended`, `## The run lock`, `## The scope checkout`, `## The scope's range base`, and `## The scope slug` with `## The change type`; `scope-findings.md`'s `## Degraded passes`; `scope-branch.md`'s `## Bringing the scope branch to base` |
| `/superdev:review` | also `scope-branch.md`'s `## Bringing the scope branch to base` |
| `/superdev:implement`, `/superdev:status`, `/superdev:submit-pr`, `/superdev:review` | `run-state.md`'s `## The ledger` |
| `/superdev:implement`, `/superdev:review`, `/superdev:submit-pr`, on an empty argument | `scope-mode.md`'s `## Resolving an empty argument` |
| `/superdev:plan`, for its own cut | `scope-branch.md`'s `## Cutting the scope branch` and `## Containment`; `scope-mode.md`'s `## The run lock` |

A run is unattended from its first command, so every reader applies `## Unattended` from that command on.

## The scope slug

**The charset.** Applies to every scope slug, from any source. A slug matches `[a-zA-Z0-9][a-zA-Z0-9_-]*`. It becomes
the second segment of a branch name (`<type>/<slug>`, per `## The change type`) and a run-root path segment
(`.superdev/scopes/<scope>/`).

**Validate both segments.** Applies to every feature label `<type>/<slug>`, which is external input. The whole label
becomes the branch name, so validate both segments before you build anything from it.

- **The slug**, what follows the first `/`, matches the charset.
- **The type**, what precedes it, is one of the change types in `## The change type`, matched exactly.

**Either segment failing is the same stop.** Applies to a label whose slug or type fails, a label with no `/`, and a
label with an empty segment on either side. Say which segment failed and why. Build no branch and no path out of the
label.

## The change type

**The type.** Applies to every scope branch `<type>/<slug>`. `<type>` is the **change type**: the Conventional Commits
type of the work, one of `feat`, `fix`, `refactor`, `docs`, `perf`, `test`, `build`, `ci`, `chore`, `style`,
`revert`. `/superdev:plan` picks it when it writes the plan, and it leads the feature label the slice store carries;
a run reads it off that label.

**Branch and run root.** Applies to every scope run. The scope branch is the feature label verbatim. The run root is
keyed on the slug alone (`.superdev/scopes/<scope>/`), so every command finds a run root from a scope slug without the
type.

## A live scope run

**What is live.** Applies to a range or a scope slug. It names a live run when its head is the scope branch
`<type>/<scope>` and a run root exists for that scope. A run root is a `.superdev/scopes/*/` directory holding a
`ledger.md`.

**The run-root path.** Applies to every run-root artifact. Capture `<run-root>` from `node
"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" root <scope>`'s printed absolute path, the repository's main working tree
whichever checkout the command runs from. Build no path against the invoking checkout's own cwd. Address every
artifact by that absolute path: `<run-root>/ledger.md`, `<run-root>/dod.md`, `<run-root>/run.lock`.

## Resolving an empty argument

**The cascade.** Applies to a command that takes a scope argument and accepts it empty. The command names its own
**candidate set** (CONTEXT.md), and this cascade resolves it.

- **Exactly one candidate** → use it.
- **Several candidates** → list each one with its stage, and ask the operator which one to use. **`--unattended`** →
  block instead of asking, per `## Unattended`, naming the candidates found.
- **No candidate** → report that none exists, with every run root the repository holds and its stage, and stop. Never
  guess at a subject nothing named.

**A caller's own no-candidate step.** Applies to a caller that adds a step after a no-candidate result. The step
replaces the stop, and it still reports every run root with its stage before it acts. `/superdev:review` reads standing
code of the whole repository there.

**Run-root enumeration.** Applies to a caller whose candidate set is run roots at named stages. The calling command
names the qualifying stages: `/superdev:submit-pr` names every stage but `shipped` and `closed`, and `/superdev:review`
names `merged` and `documented-unreviewed`. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" candidates --stage
<stage>[,<stage>]`, which scans the main working tree's run roots from any checkout, writes nothing, and prints one
verdict:

- **`one <slug> <stage>`** → exactly one candidate. Use it.
- **`several`** → one `<slug> <stage>` line per candidate follows. List them and ask the operator, or block under
  `--unattended`, per the cascade.
- **`none`** → one `<slug> <stage>` line per run root the repository holds follows, the stage reading `absent` where
  the ledger names none and `unreadable` where it cannot be read or names a stage outside the ledger's stages. Report
  them and stop.
- A run root whose directory name fails the `## The scope slug` charset is left out of every verdict.
- A run root whose stage reads `absent` or `unreadable` never qualifies.
- A `--stage` name outside the ledger's stages is refused with exit 1 and no verdict.

**`/superdev:implement`'s set.** Applies to implement's empty argument. Its candidate set is the features whose slices
are ready, read from the slice store and handed straight to the cascade, with no run-root enumeration.

**A caller that cannot ask stops and lists instead.** Applies to `scripts/publish-kb.js`, which has no
interview loop. With several pending staging scopes it refuses and lists each as `<slug>: <n> staged page(s)`, and with
none it refuses with `No staged knowledge-base pages in this repo.`, in its own shape and not the cascade's.

## The scope branch

**The verb.** Applies to every command that needs a run's scope branch. Run `node
"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" branch --root <run-root>`; compute nothing yourself. It reads the ledger and
git, writes nothing, and prints one line:

- **`ledger <branch>`** → the ledger's `**Branch:**` line names a local branch. This is the answer. A tag, a SHA, or a
  name run init wrote and never cut does not count, and falls through to the scan.
- **`guess <branch>`** → no such branch, and exactly one local branch has the run root's slug as its last segment and
  a change type as its leading segment. **Say which route you took.**
- **`guess-remote <branch>`** → the one match exists only as a remote-tracking ref. Say so with the guess.
- **`ambiguous <branch> <branch>…`** → several branches match. Stop and name every branch to the operator.
- **`none`** → nothing matches. Say so and stop.
- **`git-failed <reason>`** → git could not list the branches. Stop and name the reason; this is no `none`.

**The shared shape rule.** Applies to the Stop hook's prune. It applies the rule this verb applies
(`lib/scope-branch.js`). Where two branches match, the hook prunes, reaps, and deletes nothing for that scope.

## The scope checkout

**The scopetree.** Applies to every git command that writes to the scope branch, at both tiers. Run it in the scope
checkout, `<run-root>/scopetree`, as `git -C <run-root>/scopetree ...`. The invoking checkout stays wherever it was.

**A sibling checkout.** Applies to a path naming another repository's checkout, such as a sibling of a shared anchor
(`plan-contract.md` → *A shared anchor*). A relative path resolves against the scopetree, `<run-root>/scopetree`,
and so reaches no sibling checkout beside the invoking one. Name a sibling checkout by its absolute path.

**The call.** Applies to every command that needs the scope checkout. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"
checkout --root <run-root>`. It resolves the scope branch itself (`## The scope branch`), reads `git worktree list`
and the ledger's `**Stage:**`, writes nothing, and prints one verdict. A `guess` or `guess-remote` branch is the branch
it checks, and its verdict does not name the route, so a command that reports the guess runs `branch` as well.

- **`present <path>`** → git registers the scopetree on the scope branch. Work there.
- **`absent`** → the scopetree is missing before `shipped`. Recreate it with `git worktree add <run-root>/scopetree
  <branch>`, leaving the run's lock as it is, and prepare it per `scope-branch.md`'s `## Preparing a worktree`.
- **`absent-terminal <stage>`** (`shipped` or `closed`) → wrap-up's cleanup or an operator removed it. A read-only
  command (`/superdev:review`, `/superdev:document`, `/superdev:verify-ship`, `/superdev:wrap-up`) says so, reviews
  or reconciles read-only, and recreates no checkout. A writing command has nothing left to write to a shipped scope.
  No command recreates it at `closed`.
- **`held-elsewhere <path>`** → another working tree holds the branch. Say so, naming the path, and stop, writing
  nothing. A holder whose path holds a line break prints `held-elsewhere a working tree whose path holds a line break`
  with no path: say so, and name no path.
- **`unregistered <reason>`** → the scopetree path is a leftover directory, a detached or other-branch tree, a
  registration whose directory is gone, or a registered scopetree whose path holds a line break. Say so with the reason
  and stop, writing nothing. The operator removes it.
- **`none`, `ambiguous <b> <b>…`, or `git-failed <reason>`** → the scope branch itself is unresolved. Act as
  `## The scope branch` states for that verdict.

**Ship's exception.** Applies to `/superdev:ship` reading a `shipped` ledger with an `absent-terminal` verdict. Its
§3 reads the posture with `git show` from the invoking checkout, with no scope checkout. Ship recreates the checkout
as an `absent` verdict does in one case only: a ledger whose `auto` deploy stopped mid-way, which its §5 detaches. A
`shipped` ledger with nothing left to deploy, or a posture other than `auto`, is "already shipped", and ship
recreates no checkout for it.

## The run lock

**Implement's liveness check.** Applies to `/superdev:implement`'s own entry into an existing run root. Before
`dod.md` is written or the ledger's stage moves, `run-init.md`'s entry step runs `node
"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" lock --root <run-root>`. The verb reads the ledger's stage and the lock,
writes nothing, leaves the lock's mtime as it was, and prints one verdict line, the age in whole minutes rounded to the
nearest and written `<n>m`:

- **`proceed planned`** → stage `planned`, any lock age: `/superdev:plan` cut this and nobody has implemented a slice
  yet. Proceed.
- **`proceed absent`** and **`proceed stale <age>`** → no lock, or a lock an hour old or older, at any other stage.
  Proceed.
- **`live <age> <stage> <lock content>`** → a lock under an hour old at any other stage, a lock dated in the future
  included: a live implement run (`CONTEXT.md`). Attended: name the lock's age and content and the ledger's stage, and
  ask whether to continue. Unattended: block, per `## Unattended`.
- **A lock that is no regular file, or cannot be read**, at any stage, `planned` included → the verb refuses with one
  line naming it. Surface that line and stop.

The verb applies the one-hour bound and the future-date reading `scope.js open` applies.

**Only implement checks.** Applies to `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, and
`/superdev:ship`. Each skips the liveness check. Each enters at the chain's designed hand-off.

**What the check does not cover.** Applies to a reader judging a `live` or `stale` verdict.

- A run that writes no trace line for over an hour, such as a long read-only reviewer dispatch: its lock goes stale
  while it works.
- A session end: its closing trace lines leave the lock fresh for an hour after the session stopped.
- Another session's work in the run's trees: its trace lines keep the run's lock fresh too.
- An identity scheme: the lock's content stays freeform text a human reads to judge self from another session.
- The `planned`-stage window: two implement invocations that both enter while the stage reads `planned` both proceed.
  Only the stage's advance to `implementing` in `run-init.md` closes it.

**Plan's check.** Applies to `/superdev:plan`, which checks through `scope.js open` and not through the liveness check.
Each plan run writes a nonce of its own into the lock, `plan <nonce>`, and passes it back on its later calls. `open`
stops with `locked` on a lock under an hour old that names another nonce: with no live ledger, on any such lock; on a
`planned` ledger, only while the ledger's step stands.

**Writing the lock.** Applies to the execution playbooks and `/superdev:plan`, right after their own cut. Write
`<run-root>/run.lock` into the run root once `scope-branch.md`'s `## Cutting the scope branch` has cut or reused the
scopetree, at both tiers, using the absolute run-init `<run-root>` path in the invoking checkout. Refresh the file if
it already exists, the case a `resumed` run finds, once implement's liveness check has passed.

- Plan's `scope.js open` writes the lock, refreshes it on plan's §6 call, and checks it itself.
- On a `resumed` run, the liveness check at run init is the one lock read. The playbook's own **Resume** step makes
  no lock read of its own and only reconciles the ledger against `git log`.

**Leave the lock in place.** Applies to an execution playbook at its end. Leave `<run-root>/run.lock` standing when
the run finishes. The lock spans the whole chain, and `/superdev:wrap-up` removes it once the run is closed.

**Every other caller only refreshes.** Applies to `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`,
`/superdev:ship`, `/superdev:verify-ship`, and `/superdev:wrap-up`. Each refreshes the lock's mtime at its own step.
Never create the lock: a missing lock there means no live run to refresh.

**Liveness by mtime.** Applies to every reader of the lock. The lock's mtime marks the run as live across the whole
chain, and a lock older than an hour is dead. Every line written to the run's `trace.log` refreshes it too, from the
run-trace hook's edit, run, and dispatch lines and the `scope.js` verbs' lines; that refresh creates no lock and
leaves its content as it is.

## The scope's range base

**The range base.** Applies to every range of a scope's own work: review's range, the doc pass, run handoff's `BASE`,
resume's cross-check, and ship's `deployment.md` diff, each `<range-base>..<branch>`. The range base is the newer of
two candidates: `merge-base(<base>, <branch>)`, and the tip the base step recorded in the `**Base:**` header
(`run-state.md`'s `## The ledger`) where that record resolves to a commit and is an ancestor of `<branch>`. The newer
candidate is the one the other is an ancestor of.

- **No usable record, or two candidates where neither holds the other** → the range base is `merge-base(<base>,
  <branch>)`.
- **The known limit:** when the local `<base>` holds commits never pushed and a merge brought it into `<branch>` (ship
  §4 or the degraded path) while a tip is on record, the candidates are incomparable, and the recorded tip's remote
  commits can enter the range.

**Compute it with the verb, never by hand.** Applies to a live scope run. Run `node
"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" base resolve --branch <branch> --base <base> --root <run-root>`. An ad-hoc
range with no run root has no record, so `merge-base(<base>, <branch>)` is its base.

**Containment is another question.** Applies to a caller asking whether the branch's work is in `<base>`. Ask
`scope.js contained`, per `scope-branch.md`'s `## Containment`.

## Unattended

**The token.** Applies to `--unattended` in a command's arguments. It means nobody is watching this invocation.
Whoever invokes a chain command passes it, and it is an argument, never a run-root field. The next command a
maintainer types after an interrupted unattended run asks its questions as usual.

**Take it out before parsing anything else.** Applies to every command that accepts the token. The token is never part
of the range, the area path, or the scope slug a command resolves from its remaining arguments.

**No question and no interview.** Applies to a command carrying the token, at each stop where it would ask a question
or start an interview command (such as `/superdev:setup` or `/superdev:plan`).

- **A standing answer is written at that stop** → take it. Each stop states its own, next to the question it replaces.
- **No standing answer is written** → **block**, and stop.

**Blocking.** Applies to every block.

1. Move the slice, where one is in play, and the scope anchor to `blocked`, per the status map in
   `docs/agents/issue-tracker.md`.
2. Comment on the anchor naming the stop reached and why. A store with no comment concept records the same reason in
   the anchor's body. **A block at the denial cap names `scope.js degraded reset-denials` in that comment**, beside the
   quoted refusal (`scope-findings.md`'s `## Degraded passes`).
3. A command whose step stands runs `scope.js step block` before the stop, per `run-state.md`'s `## The ledger`.
4. Stop, leaving the scope branch standing and unshipped.

Both store writes are best-effort: a failed write is logged, and the block still holds.

**Without the token nothing changes.** Applies to every command run without `--unattended`. It asks exactly what it
asks attended, in the same words.

## Verification ceiling

**Verifying a Definition-of-Done criterion observes.** Applies to every criterion. Verifying it changes no system
outside the repository. An app instance a verify skill starts for one checkout, with the state that instance alone
owns, counts as inside; state shared with the main checkout or with a third-party service counts as outside
(`verify-skill.md`, ADR 0277). A criterion that needs a deploy, a migration, or any other outward-facing change to
verify stays unticked, with a note naming what it needs, for the operator to verify after merge.

## The stage never moves backwards

**The rank rule.** Applies to every write of the ledger's `**Stage:**` line: run init (`stage set implementing`, on a
`planned` ledger), `/superdev:review`, `/superdev:document`, run handoff (`merged`), `/superdev:submit-pr` (`submitted`), `/superdev:ship` (`shipped`), and `/superdev:wrap-up`
(`closed`), each through `scope.js stage set`. **A stage write never undoes completed work.** `stage set` enforces every
rule of this section in code and refuses a write that breaks one.

- `shipped` stops `/superdev:ship` from merging a second time, and no later command overwrites it with an earlier
  stage. `shipped` is not terminal.
- `closed` is the terminal stage: nothing outranks it, `stage set` refuses any move out of it, and
  `hooks/scope-prune.js` reaps only a run root that reads it.
- `submitted` is an ordinary in-flight stage. `/superdev:submit-pr`'s own stage gate keeps a second run from opening a
  second pull request.
- `documented` is not terminal: `documented → submitted → shipped` is the chain's last move.

**The sanctioned move.** Applies to `/superdev:review` when its fix loop landed commits on a `documented-unreviewed`
run. It writes `reviewed` over `documented-unreviewed`. `reviewed` is the value that gets the doc pass run again.
