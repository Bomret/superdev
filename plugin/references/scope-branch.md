# Scope branch work

This reference owns the work done on the scope branch: the content test that decides whether a base holds
a branch's work (`## Containment`), how a run cuts or reuses the branch (`## Cutting the scope branch`),
how it reaches the remote (`## Pushing the scope branch`), and how the remote base comes into it
(`## Bringing the scope branch to base`). The run basics every command reads live in `scope-mode.md`,
which names the branch and its checkout. A section here is read by the step that cites it.

## Containment

`scope-mode.md`'s `## The scope branch` finds the branch. This section decides the other question every caller of it
asks: does `<base>` already hold that branch's work. The answer is about **content**, because a
squash-merge rewrites a branch's commits into one new commit and leaves not one of them reachable from
base, however completely base holds the result (ADR 0053). A scope branch has reached base when merging
it into base would change nothing:

```sh
tree=$(git merge-tree --write-tree <base> <branch>) && [ "$tree" = "$(git rev-parse <base>^{tree})" ]
```

Three outcomes, and comparing the tree is what separates the first two — a clean merge exits 0 either
way:

- **Exit 0, and the tree equals `<base>`'s own tree** → **contained**. Base holds every byte of the
  branch's work, whether it arrived by squash-merge, by a merge commit, or by fast-forward, and whether
  or not base has moved on since.
- **Exit 0, and the tree differs** → **not contained**. The merge is clean, and it would still change
  base, so the branch carries content base does not hold.
- **Exit 1** → **inconclusive**, whichever of two causes: a real conflict, where the branch and base
  disagree over the same lines, or an argument git cannot resolve at all — a branch name with no ref
  behind it. Neither proves the tree equal to `<base>`'s, and a base that edits the branch's files after
  taking its work conflicts here on a branch it holds in full, so **the second tier below decides this
  outcome**.

**The second tier asks whether base's history took the patch** (ADR 0082). It runs on the exit 1 above,
and on a `no` from the `git merge-base --is-ancestor` fallback a git older than 2.38 takes. Resolve the
merge base of `<base>` and `<branch>`, take the patch id of the branch's cumulative diff from it, and look
for that id among the patch ids of the commits `<base>` gained since that same merge base:

```sh
mb=$(git merge-base <base> <branch>)
pid=$(git diff "$mb" <branch> | git patch-id --stable | cut -d' ' -f1)
git log -p --no-color "$mb..<base>" | git patch-id --stable | grep -q "^$pid "
```

A match → **contained**: `git patch-id --stable` hashes the normalized diff content, so a match is the
same change and not a guess. No match → **not contained**, the verdict the first tier already reached. The
vocabulary stays at the three verdicts above, and the **exit 0, tree differs** outcome never reaches here —
that comparison already settled it.

**`git rev-list --count "$mb..<base>"` gates the scan, at a cap of 1000 commits.** Past the cap the probe
is skipped and the answer is not contained, so a base that has diverged far from an abandoned branch pays
one counting call instead of a full patch walk. The bound is a commit count rather than a wall clock: one
repository state gives one verdict.

**Every probe step that cannot answer answers not contained** (INV-0003): a failed `merge-base`, `diff`,
`patch-id`, `rev-list`, or `log`, an unreadable count, and an exhausted cap alike. The scan writes no
objects, unlike the tree comparison it follows.

**A base that takes the branch's work and then reverts it in a way that also conflicts with base's own
later edits reads contained.** The work stays reachable from base's history, so deleting the branch
destroys nothing unique, and retracting a knowledge-base page published for a reverted feature is the
operator's own act. A revert that does not conflict never reaches the probe — the tree comparison settles
it on its own, and which way depends on how the work arrived: reverting a true merge commit leaves the
branch an ancestor of base still, so the tree comparison finds base's own tree unchanged and reads
contained; reverting a squash-merge leaves the branch's tip outside base's history entirely, so re-merging
it reapplies content the revert just removed and the tree comparison reads not contained.

**A not-contained verdict against a local base is provisional, and the second pass settles it.** The code
host squash-merges the pull request and the clone learns nothing about it until something fetches, so such
a verdict is as likely to be stale as it is to be true (ADR 0065). Fetch the base branch once from the
remote `docs/agents/code-management.md` names — `GIT_TERMINAL_PROMPT=0 git fetch <remote> <base>`, so a
missing credential fails the fetch instead of prompting — and run the same test again against
`FETCH_HEAD`, substituting it for `<base>` throughout, in both positions the shell line above names:
`FETCH_HEAD` holds exactly what that fetch wrote, whichever refs the clone's own refspec maps. **The
second verdict is the answer**, contained or not. A contained first verdict ends the test where it
stands, so the fetch is paid where the local answer would otherwise be wrong and nowhere else. The
`--is-ancestor` fallback below takes the same second pass, against that same `FETCH_HEAD`.

**`hooks/scope-prune.js` runs the local test alone and never fetches.** It is a `Stop` hook firing on every
finished turn, and a stale base defers a reap that ADR 0007's seven-day TTL has already delayed — the safe
direction, and the same best-effort posture that keeps the hook silent below.

**No remote configured, or a fetch that fails** — an unreachable host, a rejected credential, a branch the
remote does not carry — **leaves the first verdict standing, and the caller says the second pass did not
run**, the way the fallback route below is said out loud. The caller then acts on an answer named as local.

**`--write-tree` needs git 2.38** (2022-10-02), and rejecting the flag itself exits **128 or 129** —
distinct from the exit 1 above, so an old git is never mistaken for a conflicting branch. Where
`--write-tree` is unavailable, fall back to `git merge-base --is-ancestor <branch> <base>` and **say the
fallback route was taken**: a `no` there reaches the second tier above, which answers a squash-merged
branch base holds in full, and where that probe finds no match the caller is acting on the older, weaker
signal. **`hooks/scope-prune.js` is the one
exception**: it is best-effort and silent by contract, so it says nothing on any path, including this
one. Its own fallback is `git branch --merged`, the equivalent older, weaker signal in the hook's own git
call — it just never announces taking it.

**The test writes tree objects into the object database.** A caller that fires on every turn reaches it
only for a scope it would otherwise act on, behind its own cheaper filters — `hooks/scope-prune.js`
mirrors this test in JavaScript and orders its filters exactly that way.

**Absence stands beside containment, unchanged.** A branch that is gone is finished with just as a
contained one is, for the hosts that do delete a branch on merge. Each caller states which of the two it
reads and what it does with each.

**`<base>` is whatever the caller resolves it to, and this section does not pick one.**
`hooks/scope-prune.js` uses `HEAD` — the current branch, exactly as `git branch --merged` with no argument
already meant; `## Cutting the scope branch` below and `skills/publish-kb/SKILL.md` §3 use the base
branch named in `docs/agents/code-management.md`. The test only ever compares the tree its caller hands
it, so a ref that already holds the branch's content reads contained whether or not it is what the caller
means by "landed." `HEAD` is safe for `hooks/scope-prune.js` on that basis, and only because ADR 0045
keeps the invoking checkout off the scope branch at every tier: were `HEAD` ever the branch itself,
`git merge-tree --write-tree HEAD <branch>` would yield `HEAD`'s own tree and the branch would read
contained however little of its work base actually holds.

## Cutting the scope branch

Run init computes this run's **run kind** — `CONTEXT.md`'s glossary names both
values — and hands it to the execution playbook; `/superdev:plan`'s `scope.js open` computes the same value for its
own cut, ahead of any slice run (ADR 0079): no live ledger is `fresh`, a `planned` ledger is `resumed`. Every caller acts on that value instead of deriving it a
second time from git state. One call cuts or reuses the branch at every run kind, into the same
**scopetree** — `<run-root>/scopetree` — at both tiers: the invoking checkout is never switched
(ADR 0045).

- **`fresh`** — no ledger existed, so the run itself has never cut this branch before. Cut it from
  `<base>`: `git worktree add <run-root>/scopetree -b <type>/<scope> <base>`. **The name already
  exists** — a squash-merging host leaves a scope's branch standing after its pull request merges, and
  `hooks/scope-prune.js` reaps it only alongside its run root (ADR 0007, ADR 0071), so a taken name is
  the ordinary case in such a repository, not an error (closes triage #417): `-b` fails rather than reset
  it, which is the safe outcome, and the branch is then decided rather than stopped on unconditionally —
  contained in `<base>` and reused, or not contained and stopped, per `## Containment` above: the same
  test that decides a scope is finished with (ADR 0007), contained in `<base>`, or gone entirely.
  `/superdev:plan`'s cut is `scope.js open`, which applies this rule in `lib/plan-open.js` and prints
  `not-contained`, `dirty`, or `held` where the rule stops; plan acts on the printed outcome.
  - **Gone** — `<branch>` does not verify: nothing survives to reuse, so the `-b` cut above is the whole
    step.
  - **Present** — decide with `## Containment` above, which owns the test. **Contained** —
    the content already landed, so reuse loses nothing: work in the scopetree, per `scope-mode.md`'s `## The scope
    checkout` — creating it with `git worktree add <run-root>/scopetree <branch>` when
    absent, and stopping first when a different worktree holds the branch, the same stop `resumed` takes —
    then **check the scopetree is clean**: `git -C <run-root>/scopetree status --porcelain`
    returns nothing. The content is already landed on `<base>` or on the base the second pass fetched, and
    the containment proof above covers the branch's committed history, never the index or
    the working tree, so a dirty scopetree could lose an uncommitted change the test never vouched for.
    **Dirty** — name what `status --porcelain` reported and stop, cutting nothing. **`--unattended` →
    block**, per `scope-mode.md`'s `## Unattended`. **Clean** — **re-point it to `<base>` with `git reset --hard <base>`**
    inside it. `git merge --ff-only <base>` exits 128 on a squash-merged branch, because base is no
    descendant of it and a fast-forward has no ancestor to walk. **Not contained** — content lives only on
    that branch: print `git log <base>..<branch> --oneline` so the operator sees what is at risk, ask, and
    print `git branch -m <branch> <branch>-<date>` as the remedy. **`--unattended` → block**, per
    `scope-mode.md`'s `## Unattended`.

  A host that squash-merges and deletes the branch reads gone; one that squash-merges without deleting
  reads present and contained, and is reused — the ordinary outcome there. What still reaches the
  question is a branch carrying real work base never took.
- **`resumed`** — the branch holds unmerged work by design, so no containment test runs and nothing is
  cut. A **`planned`** ledger is one instance of this run kind (ADR 0079): `/superdev:plan` already cut,
  and where the name was taken, decided and re-pointed the branch under the rule `fresh` follows above, so
  run init cuts nothing, tests no containment, and re-points nothing either — it moves the stage past
  `planned` and works in the scopetree already there. The branch may carry unmerged slice work, for a run
  already in flight, or nothing at all beyond `/superdev:plan`'s own design-docs commit, for one just
  handed off. Read `<branch>` from the ledger's own line — `scope.js get branch --root <run-root>`,
  verified with `git rev-parse --verify <branch>` — never by rebuilding `<type>/<scope>` and never through
  `scope-mode.md`'s `## The scope branch`'s shape-scan fallback, which can return a foreign branch.
  **A name that does not verify locally is fetched before anything else**: `git fetch
  <remote> <branch>` (`<remote>` from `docs/agents/code-management.md`) — a fresh clone, or a ledger just
  adopted from the anchor's snapshot, holds no scope branch until this runs. **Verify the fetch's own
  ref afterwards, `git rev-parse --verify <remote>/<branch>`, never the bare name a second time**: fetching
  one ref only ever populates the remote-tracking ref `refs/remotes/<remote>/<branch>`, never a local
  `refs/heads/<branch>`, so the pre-fetch check above and this one deliberately verify two different refs.
  A `resumed` branch is expected to exist, so a name whose remote-tracking ref still does not verify — the
  fetch found nothing either — is a stop, naming the branch it looked for, not a guess.
  **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`. `git worktree add <run-root>/scopetree
  <branch>` below still names the bare branch, not the remote-tracking ref: it DWIM-creates the local
  branch from the sole matching remote-tracking ref the moment one exists. Create or reattach the
  scopetree, at both tiers, whenever it is absent — because `/superdev:wrap-up` already removed it, or
  because this checkout never held it (a resumed run adopted from the anchor on a fresh clone) — and
  otherwise work in the one already there.

**No forcing flag, at any run kind.** `git switch -C` and `git worktree add -B` reset the branch to
`<base>` and leave every slice already merged into it unreachable from any ref, while the ledger still
records those slices as `merged` — nothing in the run rebuilds what it lost (ADR 0028). Two re-pointings
are permitted, and no third. **Fast-forwarding to `<base>`.** And **`git reset --hard <base>` on a branch
`## Containment` has just proved contained** — that proof is the precondition, never a general
permission: containment establishes that the content is already landed, on `<base>` or on the base the
second pass fetched, so the commits the reset discards carry nothing to lose (ADR 0053). A branch that
has not passed the test in this run keeps the
whole rule.

**Every stop above writes nothing.** No run starts and no ledger entry is written. None is a degraded
pass either: `scope-findings.md`'s `## Degraded passes` records work done a lesser way, and here no work happens.

## Pushing the scope branch

`/superdev:plan` puts the scope branch on the remote at the end of every plan run, so a `resumed` run on
another machine finds it there (ADR 0167, INV-0087). `/superdev:submit-pr` and `/superdev:ship` push later
in the chain, and no other command pushes a scope branch. Plan pushes before any slice runs, so the branch
it pushes holds the design captures and nothing a slice built.

Run the push in the controller's own Bash call, from the invoking checkout:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" push --root <run-root> --remote <remote> --base <base>
```

`<remote>` is the `Remote:` value of `docs/agents/code-management.md`, and `<base>` is that document's base
branch. **No `Remote:` value** → skip the push, say once that the branch stays local, and name no default
remote in its place.

The verb reads the branch from the ledger's `**Branch:**` line, fetches the remote branch, and decides the
**push mode** (`CONTEXT.md`) from the remote tip it fetched:

- **No remote branch, or a remote tip that is an ancestor of the local tip** → a plain push with an upstream
  set. It prints `pushed`.
- **A remote tip that `## Containment` proves contained in `<base>`** → a push through
  `--force-with-lease` naming that exact tip, so a remote that moved since the fetch rejects it (INV-0169).
  It prints `overwritten`.
- **Any other remote tip** → no push. It prints `refused` and the remote tip's commits that the base the
  containment test judged does not hold, the base refetched from the remote when the refetch ran.

Every case the verb cannot decide pushes nothing: `unreachable` and `credential-rejected` (a failed fetch, the
containment test's refetch of `<base>` included, read under the C locale), `timed-out` (a git call its own bound ended, the refetch of `<base>`
included, which carries no verdict, INV-0009; the line names the bound in milliseconds and its key, `code-host.pushTimeoutMs`), and `push-failed` (the remote rejected the push, a moved lease
included). The verb exits 0 on `pushed` and `overwritten`, 3 on every outcome that pushed nothing, and 1 on a
usage refusal, a `**Branch:**` line naming `<base>` included, so it never pushes base. It writes nothing to the
ledger.

**The push is best-effort**, as the snapshot publish is (`run-state.md`'s `## Publishing run state`). An outcome that pushed
nothing is reported once in the command's output: the outcome word, the `git push -u <remote> <branch>` line
the verb printed for the operator to run by hand, and the consequence — until the branch is on the remote,
`/superdev:implement` on another machine stops at its `resumed` fetch. On `refused`, the report also lists
the commits the verb printed, and names no command that would overwrite them. The command then continues
as if the push had succeeded: no ledger stage, step, or published snapshot changes because of it.

## Bringing the scope branch to base

Both execution playbooks run this step right after their own write of `scope-mode.md`'s `## The run lock` and before their first
slice, on every `/superdev:implement` invocation and at every run kind (ADR 0120, INV-0124).
`/superdev:review` runs it too, on a live scope run at a stage before `submitted`, after its scope
checkout and run lock and before its entry focused run (ADR 0173). At `submitted` review merges nothing:
`/superdev:ship` owns a moved base there. The step runs no test suite: the scope review's exit run
verifies every merge it makes, implement's and the review's own alike (ADR 0192). It brings
the remote's `<base>` tip into the scope branch, so slices build on what the pull request targets rather
than on whatever `<base>` the branch was cut from. `/superdev:plan`'s own cut never reads it. `<remote>`
and `<base>` come from `docs/agents/code-management.md`; `<branch>` is the scope branch the playbook's
branch step left you on.

1. **Check the scopetree first.** `git -C <run-root>/scopetree status --porcelain` returns nothing, and
   `git -C <run-root>/scopetree rev-parse -q --verify MERGE_HEAD` finds no unfinished merge. Anything
   else → name what you found and stop, discarding nothing and dispatching no slice. **`--unattended` →
   block**, per `scope-mode.md`'s `## Unattended`. One exception, at the `lite` tier only (`scope.js get slices --root <run-root>`
   lists three or fewer slices, as in `scope-findings.md`'s `## Degraded passes`): the scopetree is dirty, no merge is
   unfinished, and a slice is `in-progress`. That dirt is the slice's own work. At the full tier
   slices work in their own slicetrees, so any dirty scopetree stops. Skip the whole base step, name the skip in the
   report, and leave the work to the playbook's `## Resume`; the next invocation brings the base in.
2. **Fetch the remote base.** Run `GIT_TERMINAL_PROMPT=0 git fetch <remote> <base>` through the Bash
   tool with its `timeout` set to 120000 ms: a missing credential fails the fetch instead of prompting,
   and a stalled remote ends it. Capture `<tip>` at once with `git rev-parse FETCH_HEAD`, because step 3
   overwrites `FETCH_HEAD`. A fetch the timeout killed carries no verdict (INV-0009) and counts as failed.
3. **Fast-forward the local `<base>` ref, and nothing more.** Run
   `git fetch . <tip>:refs/heads/<base>`. This is the only local-git write to `<base>` INV-0001 admits: it
   moves a ref, writes no commit, and touches no working tree. Git refuses it when `<base>` is checked
   out in any worktree, or when the update is not a fast-forward (verified 2026-10-05, git 2.54.0: exit
   128, `fatal: refusing to fetch into branch 'refs/heads/<base>' checked out at …`). A refusal is not a
   failure: skip it, leave the local `<base>` where it was, and name the refusal in the run's report. A
   local `<base>` already at `<tip>` needs no word. Step 4 runs either way.
4. **Bring `<tip>` in, and record it.** **Move every numbering collision first** (ADR 0126, INV-0134):
   run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" collisions --base <tip> --branch <branch>
   --range-base <range-base>`, with `<range-base>` per `scope-mode.md`'s `## The scope's range base` and one `--also <ref>`
   for each other live plan run's scope branch (`scope-mode.md`'s `## Resolving an empty argument` → *Run-root enumeration*, stage
   `planned` or later, its branch read with `scope.js get branch --root <run-root>`) whose ref resolves:
   `git rev-parse --verify <ref>` succeeds. A run root whose branch no longer resolves gets no `--also`,
   so it never stops this run. It compares numbers, so it finds a collision git never reports as a conflict.
   Exit 0 → nothing collides. Exit 1 → for each line it prints, move this scope's ADR file or invariant
   entry to the printed next number, update every citation of the old number on the scope branch, commit
   that in the scopetree, and name each renumber, old and new, in the run's report. A renumber resolves
   and asks nothing, so an unattended run renumbers the same way. Exit 2 → the check could not run: name
   its message and stop, dispatching no slice, never reading it as no collision; on exit 2,
   **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`. **Then find the citations the renumber missed** (ADR 0156, INV-0134): after the
   renumber commit and before the merge, run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" citations --range-base <range-base> --branch <branch> <id>…`
   with every old id the renumber moved, each as `collisions` printed it. It prints one `<path>:<line> <id>`
   line per line the scope branch added that still cites an old number. Exit 0 → none. Exit 1 → fix each named
   line to the new number, commit, and run it again, until it exits 0 or prints only kept lines. A line the controller judges a
   legitimate citation of the old number goes to the operator when attended, who fixes or keeps it, and
   **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`. Exit 2 → the check could not run: name its message and
   stop, as a collision check that cannot run stops, dispatching no slice. The base is merged once the verb
   exits 0, or once every line it still prints is one the attended operator kept. A collisions
   check that printed nothing moved no number, so no old id exists and this verb does not run. Then the merge: `git -C <run-root>/scopetree merge-base --is-ancestor <tip> <branch>`
   succeeds → nothing to merge. Otherwise run `git -C <run-root>/scopetree merge <tip>`, `<run-root>`
   spelled out as the real absolute path in the command text, never a shell variable: `hooks/run-trace.js` and
   `hooks/merge-guard.js` read the command text alone. **A conflict** — `MERGE_HEAD` still set → resolve it by intent, per
   `${CLAUDE_PLUGIN_ROOT}/references/merge-conflicts.md`, and conclude it with
   `git -C <run-root>/scopetree merge --continue`. Plan's design-docs commit
   and other scopes edit the same glossary, ADR, and invariant files, so most of these conflicts are
   additive. Report every renumber that file's numbering-collision rule made, old and new. A
   winner-picking overlap is the one case it escalates: list the conflicting files
   (`git -C <run-root>/scopetree diff --name-only --diff-filter=U`), run
   `git -C <run-root>/scopetree merge --abort`, and stop: the scopetree is clean again, no slice is
   dispatched, and the operator resolves the conflict. **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`.
   Once `<tip>` is in the scope branch, whether merged now or already there, record it with
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" base set <tip> --root <run-root>`: the local `<base>`
   may still lack `<tip>`, and `scope-mode.md`'s `## The scope's range base` reads the record. Then go to the first
   slice, or, for `/superdev:review`, to its entry focused run, whatever the suite record reads: a red,
   denied, or absent record asks nothing, stops nothing, and blocks no unattended run (ADR 0192).

**A base that cannot be fetched is a degraded pass.** No `<remote>` configured, a failed or killed fetch,
or a remote that does not carry `<base>` → skip steps 2 and 3, run step 4 with the local `<base>`
in place of `<tip>`, record no `**Base:**` line, and record the reason with `scope.js degraded add`, after
`scope.js get degraded --root <run-root>` shows no entry for the
same reason: repeated offline invocations add one entry. It is the second shape in
`scope-findings.md`'s `## Degraded passes`: record and continue, attended or unattended alike. `/superdev:submit-pr` carries the
entry into the pull request body. Publish the snapshot, per `run-state.md`'s `## Publishing run state`.
