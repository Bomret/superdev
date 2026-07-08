# 0004 — Re-running `/plan` on an existing feature appends; merged slices are immutable

**Status:** Proposed

**Context.** `/plan` writes a feature's slice DAG **once**, in full — the interview (`grilling.md`) runs
until "the design tree is exhausted," and step 6 creates `docs/plans/<feature-slug>/` (or the equivalent
issue-tracker records) from scratch. Nothing defines what happens when `/plan` is invoked a second time
against a `<feature-slug>` that already has slices — a real scenario whenever a feature grows scope after
part of it has already shipped. The local backend assigns slice ids as reading-order file numbers
(`issue-tracker-local.md`) and some of those slices may already be `merged` (code landed on the scope
branch, reviewed, and gone) or mid-flight (`in-progress`/`in-review`) under an active `/implement` run. A
second `/plan` run with no defined semantics risks renumbering ids that `depends-on` edges and merge
history already reference, silently rewriting a merged slice's file (destroying the durable acceptance
record a reviewer gated on), or mutating the DAG while `/implement`'s ledger is mid-walk of it.

**Decision.** `/plan` detects an existing feature directory/epic before writing and, if found, enters
**append mode** instead of create mode:

- **Merged slices are immutable.** `/plan` reads them as fixed context — the same way it reads existing
  code — and never edits, renumbers, or deletes their files/issues.
- **New slices continue the existing numbering.** Ids are never reused or renumbered; a new slice's
  `depends-on` may reference an already-merged slice's id as a satisfied root.
- **The epic / global DoD is amended in place, never replaced.** New criteria are appended to the
  checklist; criteria already satisfied by merged slices are never removed retroactively.
- **Append is refused while a run is active.** If any existing slice is `in-progress`, `in-review`, or
  `blocked`, `/plan` stops and tells the user to wait for `/implement` to finish or check
  `/superdev:status` first — the run's ledger is authoritative mid-execution, and `/plan` mutating the
  DAG underneath it is a race, not a scoping decision.
- The quiz step (plan.md step 5) presents only the **new** slices being added — merged slices aren't
  re-litigated.

**Why.** Hard to reverse: once ids are referenced by merge history and `depends-on` edges across
possibly-parallel worktrees, renumbering or rewriting them corrupts the record `/implement` and its
reviewers already gated on. Surprising without context: `/plan`'s one-shot "exhaust the tree" design
(this AGENTS.md / `grilling.md`) reads as if a feature is planned exactly once, so silent overwrite-on-
rerun would surprise a user who reasonably expects to grow a shipped feature's scope later. Genuine
trade-off: the alternative — always start a fresh feature-slug for added scope — avoids the append logic
entirely but scatters one feature's history across multiple directories/epics and loses the single DoD
that ties them together.

**Consequences.** `commands/plan.md` gains a step 0 check for an existing feature directory/epic before
the interview begins. `references/plan-contract.md` and `references/issue-tracker-local.md` gain append
rules alongside their create-mode rules (numbering continuation, DoD amendment, the active-run refusal).
This ADR defines only the append mechanics for a **known** set of new slices — it does not cover
incremental, partially-specified decomposition (planning a feature too large to fully decompose in one
`/plan` session); that remains open and is out of scope here.

Once append mode is implemented, it also surfaces the epic's `## Parked questions` (ADR 0005) to the user
at the start of the append interview, before diverging into new branches. When the append interview
resolves a parked decision, its line is deleted from `## Parked questions` — the resulting slice's `spec`/
`acceptance` becomes the durable record, not the parking-lot entry (mirrors `domain-modeling.md`'s
revise-in-place rule: never hold two records of the same decision).