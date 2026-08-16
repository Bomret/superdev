# 0004 — Re-running `/plan` on an existing feature appends; merged slices are immutable

**Status:** Proposed

**Context.** `/plan` writes a feature's slice DAG **once**, in full — the interview (`cross-exam.md`) runs
until "the design tree is exhausted," and step 6 creates `docs/plans/<feature-slug>/` (or the equivalent
issue-tracker records) from scratch. Nothing defines what happens when `/plan` is invoked a second time
against a `<feature-slug>` that already has slices — a real scenario whenever a feature grows scope after
part of it has already shipped. The local backend assigns slice ids as reading-order file numbers
(`issue-tracker-local.md`) and some of those slices may already be `merged` (code landed on the scope
branch, reviewed, and gone) or mid-flight (`in-progress`/`in-review`) under an active `/implement` run. A
second `/plan` run with no defined semantics risks renumbering ids that `depends-on` edges and merge
history already reference, silently rewriting a merged slice's file (destroying the durable acceptance
record a reviewer gated on), or mutating the DAG while `/implement`'s ledger is mid-walk of it.

**Decision.** `/plan` asks at step 0, before the interview begins, whether this run extends a feature
that already has slices or plans a new one. Answering *extend* enters **append mode** instead of create
mode:

- **The user names the feature; `/plan` never infers it.** A store carries a feature label per feature
  and keeps it after the feature ships, so the list only grows, and this repository's own store already
  carries dozens.
  Answering *new* therefore makes no store call at all, and only *extend* lists the labels to pick from.
  Detection cannot wait for step 1 to pick a label, because the epic's parked questions and its shipped
  slices are the context the append interview needs from its first question.
- **Merged slices are immutable.** `/plan` reads them as fixed context — the same way it reads existing
  code — and never edits, renumbers, closes, or deletes their files/issues.
- **Ids are never reused or renumbered.** A new slice's `depends-on` may reference an already-merged
  slice's id as a satisfied root. Only the local-file store owes anything further: its `id` is the
  zero-padded file number `/plan` itself assigns, so append continues that numbering from the highest
  number present. An issue backend's `id` is the key its server assigns, which is unique and stable
  already.
- **The epic / global DoD is amended in place, never replaced.** New criteria are appended to the
  checklist; criteria already satisfied by merged slices are never removed retroactively.
- **Extending a single-slice feature creates the epic first.** A single-slice feature has no epic: its
  lone slice carries the global DoD in `acceptance` and is its own scope anchor. A second slice under one
  feature label with no epic is the shape a store cannot resolve (`plan-contract.md` → *Scope anchor*).
  So append creates the epic, copies the lone slice's `acceptance` into it as the global DoD, amends that
  with the new criteria, and leaves the lone slice byte-identical. The text then exists twice, and the two
  are different records: the slice's is what a reviewer gated that slice on, the epic's is what the
  feature is held to now. Load order already separates them — an epic present is the DoD, so nothing
  reads two.
- **Append is refused while a run is active, and writes nothing.** Two signals, either of which refuses.
  The **store** holds a slice that is `in-progress`, `in-review`, or `blocked`. The **ledger** for that
  scope exists with a stage other than `shipped`. The store signal is the shared one and sees a run on
  another machine; the ledger signal is local and catches the window the store cannot see, where every
  slice is merged but the chain has not finished — appending there adds DoD criteria the open pull
  request will never carry, and `/superdev:ship` then ticks a Definition of Done its own branch does not
  satisfy. The refusal names which signal fired and what clears it. There is no override argument: the
  escape is fixing the state, which is what makes the refusal mean anything.
- The quiz step (plan.md step 5) presents only the **new** slices being added — merged slices aren't
  re-litigated.

**Why.** Hard to reverse: once ids are referenced by merge history and `depends-on` edges across
possibly-parallel worktrees, renumbering or rewriting them corrupts the record `/implement` and its
reviewers already gated on. Surprising without context: `/plan`'s one-shot "exhaust the tree" design
(this AGENTS.md / `cross-exam.md`) reads as if a feature is planned exactly once, so silent overwrite-on-
rerun would surprise a user who reasonably expects to grow a shipped feature's scope later. Genuine
trade-off: the alternative — always start a fresh feature-slug for added scope — avoids the append logic
entirely but scatters one feature's history across multiple directories/epics and loses the single DoD
that ties them together.

**Consequences.** `commands/plan.md` gains the step 0 question, the refusal, the epic promotion, and an
append write path. `references/plan-contract.md` gains the generic `## Append mode` contract, and every
store document — the four `references/issue-tracker-*.md` seeds plus a repository's own
`docs/agents/issue-tracker.md` — renders it for its own backend. A drift-check contract holds them in
agreement, because an append rule that reaches three seeds out of four leaves the fourth backend with the
undefined behaviour this ADR exists to remove.

`/superdev:implement` carries two consequences of its own, and append is unsafe to use without them.
Phase 0 passes each loaded slice's real status to `scope.js init`, which already accepts one and defaults
it to `todo` — without that, a second run over an appended feature seeds every shipped slice as `todo`
and dispatches it again. Phase 0 also reads the stage before choosing between resume and init: a run root
whose ledger reads `shipped` has its `ledger.md` rotated aside and a fresh one written beside it, because
the run root outlives the run by ADR 0007's seven-day trail and the resume path would otherwise resume a
finished run. Rotation keeps that trail rather than deleting it, so ADR 0007 stands unchanged.

This ADR defines only the append mechanics for a **known** set of new slices — it does not cover
incremental, partially-specified decomposition (planning a feature too large to fully decompose in one
`/plan` session); that remains open and is out of scope here.

Once append mode is implemented, it also surfaces the epic's `## Parked questions` (ADR 0005) to the user
at the start of the append interview, before diverging into new branches. When the append interview
resolves a parked decision, its line is deleted from `## Parked questions` — the resulting slice's `spec`/
`acceptance` becomes the durable record, not the parking-lot entry (mirrors `domain-modeling.md`'s
revise-in-place rule: never hold two records of the same decision).