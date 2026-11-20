# Scope branch work

Applies to every step that cites a section of this file: the content test for whether a base holds a branch's work,
cutting or reusing the branch, preparing a worktree, pushing the branch, and bringing the remote base into it. Read
the cited section. `scope-mode.md` names the branch and its checkout.

## Containment

**The question.** Applies to every caller that asks whether `<base>` already holds a scope branch's work. The answer
is about content: a branch has reached base when merging it into base would change nothing, that is when `git
merge-tree --write-tree <base> <branch>` yields base's own tree. `scope-mode.md`'s `## The scope branch` finds the
branch.

**`scope.js contained` carries the test.** Applies to every containment question. Run `node
"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" contained <base> <branch>`. It runs the tree comparison, then asks whether
base's history took the branch's patch (ADR 0082) and whether a commit base gained holds the branch (ADR 0248). A
not-contained answer against a local base refetches `<base>` from the remote and retests against what the fetch
brought, the second pass (ADR 0065).

- `--remote <remote>` names the remote. Without it the verb reads the `Remote:` value of
  `docs/agents/code-management.md` at the repository's top level, from any directory of it. With neither it refuses
  with exit 1.

**The verdict.** Applies to reading the verb's output. The first line is the verdict, and its exit status tells it
apart in a script:

- **`contained`** (exit 0) → base holds every byte of the branch's work, whether it arrived by squash-merge, merge
  commit, or fast-forward, and whether or not base has moved on since.
- **`not-contained`** (exit 3) → the branch carries content base does not hold, or no step could answer. Every path
  that cannot answer reads not contained, never contained (INV-0003).
- **`could-not-resolve`** (exit 4) → `<branch>` names no ref this repository can find. The caller tells a branch that
  never existed from one that has not landed.

**The trust lines.** Applies to the lines after the verdict, three always and two optional:

- **`base <full sha>`** names the commit judged against: the commit the refetch brought where it ran, `<base>`
  resolved otherwise.
- **`remote <name>`** names the remote the refetch used.
- **`judged local`** or **`judged refetched`**. `refetched` means the verdict came from the retest against the fetched
  base. `local` means the refetch did not run or brought no base.
- **`fallback ancestor`** appears where git lacks `merge-tree --write-tree` (git 2.38 or later has it) and the verb
  judged by ancestry alone. The caller says the fallback route was taken.
- **`refetch timed-out`** or **`refetch failed`** appears beside a `not-contained` verdict whose refetch ran out of
  time or failed (the bound is `code-host.pushTimeoutMs` of `.superdev/info.json`). The verdict is the local one and
  says nothing about the branch (INV-0009). The caller says the second pass did not run and acts on an answer named as
  local.

**The caller keeps the judgment.** Applies to every caller of the verb. Which `<base>` to hand, what each verdict and
marker means for the step, and whether a missing branch counts as finished stay with the caller's own step. A branch
that is gone is finished with just as a contained one is, and each caller states which of the two it reads and what
it does with each.

**`<base>` is the caller's.** Applies to choosing `<base>`. `hooks/scope-prune.js` uses `HEAD`, the current branch,
which is safe only because the invoking checkout stays off the scope branch at every tier. `## Cutting the scope
branch` and `skills/publish-kb/SKILL.md` §3 use the base branch named in `docs/agents/code-management.md`. A ref that
already holds the branch's content reads contained.

**A reverted base.** Applies to a base that took the branch's work and then reverted it.

- A revert that also conflicts with base's own later edits reads contained: the work stays reachable from base's
  history. Retracting a knowledge-base page published for the reverted feature is the operator's own act.
- A revert that does not conflict is settled by the tree comparison alone. Reverting a true merge commit reads
  contained. Reverting a squash-merge reads not contained.

**The Stop hook's containment.** Applies to `hooks/scope-prune.js`. It runs the local test alone and never fetches. It
says nothing on any path, the `fallback ancestor` route included, and its own fallback is `git branch --merged`. It
mirrors the test in JavaScript and reaches it only for a scope it would otherwise act on, behind its cheaper filters.

**What the test writes.** Applies to every run of the verb. The test writes tree objects into the object database. The
verb changes no ref, index, working tree, ledger, or trace. The refetch writes `FETCH_HEAD` and fetched objects, and
moves no remote-tracking ref.

## Cutting the scope branch

**The run kind.** Applies to every cut. Run init computes this run's **run kind** (`CONTEXT.md`) and hands it to the
execution playbook. `/superdev:plan`'s `scope.js open` computes the same value for its own cut: no live ledger is
`fresh`, a `planned` ledger is `resumed`. Act on that value, never on a second reading of git state.

**One scopetree.** Applies to every run kind and tier. One call cuts or reuses the branch into the same
**scopetree**, `<run-root>/scopetree`. The invoking checkout is never switched.

**`fresh`.** Applies to a run with no ledger. Cut the branch from `<base>`: `git worktree add <run-root>/scopetree -b
<type>/<scope> <base>`. Where the name already exists, `-b` fails, and the branch is decided by the cases below.

- **Gone** → `<branch>` does not verify. The `-b` cut is the whole step.
- **Present and contained** (`## Containment`) → work in the scopetree, per `scope-mode.md`'s `## The scope checkout`:
  create it with `git worktree add <run-root>/scopetree <branch>` when absent, and stop first when a different
  worktree holds the branch, the same stop `resumed` takes. Then check the scopetree is clean: `git -C
  <run-root>/scopetree status --porcelain` returns nothing.
  - **Dirty** → name what `status --porcelain` reported and stop, cutting nothing. **`--unattended` → block**, per
    `scope-mode.md`'s `## Unattended`.
  - **Clean** → re-point it to `<base>` with `git reset --hard <base>` inside it. `git merge --ff-only <base>` exits
    128 on a squash-merged branch.
- **Present and not contained** → print `git log <base>..<branch> --oneline` for the operator, ask, and print `git
  branch -m <branch> <branch>-<date>` as the remedy. **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`.

**Plan's cut.** Applies to `/superdev:plan`. Its cut is `scope.js open`, which applies the `fresh` rule in
`lib/plan-open.js` and prints `not-contained`, `dirty`, or `held` where the rule stops. Plan acts on the printed
outcome. A `not-contained` stop whose refetch ended without a base ends on the same `refetch timed-out` or `refetch
failed` line `## Containment` names.

**`resumed`.** Applies to a run whose ledger exists, a `planned` ledger included. Cut nothing and run no containment
test. A `planned` ledger's branch was already cut, and where the name was taken, decided and re-pointed by
`/superdev:plan`, so run init re-points nothing either and moves the stage past `planned`.

1. Read `<branch>` from the ledger, `scope.js get branch --root <run-root>`, and verify it with `git rev-parse
   --verify <branch>`. Never rebuild `<type>/<scope>`, and never take a `guess` or `guess-remote` verdict of
   `scope.js branch`.
2. A name that does not verify locally is fetched before anything else: `git fetch <remote> <branch>` (`<remote>` from
   `docs/agents/code-management.md`). Then verify the fetch's own ref, `git rev-parse --verify <remote>/<branch>`,
   never the bare name a second time.
3. A remote-tracking ref that still does not verify is a stop, naming the branch it looked for. **`--unattended` →
   block**, per `scope-mode.md`'s `## Unattended`.
4. Create or reattach the scopetree with `git worktree add <run-root>/scopetree <branch>`, naming the bare branch, at
   both tiers, whenever it is absent. Otherwise work in the one already there. The run's own lock stays as it is.

**Prepare the scopetree.** Applies once the cut leaves the scopetree in place, at every run kind and tier. Prepare it
per `## Preparing a worktree`.

**No forcing flag, at any run kind.** Applies to every move of the scope branch. Never use `git switch -C` or `git
worktree add -B`. Two re-pointings are permitted, and no third: fast-forwarding to `<base>`, and `git reset --hard
<base>` on a branch `## Containment` has just proved contained in this run.

**Every stop writes nothing.** Applies to every stop in this section. No run starts and no ledger entry is written.
None is a degraded pass.

## Preparing a worktree

**Which trees.** Applies to every worktree superdev creates or reuses for a test run: the scopetree at implement
start, fresh or resumed, at both tiers; each slicetree, a reused one included; a scopetree `scope-mode.md`'s `## The
scope checkout` recreates; and the scopetree again at review start. Prepare each before its first test run. Reviewer
worktrees under `/tmp` and ship's deploy tree run no test and are not prepared.

**The call.** Applies to every tree to prepare. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" prepare <tree>` in
the controller's own Bash call, its `timeout` set to 600000. The verb runs the **Prepare command** (CONTEXT.md) that
`<tree>`'s own `docs/agents/verification.md` states, at `<tree>`'s root, and is no test run.

- **Exit 0** → continue. With no `## Prepare command` section the verb prints one note naming `/superdev:setup`;
  repeat it once in the run's report. A `prepare: skipped` note means the tree was already prepared.
- **Exit 3** → the command failed, was ended by a signal, could not start, or changed a tracked file; a tracked edit
  the tree held before the command is no such change. Stop the step, naming the command and the reason the verb
  printed, and dispatch nothing into that tree. **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`.
- **Exit 1** → the verb refused the path. Stop the same way, naming its message.

## Pushing the scope branch

**Who pushes.** Applies to every push of a scope branch. `/superdev:plan` pushes it at the end of every plan run,
before any slice runs. `/superdev:submit-pr` and `/superdev:ship` push later in the chain. No other command pushes a
scope branch.

**The push.** Applies to plan's push. Run it in the controller's own Bash call, from the invoking checkout:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" push --root <run-root> --remote <remote> --base <base>
```

`<remote>` is the `Remote:` value of `docs/agents/code-management.md`, and `<base>` is that document's base branch.
**No `Remote:` value** → skip the push, say once that the branch stays local, and name no default remote.

**The push mode.** Applies to the verb's decision. It reads the branch from the ledger's `**Branch:**` line, fetches
the remote branch, and decides the **push mode** (`CONTEXT.md`) from the remote tip it fetched:

- **No remote branch, or a remote tip that is an ancestor of the local tip** → a plain push with an upstream set. It
  prints `pushed`.
- **A remote tip that `## Containment` proves contained in `<base>`** → a push through `--force-with-lease` naming
  that exact tip. It prints `overwritten`.
- **Any other remote tip** → no push. It prints `refused` and the remote tip's commits that the judged base does not
  hold, the base refetched from the remote when the refetch ran.

**Undecided outcomes.** Applies to every case the verb cannot decide. It pushes nothing and prints one of:
`unreachable` and `credential-rejected` (a failed fetch, the containment refetch of `<base>` included, read under the
C locale), `timed-out` (a git call its own bound ended, the refetch included; the line names the bound in milliseconds
and its key, `code-host.pushTimeoutMs`), or `push-failed` (the remote rejected the push, a moved lease included).

- The verb exits 0 on `pushed` and `overwritten`, 3 on every outcome that pushed nothing, and 1 on a usage refusal.
- A `**Branch:**` line naming `<base>` is a usage refusal, so the verb never pushes base.
- It writes nothing to the ledger.

**The push is best-effort.** Applies to an outcome that pushed nothing. Report it once in the command's output: the
outcome word, the `git push -u <remote> <branch>` line the verb printed for the operator, and the consequence that
`/superdev:implement` on another machine stops at its `resumed` fetch until the branch is on the remote. On `refused`,
also list the commits the verb printed, and name no command that would overwrite them. Then continue as if the push
had succeeded: no ledger stage, step, or published snapshot changes because of it.

## Bringing the scope branch to base

**Who runs it.** Applies to both execution playbooks and `/superdev:review`. Each playbook runs this step right after
its write of `scope-mode.md`'s `## The run lock` and before its first slice, on every `/superdev:implement`
invocation and at every run kind. `/superdev:review` runs it on a live scope run at every stage before `shipped`,
`submitted` included: after its scope checkout and run lock and before its preparation and first dispatch; again
itself, never through a fix implementer, before its stage write or its leave-alone; and at a fix cycle's end when the
scope branch no longer holds the base tip (`review-scope-mode.md`'s **The moved base** concept).

- The step runs no test suite. The full-suite evidence `/superdev:ship` takes verifies every merge it makes.
- Review pushes nothing here. At `submitted`, `/superdev:ship` pushes the merged tip.
- `/superdev:plan`'s own cut never reads this step.
- `<remote>` and `<base>` come from `docs/agents/code-management.md`. `<branch>` is the scope branch the playbook's
  branch step left you on.

1. **Check the scopetree first.** `git -C <run-root>/scopetree status --porcelain` returns nothing, and `git -C
   <run-root>/scopetree rev-parse -q --verify MERGE_HEAD` finds no unfinished merge.
   - **Anything else** → name what you found and stop, discarding nothing and dispatching no slice. **`--unattended`
     → block**, per `scope-mode.md`'s `## Unattended`.
   - **The lite exception** (`scope.js tier --root <run-root>` prints `tier: lite`): the scopetree is dirty, no merge
     is unfinished, and a slice is `in-progress` → skip the whole base step, name the skip in the report, and leave
     the work to the playbook's `## Resume`. The next invocation brings the base in. At the full tier any dirty
     scopetree stops.
2. **Fetch the remote base.** Run `GIT_TERMINAL_PROMPT=0 git fetch <remote> <base>` through the Bash tool with its
   `timeout` set to 120000 ms. Capture `<tip>` at once with `git rev-parse FETCH_HEAD`, because step 3 overwrites
   `FETCH_HEAD`. A fetch the timeout killed carries no verdict and counts as failed.
3. **Fast-forward the local `<base>` ref, and nothing more.** Run `git fetch . <tip>:refs/heads/<base>`. This is the
   only local-git write to `<base>` superdev makes: it moves a ref, writes no commit, and touches no working tree.
   - Git refuses it when `<base>` is checked out in any worktree, or when the update is not a fast-forward (verified
     2026-10-05, git 2.54.0: exit 128, `fatal: refusing to fetch into branch 'refs/heads/<base>' checked out at …`).
     A refusal is no failure: leave the local `<base>` where it was, and name the refusal in the run's report.
   - A local `<base>` already at `<tip>` needs no word. Step 4 runs either way.
4. **Bring `<tip>` in, and record it.**
   1. **Find the numbering collisions.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" collisions --base <tip>
      --branch <branch> --range-base <range-base>`, with `<range-base>` per `scope-mode.md`'s `## The scope's range
      base`. Add one `--also <ref>` for each other run's scope branch that `scope.js candidates --stage
      planned,implementing,merged,reviewed,documented-unreviewed,documented,submitted,shipped,closed` names (per
      `scope-mode.md`'s `## Resolving an empty argument` → *Run-root enumeration*, this run's own slug left out, each
      branch read with `scope.js get branch --root <run-root>`) whose ref resolves with `git rev-parse --verify
      <ref>`.
      - Exit 0 → nothing collides.
      - Exit 1 → renumber each printed line per `merge-conflicts.md`'s numbering-collision rule, and commit it in the
        scopetree. A renumber asks nothing, so an unattended run renumbers the same way.
      - Exit 2 → the check could not run. Name its message and stop, dispatching no slice; never read it as no
        collision. **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`.
   2. **Find the citations the renumber missed.** Only after a renumber commit, and before the merge, run `node
      "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" citations --range-base <range-base> --branch <branch> <id>…` with every
      old id the renumber moved, each as `collisions` printed it. It prints one `<path>:<line> <id>` line per line the
      scope branch added that still cites an old number.
      - Exit 0 → none.
      - Exit 1 → fix each named line to the new number, commit, and run it again, until it exits 0 or prints only kept
        lines. A line you judge a legitimate citation of the old number goes to the attended operator, who fixes or
        keeps it. **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`.
      - Exit 2 → the check could not run. Name its message and stop, dispatching no slice.
   3. **Merge.** `git -C <run-root>/scopetree merge-base --is-ancestor <tip> <branch>` succeeds → nothing to merge.
      Otherwise run `git -C <run-root>/scopetree merge <tip>`, `<run-root>` spelled out as the real absolute path. A
      conflict, `MERGE_HEAD` still set, is resolved, concluded, or escalated per `merge-conflicts.md`.
   4. **Record the tip.** Once `<tip>` is in the scope branch, merged now or already there, run `node
      "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" base set <tip> --root <run-root>`. `scope-mode.md`'s `## The scope's
      range base` reads the record.
   5. **Go on.** Go to the first slice, or, for `/superdev:review`, to its preparation and then its first dispatch,
      whatever the suite record reads. A red, denied, or absent suite record asks nothing, stops nothing, and blocks no
      unattended run.

**A base that cannot be fetched is a degraded pass.** Applies to no `<remote>` configured, a failed or killed fetch, or
a remote that does not carry `<base>`. Skip steps 2 and 3, run step 4 with the local `<base>` in place of `<tip>`, and
record no `**Base:**` line. Record the reason with `scope.js degraded add` after `scope.js get degraded --root
<run-root>` shows no entry for the same reason, the second shape in `scope-findings.md`'s `## Degraded passes`.

- Record and continue, attended or unattended alike.
- `/superdev:submit-pr` carries the entry into the pull request body.
