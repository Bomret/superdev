# 0096: Opening the pull request and merging it are separate commands

**Status:** Accepted

**Context.** `/superdev:ship` (ADR 0013) opened the pull request, closed the scope anchor, and set the
stage to `shipped`, so the chain ended while nothing had landed. The merge happened outside superdev, and
superdev never saw it. The merge was untested whenever base had moved since review. A dependent feature
counted its blocker as done once the anchor closed, which was at the open pull request, so it could start
on a base that did not yet hold the blocker's code. How a pull request gets reviewed varies per
repository. An operator may take a quick look and merge, review thoroughly, or hand it to a colleague. So
the chain cannot run straight through the merge.

**Decision.** The step that opens the pull request is `/superdev:submit-pr`. It pushes the scope branch,
opens the pull request, and leaves the run standing. The chain `implement → review → document →
submit-pr` ends at the stage `submitted`, and `/superdev:afk` drives an anchor to it and no further.

`/superdev:ship` is a separate command, and only a human starts it. It carries `disable-model-invocation: true`, as `/superdev:afk` does, so no model starts it on its own. It renders as a command on OpenCode and is absent on Codex (INV-0066). It merges the pull request:

1. It refuses when no pull request is open (the `push-only` posture opens none), when the scope branch's
   tip has no green full-suite result it may reuse (`scope.js suite reusable`, INV-0017), or when an
   `**Unresolved:**` entry stands and the operator declines at its ask-once.
2. When base has moved since that result, it merges base into the scope branch, runs the full suite once,
   and records the result. A red result, a denied run, or a conflicting merge lands nothing. On a
   conflict it names the files. The operator resolves them and runs `/superdev:review` again, which gates
   the resolution and records a new result. A review at stage `submitted` records its suite result and
   leaves the stage where it is.
3. It prints what it merges (pull request, head, base, suite result) and squash-merges through the host's
   merge API, pinned to the tested head. It never sets a force option. When the host refuses, because of
   an approval, protection, or a moved head, it merges nothing and relays the reason. Calling the command
   is the consent, so it asks no second question.
4. A pull request someone already merged by hand is adopted. `ship` records `shipped`, and writes a
   `**Degraded:**` bullet when the merged head was not the tested commit.
5. After the merge it closes the scope anchor on a remote store, removes the scopetree, the slicetrees,
   and the run lock, and sets the stage to `shipped`, which means merged. On the local plan-file store the
   anchor close is a scope-branch commit `submit-pr` makes before its push, so it reaches base with the
   merge.

A run at the old `shipped` stage, which the old command set when it opened the pull request, is judged
from the host: an open pull request reads as `submitted`, and a merged one is adopted.

**Why.** One command does one job. The operator's own review of the pull request sits between the two
commands, whether it takes a minute or a colleague's afternoon. Pinning the merge to the tested head is
what makes "the tested commit is the merged commit" true on a host without CI. Neither repository this
plugin was measured on runs CI. A conflict resolution is new code nobody has reviewed, so it goes back
through the gate rather than past it. Closing the anchor at the merge is what makes a dependent wait for
code that actually landed.

**Considered options.**

- *One `/superdev:ship` that runs pull request, merge, deploy, verify, and close in one go.* The pull
  request review varies per repository and is sometimes a colleague's, so the chain has to stop at the
  open pull request.
- *One `/superdev:ship` whose behaviour depends on the state it finds* (run it once to open the pull
  request, again to merge). What a command does should follow from its name.
- *Leave the merge to the host's own configuration and CI.* Without CI, nothing tests the merged result.
- *Merge with local git and push to base.* That writes to base directly. Branch protection often refuses
  the push, and INV-0001 admits only the host-API merge.
- *Reword INV-0001 to allow any reviewed pull-request merge.* A later command could then also claim the
  right to write to base.
- *`ship` resolves a base-merge conflict itself.* The resolution would land on base unreviewed.
- *`ship` stays model-invocable, and prose alone keeps agents from starting it.* A model in an ordinary
  session could still start a merge that the operator never typed.
- *`ship` asks "merge?" before merging.* The operator already chose to run the merging command, and
  afk never runs it.
- *`ship` refuses a hand-merged pull request.* The stage would stay `submitted` forever, and
  `hooks/scope-prune.js` would never reap the run.
