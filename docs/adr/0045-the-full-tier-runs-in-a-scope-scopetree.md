# 0045: The full tier runs in a scopetree

**Status:** Accepted

**Amends:** [ADR 0001](0001-lite-scope-scopetree.md).

**Amended by:** [ADR 0047](0047-the-green-gate-resolves-the-tree-instead-of-capturing-a-c-argument.md),
which corrects the green-gate mechanism this ADR describes: the hook resolves the merge's working tree
from `-C` or `--work-tree`, read back out of the matched option region, never from a regex capture group.

**Amended by:** [ADR 0155](0155-a-slice-merge-runs-no-test-suite.md), which deletes `hooks/green-gate.js`,
so no hook reads the merge's working tree to run a suite.

**Context.** ADR 0001 established the rule that superdev never switches the invoking checkout, converted
the `lite` tier to a dedicated scopetree, and deferred the `full` tier to a follow-on — naming its
remaining offenders as the scope switch and the merge in the invoking tree. That deferral is still open.
A `full` run cuts its scope branch with `git switch -c <type>/<scope>` in the invoking checkout, merges
every slice there, keeps an epic's `integration/<scope>` checked out there, and relies on
`/superdev:ship` §6 to return the checkout to base. `/superdev:review` and `/superdev:document` then find
the scope branch in that same checkout, and `/superdev:afk` moves it again for each feature in a sweep.

Two costs follow. A second superdev session in the same directory finds the checkout on another run's
branch, and both run init and `/superdev:plan` refuse to commit design docs from anywhere but the base
branch, so the second session stops before it starts. And a single run is enough to take the operator's
own checkout away for the length of the chain — permanently, if the run blocks.

Two hooks have grown dependencies on that layout. `hooks/slicetree-sweep.js` reads `git branch --merged`
with no argument, so its notion of "integrated" is whatever branch the invoking checkout happens to hold;
it reaps merged slicetrees only because a full run parks that checkout on the scope branch.
`hooks/green-gate.js` runs the suite in `input.cwd`, the session working directory, because the Bash
`tool_input` payload carries only the command string.

**Decision.** The `full` tier cuts its scope branch into the same dedicated scopetree the `lite`
tier uses, `.superdev/scopes/<scope>/scopetree`, and does every merge there. The invoking checkout is
never switched, at either tier. Four consequences are part of the decision rather than left to
implementation:

- **The scope checkout resolves to one place.** A run whose scopetree is absent recreates it with
  the `git worktree add <path> <branch>` call the `resumed` run kind already makes. A scope branch some
  other working tree already holds surfaces as git's own refusal and a named stop, never as a silent
  switch.
- **An epic's integration branch reuses the scopetree.** `integration/<scope>` is checked out there
  for the run, and the integrate-and-verify slice switches that scopetree back to the scope branch for the
  final merge. Switching a working tree superdev owns breaks no rule here, and it keeps the run root's
  layout at two shapes rather than three.
- **The run lock covers both tiers.** `hooks/run-lock.js` guards `git worktree add` on the scopetree
  path and keys on that phrase alone, so the `full` tier reaches the guard the moment it cuts a scopetree.
  The lock's creation moves out of the `lite` playbook into the shared scope-mode rule, written after the
  scopetree is cut so the owner never blocks itself.
- **The green gate reads the merge command's own working tree.** A merge is directed with `git -C
  <scopetree> merge`, and the hook takes its working directory from that `-C` argument, falling back
  to the session cwd. The hook's merge matcher already tolerates the flag; only the capture is new.

**Why.** The alternative was to keep the switch and make the collision loud — refuse it while another
run's lock is fresh, and tell a concurrent operator to open their own worktree. That reports the problem
instead of removing it, and leaves the single-session hijack untouched. Merging without a working tree,
through `git merge-tree` and plumbing, would satisfy the rule and nothing else: conflict resolution, the
green gate, and the reviewers all need a real tree.

The cost is one `git worktree add` per full run, and merge conflicts resolved somewhere other than the
operator's editor checkout. Against that, the two tiers stop diverging: `references/scope-mode.md`'s
per-tier splits at `## Cutting the scope branch`, `## The scope checkout`, and `## The run lock` all
collapse, `/superdev:ship` loses its return-to-base step, and `/superdev:afk` loses the paragraph
explaining where a blocked feature's branch went.

**Consequences.** `hooks/slicetree-sweep.js` computes "integrated" against the scope branch instead of the
current branch, which it reads from the run's ledger the way `hooks/scope-prune.js` already does.
`hooks/green-gate.js` captures the merge's `-C` path. `hooks/scope-prune.js` gains protection it did not
have: its scopetree guard already tests the singular `scopetree` directory, so a full run mid-chain is now
caught by that guard as well as by the `shipped` stage gate. Its comments asserting that a full run cuts
no scopetree and leaves the checkout on the scope branch become false and are rewritten.

A run started before this change has no scopetree and an invoking checkout still holding the branch.
Recreating the scopetree fails there with git's "already checked out" refusal, which names the tree
holding it. The remedy is one line: switch that checkout back to base and re-run.

ADR 0033's expand–contract sequencing is unchanged; only the working tree its integration branch lives in
moves. ADR 0001's decision stands in full — this discharges the deferral it recorded.
