# 0018: A degraded pass is not a stage

**Status:** Accepted

**Context.** `references/scope-mode.md`'s `## Degraded passes` section records when a chain step did not
get the assurance the chain promises: a dispatch the permission classifier denied, or a pass that could
not reach what it needed. The ledger's `**Stage:**` line already records how far a run has moved through
the chain (ADR 0013), so folding the shortfall into a second stage value looked like reuse rather than a
new mechanism.

**Decision.** A degraded pass is a `**Degraded:**` line in the ledger, beside `**Stage:**` and never part
of it. There is one bullet per degraded pass, naming the pass, why it degraded, and the date. The stage itself
never encodes degradation.

**Why.** The stage is one scalar naming how far the run has moved, and `documented-unreviewed` already
shows what a second axis costs there: one shape (the doc pass running ahead of review) already forced an
extra value into every command's stage table. Each further degrade shape multiplies the values that table has
to answer for, one combination at a time: a denied dispatch, an unreachable knowledge base, whatever a
later change adds. A bulleted line beside the stage scales by addition instead: a new
shape is a new bullet, not a new value every reader of the stage has to learn.

**Considered options.**

- *A dedicated stage value per degraded shape (for example `reviewed-degraded`)*. Rejected: it repeats
  `documented-unreviewed`'s cost for every shape, and a run degraded in two different ways at two
  different steps would need a value for the combination, not just the sum.
- *A boolean flag alongside the stage (for example `**Degraded:** true`)*. Rejected: it answers whether a run
  degraded but not which pass or why, which is the information `/superdev:ship`'s pull-request body and
  `/superdev:status`'s report both need to carry forward.

**Consequences.** The stage table in each command stays exactly as large as the chain's steps, unchanged
by how many degrade shapes exist. `references/scope-mode.md`'s `## Degraded passes` section states the
rule and the entry's shape. This record holds the reasoning, so that section can stay about what to do.
