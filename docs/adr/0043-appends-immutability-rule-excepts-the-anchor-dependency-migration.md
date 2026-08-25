# 0043: Append's immutability rule excepts the anchor-dependency migration

**Status:** Accepted

**Amends:** [ADR 0004](0004-plan-append-semantics.md).

## Context

ADR 0004 decided that a merged slice is immutable: `/superdev:plan` reads one as fixed context and never
edits, renumbers, closes, or deletes its file or issue. Extending a single-slice feature creates the epic
and "leaves the lone slice byte-identical".

ADR 0040 then gave a scope anchor an **anchor dependency**, and a single-slice feature's anchor is its own
lone slice (ADR 0017). Promoting that feature moves the anchor role to the new epic. The dependency has to
move with it: left on the demoted slice it is read by nobody, so the feature becomes eligible while its
prerequisite has not shipped, which is what ADR 0040 exists to prevent. Moving it is an edit to a merged
record.

The exception shipped with ADR 0040's implementation, stated in `plan-contract.md`, in every store
document, and in `commands/plan.md`. No decision record carried it, so the append contract read as an
unconditional prohibition in the ADR trail and as a prohibition-with-an-exception in the live prose.

`references/domain-modeling.md` states that an ADR is superseded, never edited. Applied here it would mark
ADR 0004 `Superseded` over one bullet of a decision whose other seven still hold, and leave eighteen
documents citing a record flagged as replaced. ADR 0005 already faced the smaller version of this and
recorded that ADR 0004 "is amended (not superseded)" — a treatment the repository used once and never
wrote down.

## Decision

**A merged slice is immutable, except for an anchor-dependency line, which migrates to the new epic when
append promotes a single-slice feature.** Nothing else about that slice changes. The migration removes the
line from the slice, because a dependency recorded in two places is a dependency two readers can disagree
about.

**This is recorded as an amendment to ADR 0004, not a supersession, and amendment becomes a named
treatment.** `references/domain-modeling.md`'s revise-in-place section gains it as a third case beside the
glossary rewrite and the ADR supersession, with the test for which applies: a decision **overturned** is
superseded, and a decision that **stands with a narrow qualification** is amended. An amendment writes its
own ADR, leaves the amended one's `**Status:**` at `Accepted`, and adds an `**Amended by:**` pointer on its
own line — the same shape a supersession's pointer takes, so both stay readable by eye and by tool.

**The exception is drift-enforced.** It is stated in seven documents; a contract row asserts it wherever
the immutability clause appears, so a store document cannot silently return to the unqualified rule.

## Consequences

`references/domain-modeling.md` gains the amendment treatment, and the root `AGENTS.md` routing line that
summarises revise-in-place gains it too. ADR 0004 gains an `**Amended by:**` line and keeps its status and
its text.

The drift check that already asserts each store document's `## Append mode` elements gains one more, and
`commands/plan.md` and `references/plan-contract.md` gain rows of their own, because neither is a store
document. `scripts/AGENTS.md` records what the new assertion covers.

An amended ADR now carries part of its decision elsewhere, so a reader of ADR 0004 alone gets the rule
without its exception. The pointer line is what closes that gap, and it is the cost of not marking a
decision replaced when it was not.

## Considered options

**Supersede ADR 0004.** Rejected. The replacement would restate seven decisions that never changed to
correct one that did, and eighteen citing documents would point at a record marked `Superseded` — either
churned to the replacement or left reading as stale. Superseding is for a decision that was overturned,
and this one was qualified.

**Edit ADR 0004 in place, as ADR 0005 did.** Rejected. It destroys the dated record an ADR exists to be,
and leaves no trace that the rule acquired an exception or why. The amendment keeps the trail intact and
makes the once-informal practice explicit.

**Leave the exception unrecorded.** Rejected: it is the state that prompted this ADR. The live prose and
the decision trail disagreed, and a reader had no way to tell which was current.
