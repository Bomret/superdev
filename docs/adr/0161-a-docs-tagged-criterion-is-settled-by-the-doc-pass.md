# 0161: A `docs`-tagged criterion is settled by the doc pass

**Status:** Accepted

## Context

The implement chain runs `/superdev:implement`, `/superdev:review`, `/superdev:document`, and
`/superdev:submit-pr` in that order (ADR 0013). On the `full` tier the doc pass runs after the scope review
(ADR 0003), and no implementer edits the `AGENTS.md` hierarchy, because the doc pass reconciles it once
at the end of the scope (`agents/implementer.md`). A Definition-of-Done criterion whose deliverable is
`AGENTS.md` text is therefore still unmet when `final-reviewer` judges it. The reviewer judged such
criteria `broken` in the `fix/sweep-findings` run. A `broken` verdict holds the stage at review and
writes an `**Unresolved:**` entry (INV-0016), and the review fix loop may not edit the `AGENTS.md`
hierarchy (INV-0120). `/superdev:document` only unticks criteria its own commits broke, so no step ticked
the criterion after the doc pass made it true.

## Decision

A third criterion tag value, `docs`, sits beside slice ids and `scope` (ADR 0091). `/superdev:plan` tags
`docs` on every criterion whose deliverable is `AGENTS.md`-hierarchy text describing the scope's code. It
splits a criterion that mixes such text with another deliverable, because a line carries one tag. A
criterion that a `docs` slice delivers as `AGENTS.md` text, such as a restructuring of the hierarchy,
keeps that slice's tag. The implementer of such a slice may edit the `AGENTS.md` text its `spec` names.

The doc pass settles a `docs` criterion:

- `/superdev:review` never holds the stage on a `docs` criterion. `final-reviewer` gives an unmet one the
  `doc pass` verdict, which is no finding, starts no fix cycle, writes no `**Unresolved:**` entry, and
  leaves the line unjudged. A `holds` verdict still ticks it.
- `/superdev:document` hands every `docs` criterion that is neither ticked nor `accepted:` to its pass as
  a target, then judges each one. It leaves an `accepted:` criterion as it stands, because only an attended
  operator writes or removes `accepted:` (ADR 0095). At the `shipped` or `closed` stage it judges no `docs`
  criterion: its report names each unticked one, and the shipped or closed route picks the next command.
  A true criterion is ticked with evidence. A criterion still false after one targeted fix round is
  unticked with a note and gets an `**Unresolved:**` entry, the stage is not written, and the next
  command is `/superdev:document` again, because review cannot edit the `AGENTS.md` hierarchy. A later
  pass that makes the criterion true ticks it and clears the entry it wrote.
- A review fix cycle that lands commits unticks every ticked `docs` criterion, on the same trigger that
  clears the inline doc-pass record (ADR 0031). The next doc pass judges it again. At the `documented` or
  `submitted` stage the chain runs no further doc pass, so the untick also writes the same
  `**Unresolved:**` entry the doc pass writes, and the review routes to `/superdev:document`. At
  `submitted` it also invalidates the tip's suite record, so `/superdev:ship` does not merge. At the
  `shipped` or `closed` stage the run is past the doc pass and the pull request, so the untick writes no
  entry, invalidates no suite record, and changes no route. The review report names each unticked line.

Knowledge-base criteria keep `ceiling`: publishing a page is an outward-facing change (ADR 0084), and the
doc pass only stages pages (ADR 0094).

## Considered options

- *Run `/superdev:document` before `/superdev:review`.* The stage machine already allows that order
  (`documented-unreviewed`), and the reviewer's `holds` verdict would tick the criterion. Rejected: every
  review fix commit makes the docs stale and forces a second doc pass, and the order change rewrites
  ADR 0013's chain, every Next block and offer, and the stage gates.
- *`final-reviewer` classifies a criterion as doc-owned from its text.* Rejected: it is a judgment on every
  run, and it cannot settle a criterion that mixes `AGENTS.md` text with code.
- *`/superdev:plan` keeps `AGENTS.md` text out of the Definition of Done.* Rejected: the doc deliverable is
  then no longer checked.
- *Review writes a new note label on an unmet `docs` criterion.* Rejected: every reader of note labels
  would need it, while an unjudged line already carries no note (INV-0014).
- *A staged knowledge-base page counts as true.* Rejected: a staged page is not on the backend, so the
  published state would go unchecked.

## Consequences

A `docs` criterion can stand unmet at the `reviewed` stage, which INV-0016 states as an exception.
`/superdev:document` gains a tick of its own, which INV-0015 states. The lite tier's inline doc pass
runs before review (ADR 0031) and takes every `docs` line that is neither ticked nor `accepted:` as a
target, so review's `holds`
verdict ticks the criterion. A run
planned before this decision carries no `docs` tag and behaves as before. The store seeds state the
`docs` tag, so `/superdev:setup` offers it to an existing store document as a seed gap (ADR 0107).
