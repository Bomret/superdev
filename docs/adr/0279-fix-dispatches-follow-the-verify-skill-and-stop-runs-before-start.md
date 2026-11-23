# 0279: Fix dispatches follow the verify skill, and its Stop runs before its Start

**Status:** Accepted

**Amends:** [ADR 0277](0277-the-implementer-observes-a-behavior-slice-through-a-repo-local-verify-skill.md).

**Context.** ADR 0277 hands the verify skill's path to the dispatches that build or fix a `behavior` slice. The scope
review's fix dispatch and the full tier's Minor sweep fix dispatch change the same code afterwards, so the
observations a slice build quoted can describe code that changed since. The skill's Stop also runs only on exits the
builder itself reaches: a dispatch killed mid-run, or a session that ends, leaves the app running in its checkout,
where the next Start collides with it and its writes keep the tree unclean.

**Decision.** Every scope-review fix dispatch and every Minor-sweep fix dispatch carries the skill's path, or `none`,
on its denied-dispatch inline route and on a warm-cycle resume too. The fixer follows the skill when a finding's fix
is not mechanical and changes code outside the test paths. A follower runs the skill's Stop before its Start, so an
instance an earlier, ended run left in that checkout is stopped first, and the skill's Stop succeeds when no instance
runs. A Stop before Start that fails is a concern, and nothing starts.

**Considered options.**

- **Gate the path on the scope's `behavior` slices.** Rejected: a scope-review finding names files, never the slice
  that wrote them, so the controller cannot map a finding to its slice's type. Whether the fix changes behavior is
  the fixer's own judgment, and the one that matters.
- **A `SubagentStop` or `SessionEnd` hook that stops the app.** Rejected: the skill is prose, so no hook holds the
  command or the process that Stop names.
- **The controller runs Stop before it removes a checkout.** Rejected: a checkout is removed without `--force`, so a
  leftover write already blocks the removal visibly, and Stop before Start covers every route that re-enters the
  checkout.

**Consequences.** A verify skill's Stop must succeed with no instance running and act on its own checkout's instance
alone, which the scaffold states, because sibling slicetrees verify in parallel. A follower starts the skill only on a
tree with no uncommitted change, so the first Stop never removes its own work, and the clean-tree baseline is read
after that Stop. `review-inline-fix.md` names no skill path, so the ad-hoc review's inline Minor fix follows none.
