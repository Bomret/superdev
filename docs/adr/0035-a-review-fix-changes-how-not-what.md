# 0035: A review fix changes how the code meets the DoD, never what it does

**Status:** Accepted

## Context

`/superdev:review`'s scope mode drives a fix loop: it asks once, then dispatches one implementer with the
complete findings list and re-reviews until the verdict is clean or the three-strike cap is reached
(ADR 0013). Nothing bounded what a fix could be.

On the run this decision comes from (`feat/one-full-suite-run`, pull request #286), a review pass found
that an ADR sentence justifying a step's silence was false: the documentation step commits after the
review, and nothing re-verified those commits before the pull request. Two remedies were available —
correct the sentence, or give the documentation step a verification run of its own. The second was
chosen, and it was **new behaviour the Definition of Done never named**. It arrived with a contract row, a
narrative rewrite, a README correction, a glossary clause, two further ADR edits, and follow-up findings
of its own about which checkout it ran in and what a no-test-matched exit code meant. Most of two fix
cycles were that one addition settling.

The operator chose it knowingly, from a question naming both options. The failure was not the choice: it
was that the choice arrived disguised as one finding among four, at the point in a long run where the
appetite for scope questions is lowest.

## Decision

**The fix loop may change how the code meets the Definition of Done. A remedy that adds a capability the
Definition of Done never named is recorded and handed to `/superdev:plan` instead.**

The boundary is drawn at the Definition of Done, not at "behaviour": repairing a defect in what the
Definition of Done does name stays inside the loop, and such a repair is frequently behavioural — a
missing guard, a wrong branch, an unhandled failure mode. What leaves the loop is a capability nobody
planned, however good an idea it is.

"Recorded" is two places at once: a `### Deferred to a plan` heading in the review's own report, one line
per finding with the follow-up command beside it, and a `**Deferred:**` bullet in the run's ledger that
`/superdev:ship` copies into the pull-request body. The ledger's `**Unresolved:**` line is not that
record — it is for defects the run leaves standing, and a capability nobody planned is not one, so the
deferred finding gets a line of its own rather than overloading that one.

Three drift rows pin the boundary — the "changes how" framing, the hand-off destination, and the exit
clause a deferred finding needs so `--unattended → fix` and the clean-verdict check both treat it as
settled rather than as an unresolved defect — because a boundary that reads as advice is one an eager fix
cycle steps over, a boundary with no destination leaves the finding nowhere to go, and a boundary with no
exit deadlocks the run on the very finding it was meant to wave through. None of the three rows anchors on
the phrase the report template also carries: a row satisfied by the template while the instruction is gone
would be the same one-sided pin this decision's companion rule exists to prevent.

## Considered options

- **Ask, but label it scope growth.** Let the review still build it, on the condition that it presents the
  remedy as scope growth rather than as one finding among several, and records it in the ledger and the
  pull-request body. It keeps the escape hatch for a case where the addition really is the cheapest path,
  and it costs one paragraph. It loses because the label lands at exactly the moment the operator is least
  able to weigh it — deep in a fix cycle, at the hour these runs reach — and because the plugin already
  has a place for unplanned work: an interview that starts fresh, with the whole tree in view.
- **Leave it unbounded and rely on the reviewer.** The reviewers already report over-engineering, and a
  human reads every finding. It costs nothing. It loses on the evidence: the reviewer that found the
  false sentence proposed the behavioural remedy itself, and no pass flagged the growth as growth.

## Consequences

A review that finds a real gap outside the plan now produces a smaller change and a follow-up, instead of
a larger change and a longer review. The recorded gap may never be built, which is the cost this accepts.

The record itself is durable. `/superdev:review` writes each deferred finding to the ledger's
`**Deferred:**` line (`scope.js deferred add`), and `/superdev:ship` copies every bullet into the
pull-request body under its own heading — so the finding reaches the reader who decides what to build
next, rather than ending with the conversation that found it. The first version of this decision left the
record in the review's report alone and named that a cost; the record above is what closed it, and
`references/scope-mode.md`'s `## Deferred findings` section states its shape. What remains true is the
softer cost: a follow-up in a pull-request body is a prompt, not a plan, and nothing builds it until
somebody runs `/superdev:plan`.

The boundary needs judgment at exactly one seam — whether a finding names a defect in planned behaviour or
asks for unplanned behaviour — and prose is what carries that judgment. If the boundary misfires in either
direction (a defect repair refused as scope growth, or growth admitted as a repair), the next step is an
argument over this prose and the cases it misjudged. superdev holds no mechanism for settling a contested
prompt line by running the document (ADR 0071).

Nothing changes for an ad-hoc review, which applies no fixes at all.
