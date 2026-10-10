# 0138: The per-slice simplicity pass runs beside the first slice review

**Status:** Accepted

**Amends:** [ADR 0037](0037-the-full-tier-skips-the-whole-scope-over-engineering-pass.md).

**Context.** The full tier dispatches `simplicity-reviewer` once per `behavior` slice. ADR 0037 places it
alongside the `slice-reviewer`. The playbook instead runs it after the fix loop's last clean re-review,
and tells the controller to apply the cuts. The controller never implements inline (ADR 0001), so an
implementer applies them after the last review. No review reads those commits. The scope review then
reports each such slice as an Unreviewed slice (INV-0119, triage #1007). In the fail-to-pass-run scope,
each cut implementer took 9 to 12 minutes on the critical path. The scope review then needed four extra
slice reviews and a fix cycle. ADR 0118 rejected a re-review after each applied cut, because it adds an
opus dispatch per cut.

**Decision.** The controller dispatches `simplicity-reviewer` in parallel with a `behavior` slice's first
review. The controller still judges each recommended cut against the rules the repository documents. It
names each cut it declines, with the rule that cut would break. Each cut it warrants joins the first
review's fix list as a Minor finding. The fix implementer applies the cut in that cycle, and the re-review
reads it. No change lands on a slice after its last review.

A first review with no finding and no warranted cut merges the slice with no fix cycle. A first review
whose only findings are warranted cuts starts a fix cycle for them. Warranted cuts count toward the
3-cycle cap like any Minor finding. At the cap, a remainder of only Minor findings and cuts merges
(INV-0094).

**Considered options.**

- Dispatch `simplicity-reviewer` beside every slice review. It catches over-engineering that a fix cycle
  introduces before the merge. It loses on cost: one more dispatch per review, and cuts could feed every
  cycle.
- Let the controller apply cuts inline, as the playbook text reads. It breaks ADR 0001's rule that the
  controller never implements.
- Exempt a cut-applying implementer from INV-0119. It removes the false finding, but it leaves every cut
  unreviewed and saves no time.

**Consequences.** A slice whose only findings are warranted cuts now gets a fix cycle and a re-review. The
existing loop reviews the cut, so the per-cut re-review that ADR 0118 rejected stays unneeded.
Over-engineering that a fix cycle introduces gets no per-slice simplicity pass. ADR 0037 accepts the same
gap for the scope review on this tier.
