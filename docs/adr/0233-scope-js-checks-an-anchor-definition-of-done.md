# 0233: scope.js checks an anchor's Definition of Done at plan and at scope review

**Status:** Accepted

**Amends:** [ADR 0144](0144-plan-absorbs-open-triage-records.md): the correspondence between the Absorbs
line and the `(triage <reference>)` citations is checked by a verb, not only by plan's prose.

## Context

Scope anchor #164 carried `**Absorbs:** #158`. Its Definition of Done named #158 only in a prose
`Source:` sentence, and no criterion cited `(triage #158)`. The scope review and the final reviewer did not
see the mismatch. `/superdev:wrap-up` reads the citing criterion's verdict to close an absorbed record, found
none, and left #158 open. Wrap-up was the first place the mismatch showed, after the merge. INV-0151 and
INV-0137 (every Definition of Done names the four release-risk categories) both had `Check: none`, and the
reachability rule had no check either (triage #23).

## Decision

`scope.js dod-check` reads an anchor body on stdin: an epic, or a lone slice whose acceptance is the
Definition of Done. It touches no ledger and makes no store call. It reads checklist lines only, in the
`Definition of Done` section when the body has one and in the whole body otherwise, and never inside a
code fence. It refuses, naming each problem on its own line, when an Absorbs entry has no `(triage <ref>)`
citation, when a citation names a record the Absorbs line does not name, when two or more criteria cite
one record, when no criterion is led by `Reachable:`, or when the `Release risk:` criteria leave one of the
four release-risk categories unnamed.

- **Plan runs it before any store write.** `/superdev:plan` pipes the drafted anchor body, with its drafted
  anchor-only lines, through the verb on every plan kind and on a single-slice plan. A refusal names each
  line to fix before anything is written.
- **Scope review runs it in the anchor sync.** Its input is built from the store's own two reads: the
  anchor's Definition-of-Done lines under a `## Definition of Done` heading, and an Absorbs line naming the
  entries the store's **Read an anchor's Absorbs line** call returns. The verb so never parses a
  store-specific body such as a Jira description. A refusal is a standing defect, written by the review's
  standing-defect writes: one `**Unresolved:**` entry per problem, the tip's suite record invalidated at
  `submitted`, and the stage left where it is, so `/superdev:submit-pr` and `/superdev:ship` wait. The
  re-sync before each stage write runs the check again, so a clean verdict never clears a hold the anchor
  still earns. The anchor text is the operator's to change, so the review dispatches no
  implementer and names the hand fix. At `shipped` or `closed` it names the problems in its report only.
- **Wrap-up stays the backstop.** Its rule for an absorbed record with no citing criterion is unchanged.

## Considered options

- **Extend `dod-tags`.** It already reads an anchor body. It loses because `dod-tags` checks slice-id tags
  and does not run on a single-slice plan, where the lone slice's acceptance needs the same check.
- **Check at plan only.** It loses because an append or a hand edit of the anchor after plan would reach
  ship unchecked.
- **Report the problem at review and let the stage advance.** It loses because nothing would then stop
  ship, and wrap-up would again be the first place the mismatch has an effect.
- **Have the review fix the anchor itself on an attended yes.** It needs a criterion-text rewrite across the
  anchor and `dod.md` that no verb provides, for a problem the operator fixes in one edit.
- **Check only that `Release risk:` and `Reachable:` lines exist.** It loses because one `Release risk:`
  line naming one category would pass while three categories went unanswered.

## Consequences

An anchor whose citations, reachability, or release-risk lines are incomplete is refused at plan time or
holds the scope at review, before ship. INV-0137 and the new correspondence invariant gain a deterministic
check. A run planned before the verb existed, whose anchor fails the check, holds at its next scope review
until the operator edits the anchor.
