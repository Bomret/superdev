# 0257: A docs untick leaves the suite record alone

**Status:** Accepted

**Amends:** [ADR 0161](0161-a-docs-tagged-criterion-is-settled-by-the-doc-pass.md), whose invalidation of the
tip's suite record at the `submitted` stage is withdrawn.

## Context

Under ADR 0161, a review fix cycle that lands commits at the `submitted` stage unticks every `docs` criterion,
writes an `**Unresolved:**` entry per line, and sets the tip's suite record to `none`. The untick fires only after
a fix cycle landed commits, so the tip is a new commit. Since ADR 0255 the scope review runs no full suite, so no
green record can exist at that tip. The invalidation writes `none` over nothing.

## Decision

The `docs` untick writes its `**Unresolved:**` entries and makes no suite-record write. A standing code defect at
the `submitted` stage still invalidates the tip's record, as `review-scope-holds.md` states.

## Consequences

The `**Unresolved:**` entries hold the scope: `/superdev:document` settles the `docs` lines and clears them, and
`/superdev:ship` asks once before merging over an entry that still stands. Ship's local run takes the evidence at
the tip as it does for any tip without a record.
