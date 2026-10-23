# 0137: A slice re-review reads its fix cycle's changes

**Status:** Accepted

**Amended by:** [ADR 0174](0174-minor-only-verdicts-batch-their-fixes-and-continue-warm.md).

**Context.** In the full tier, a slice re-review reads the whole slice again, the same subject as the
first review. No ADR decided that. The dispatch and `slice-reviewer`'s own body both hand over the slice
branch against the scope branch. In the fail-to-pass-run scope, 15 slice re-reviews took 6 to 11 opus
minutes each, almost all of it model time spent on code the fix did not touch. ADR 0118 measured where
re-review findings come from. Of 44, 37 came from the fix cycles: 16 were new defects in the fix diff,
and 20 were incomplete fixes. Seven were older defects that a later whole read found.

**Decision.** A slice's first review, review cycle 0, reads the whole slice. A re-review, review cycle
n > 0, reads the range of the n-th fix cycle, from the tip the earlier review read to the current tip. It
judges each earlier finding from the progress log after its blind pass, as ADR 0114 sets. It reads other
code wherever the fix or an earlier finding leads it, and it reports any defect it meets. When a fix
cycle changed nothing, the re-review judges the earlier findings alone.

The scope review's `final-reviewer` keeps reading the whole scope range on every dispatch, its re-reviews
included. It is the backstop for an older defect that a slice re-review no longer re-reads.

**Considered options.**

- Narrow `final-reviewer`'s re-reviews in the scope fix loop too. It saves 4 to 8 opus minutes per scope
  re-review. It loses because nothing would then re-read the whole branch after a fix cycle.
- Keep the whole-slice re-read. It loses on cost. The re-read finds older defects at a rate of 7 in 44,
  and the scope review's whole read can still find them.

**Consequences.** An older defect that only a whole re-read finds surfaces at the scope review, not
inside the slice loop. A re-review's subject and its fail-to-pass range are now the same range.
