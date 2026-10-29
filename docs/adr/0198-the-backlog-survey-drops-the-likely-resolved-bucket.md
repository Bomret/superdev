# 0198: The backlog survey drops the `likely resolved` bucket

**Status:** Accepted

**Amends:** [ADR 0164](0164-the-backlog-survey-reads-closed-anchors-and-every-snapshot-stage.md), whose
first decision put a triage record that a closed anchor's body names in a `likely resolved` bucket.

## Context

ADR 0164 takes any whole mention of an open triage record in a closed scope anchor's body, outside its
`## Run state` section, as evidence of a fix. Closed anchors mostly mention a record to leave it out: in
Non-goals, in "stays open", in "filed as triage records, outside this scope", in an accepted unmet
criterion, in "answers #n in part", and in met criteria that record the record was left open. On
2026-10-29 the survey put 18 records in `likely resolved` in this repository's store. None of them was
fixed, and the real `needs planning` records ranked below them.

The three fixes ADR 0164 was built on, #379 (closed #419), #814 (closed #1009), and #1059 (closed
#1075), predate the Absorbs line (ADR 0144). Since then a plan that takes on a record names it in its
anchor's Absorbs line, and `/superdev:wrap-up` closes it. On 2026-10-29, 31 closed anchors carried an
Absorbs line, and no closed anchor's body stated with a closing verb (fix, close, resolve) that it fixed
a record still open.

## Decision

The backlog survey has no `likely resolved` bucket, and it reads no closed anchor's body. A triage record
that no open anchor's Absorbs line names is `needs planning`, whatever a closed anchor says about it.
Closing a fixed record is the closing side's job: the Absorbs line at plan time, and `/superdev:wrap-up`
at the end of the scope.

## Considered options

- *Keep the bucket and count only a reference that directly follows a closing verb.* Rejected: it flags
  none of the 69 open records on this store, so the bucket would show nothing, and it keeps a text parser
  in prose and a read of every closed anchor's body.
- *Keep the bucket and count a met Definition-of-Done line that names the record.* Rejected: it flags
  #620 and #1412, whose met lines record that the scope left the record open, and it misses #379.
- *Have `/superdev:wrap-up` list the open records its anchor references and ask which to close.*
  Rejected: on 2026-10-29 every such reference was an exclusion, so the question would ask about records
  the scope left open on purpose.

## Consequences

A scope that fixes a record without naming it in its Absorbs line leaves that record open in
`needs planning`. The next plan's triage audit matches it by domain and offers it.

The survey no longer reads a closed anchor's body, which removes the unbounded read per closed anchor
that ADR 0164's Consequences accepted.
