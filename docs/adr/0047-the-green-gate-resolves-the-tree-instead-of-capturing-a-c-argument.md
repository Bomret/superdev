# 0047: The green gate resolves the merge tree instead of capturing a `-C` argument

**Status:** Accepted

**Amends:** [ADR 0045](0045-the-full-tier-runs-in-a-scope-worktree.md), whose Decision and Consequences
describe `hooks/green-gate.js` as capturing the merge command's `-C` argument. That mechanism was never
shipped this way and no longer matches the hook.

**Context.** ADR 0045 states the gate's job as: "the hook takes its working directory from that `-C`
argument" (Decision) and "`hooks/green-gate.js` captures the merge's `-C` path" (Consequences). Both
sentences describe a regex capture group holding a single `-C` value. That description was already
inaccurate the day the `full` tier shipped, and two rounds of fixes moved it further from what the code
does:

- `IS_MERGE`'s `-C` alternative carried a capturing group only through the first cut of ADR 0045's own
  work. JS resets every capture group inside a quantified group on each iteration, so a repeated group
  keeps only the last iteration's value. `git --work-tree /b -C /a merge` would lose `/b`. The capture
  was dropped. `resolveMergeCwd()` instead parses the matched option region once into a token list and
  reads it with `optionValue()` / `optionValues()`, which read every occurrence of a named option out of
  that list in order.
- The merge tree is no longer `-C` alone. `resolveMergeCwd()` reads both `-C` and `--work-tree`,  folds
  multiple `-C` options cumulatively (each resolved against the one before), resolves a relative
  `--work-tree` against that fold, and lets an absolute `--work-tree` win over a `-C` naming a different
  path outright.

A reader who takes ADR 0045 at its word looks for a capture group in `IS_MERGE` and a single `-C` read
in `resolveMergeCwd()`. Both are absent, so that reader cannot tell whether the ADR is stale or the code
is wrong.

**Decision.** ADR 0045's underlying decision still holds: the gate reads the merge's own working tree
instead of the session's. The mechanism is now qualified as resolution, not capture.
`plugin/hooks/green-gate.js`'s `resolveMergeCwd()` re-derives the merge's working tree from the matched
option region after `IS_MERGE` finds the command, taking it from `--work-tree` when the command carries
one (folding a relative path against every `-C` in the same command, applied in order) and from the last
`-C` otherwise. No option's value survives in a regex capture group. `optionValue()` /
`optionValues()` read it back out of the region by walking it option-by-option instead
(`plugin/hooks/green-gate.js`, the comment above `IS_MERGE` and above `resolveMergeCwd()`).

**Why.** ADR 0045's decision still holds: a scope worktree carries the merge, and the gate must read that
worktree, not the invoking session's. Superseding it would mark that decision as replaced, which is
false. Amending leaves the record intact and adds only the one qualification the mechanism needed.

**Consequences.** ADR 0045's own text is unchanged. The `**Amended by:**` pointer on its status line
sends a reader here for the corrected mechanism. No behavior changes: a `full`-tier merge still runs
`git -C <scope-worktree> merge`, and the gate still resolves that worktree correctly. The correction is
legibility only. This ADR now names the actual read path so drift-check's ADR-narrative checks and any
future reader find the code and the record in agreement.
