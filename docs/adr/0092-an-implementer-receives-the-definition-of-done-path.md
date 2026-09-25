# 0092: An implementer receives the Definition of Done path

**Status:** Accepted

**Context.** The full tier's dispatch handed each implementer "only its own specifics … Not the whole
plan" (`references/implement-full.md`), a rule with no recorded rationale. Under ADR 0091 an implementer
reports on the Definition-of-Done criteria mapped to its slice, so it needs to read them, and the
criteria live in `<run-root>/dod.md`, not in its slice's `spec` or `acceptance`.

**Decision.** The dispatch hands the implementer the **path** to `<run-root>/dod.md`, never its text,
plus the exact listed lines the dispatch covers — the `dod.md` lines `dod-ticks.md`'s mapping gate
matches to this slice through the ledger's `issue` column (`id` before any issue exists, the store's own
notation once `/superdev:plan` rewrites it) — alongside the slice's own specifics (the ADR 0020 pattern: a
path read on demand, not inlined context). The implementer builds only its own slice, reports on those
listed lines, and leaves every other criterion alone: reading the whole DoD informs the report, and widens
nothing it builds. Its slice `spec` and `acceptance` stay the boundary of the work, and scope creep stays
out the way it always did — through the slice-reviewer and the review gate, which judge the diff against
the slice, not against the DoD.

**Considered options.**

- *Plan-only tagging, the implementer never sees the DoD.* The controller would have to judge each mapped
  criterion from the diff alone; the implementer, which holds the evidence, would report none of it.
- *Inline the mapped criteria into the dispatch.* A second copy of the text to drift from `dod.md`, and
  the scope-level criteria that frame the slice's own would be missing.
