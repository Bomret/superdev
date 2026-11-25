# Full tier: resuming a run

Applies to the full playbook's controller on a `resumed` run kind and after a compaction mid-run, read from
`implement-full.md`'s `## Resume` with that playbook still in force.

## Resume (re-running on an existing scope)

**Reconcile, then re-enter.** Applies to every re-entry into an already-started scope: a fresh session, a re-run after
compaction, or an interruption mid-loop. Reconcile state with the steps below, then re-enter the DAG loop at step 1.

1. **Find the scopetree first**, per `scope-mode.md`'s `## The scope checkout`: present, recreated when absent, or a
   named stop when another working tree holds `<branch>`. Make no lock read of your own: `scope-mode.md`'s `## The run
   lock` owns that rule.
2. **Reconcile before dispatching.** Read the ledger through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" state
   --root <run-root>`, its `slices` and `stage` fields, and `<run-root>/interfaces.md`. Cross-check the ledger against
   `git -C <run-root>/scopetree log <range-base>..<branch>` (`<range-base>` per `scope-mode.md`'s `## The scope's range
   base`) and the store's slice statuses.
   - **A merged slice in git** is one whose merge commit's full message (`--format=%B`, never `--oneline` or `%s`
     alone) names `slice/<scope>/<id>`, or whose slice branch tip is the second parent of a merge commit in that range.
     A merge with git's default message and one with a convention message both reconcile this way.
   - `<branch>` is the ledger's `**Branch:**` line, read in `implement-full.md`'s branch step, never rebuilt as
     `<type>/<scope>`.
   - The change type the implementer dispatch hands is that branch's prefix.
   - Read the verify skill's path again from `docs/agents/verification.md`'s `## Verify skill` for a `behavior`
     slice's dispatch or resume, and for a resumed sweep's fix and re-review, never from memory (`skills/implement/SKILL.md`'s **The
     config**).
   - A `malformed` entry names a slice row the ledger cannot read: resolve it before dispatching.
   - A slice the ledger, or the merge log, marks `merged` is done: **never re-dispatch it**, whatever a stale
     in-progress slicetree suggests.
3. **Reconcile leftover slicetrees.** For each `<run-root>/slicetrees/<id>` still present, check its branch against
   the ledger.
   - **Already merged** → clean it up: `git worktree remove` and `git branch -D slice/<scope>/<id>`.
   - **Not yet merged, and `blocked` with the reason `merge refused`** → merge it again by `implement-full.md`'s DAG
     loop step 4, never re-dispatching an implementer (`merge-conflicts.md`'s **A refused merge**).
   - **Not yet merged otherwise** → resume it in place: prepare it per `scope-branch.md`'s `## Preparing a worktree`,
     then dispatch there with its existing commits intact, or continue a tiny slice there yourself.
4. **Rebuild the runnable set** from reconciled state (`implement-full.md`'s DAG loop step 1) and continue. Where every
   slice is `merged` and `get minors` names a slice, run or continue the sweep through `implement-full.md`'s `## After
   the last merge`, taking its cycle count from the sweep log, before run handoff.
