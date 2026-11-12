# Full tier: resuming a run

The full playbook's controller reads this from `implement-full.md`'s `## Resume`, with that playbook still in
force, on a `resumed` run kind and after a compaction mid-run.

## Resume (re-running on an existing scope)

Re-entering an already-started scope — a fresh session, a re-run after compaction, an interruption
mid-loop — is a **first-class path through the loop, not a special case**: reconcile state, then re-enter
the DAG loop at step 1.

- **Find the scopetree first**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope
  checkout` — present, recreated when absent, or a named stop when another working tree holds `<branch>`
  — before reading anything out of it.
- **Found already present? Run init's own entry step already checked the run lock's liveness before this
  playbook started** (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The run lock`), so this step
  reconciles rather than detects a live second session — no further lock read of its own. Continue below;
  `implement-full.md`'s `## Run lock` refreshes the file at your first write.
- **Reconcile before dispatching.** Read the ledger through
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get slices --root <run-root>` (and `get stage`), plus
  `<run-root>/interfaces.md` (your pre-compaction context is gone; this file is what survives), and
  cross-check the ledger against `git -C <run-root>/scopetree log <range-base>..<branch>`
  (`<range-base>` per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`;
  `<branch>` from `implement-full.md`'s branch step, never rebuilt as `<type>/<scope>`; merge commits name the slice
  branch) and the store's slice statuses. A slice the ledger — or the merge log — marks `merged` is done:
  **never re-dispatch it**, no matter what a stale in-progress slicetree suggests.
- **Reconcile leftover slicetrees.** For each `<run-root>/slicetrees/<id>` still present,
  check its branch against the ledger: already merged → clean it up (`git worktree remove` +
  `git branch -D slice/<scope>/<id>`); not yet merged → resume it in place (dispatch there with its
  existing commits intact, per the implementer's own resume discipline, or continue a tiny slice there
  yourself) rather than recreating it, preparing it
  first: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" prepare <run-root>/slicetrees/<id>`, per `scope-branch.md`'s `## Preparing a worktree`; a failing
  preparation stops that slice's dispatch, and `--unattended` blocks.
- **Rebuild the runnable set from reconciled state** (`implement-full.md`'s DAG loop step 1) and continue.
  Where every slice is `merged` and `get minors` names a slice, run or continue the sweep through
  `implement-full.md`'s `## After the last merge`, taking its cycle count from the sweep log, before run handoff.
