# 0205: The implementer self-checks before it reports

**Status:** Accepted

## Context

On the full tier, about 80% of first slice reviews from 2026-10-24 to 2026-10-29 found a Critical or
Important issue, and slices took up to four reviews. A keyword sort of those first reviews put acceptance
or specification gaps, missed invariants, a missing RED step, error handling, and uncovered input at the
top. Each further round costs a fix dispatch and a fresh `opus` review on the slice's path. The implementer
had no step that compared its own diff with its `spec` before it reported.

## Decision

Before it reports, every full-tier implementer dispatch that builds a slice, fixes a slice, or fixes a Minor
sweep runs a **self-check**. It walks each acceptance item, each named edge case, and each cited invariant
of its `spec`, and on a fix dispatch each finding in its list, against the whole slice range. On a
`behavior` slice it confirms from the run trace that a failing test came before each change. It fixes what
the walk finds, and appends the walk's result to the log its dispatch names. A report whose log holds no
self-check goes back to the implementer. The slice reviewer reads that log only after its blind pass
(INV-0114), so the self-check cannot soften a review. The `lite` tier keeps its inline loop, which already
ends on acceptance coverage and has no slice review to save.

## Considered options

- **Hand the implementer `references/review-checklist.md`.** It adds about 8.5k tokens per dispatch for
  lenses (anti-patterns, vulnerability classes, prompt-concept overlap) that rarely produced a blocking
  slice finding.

## Consequences

An implementer dispatch takes a few more turns. Fewer slices should need a second review. Nothing measures
that automatically; a later transcript reading can.
