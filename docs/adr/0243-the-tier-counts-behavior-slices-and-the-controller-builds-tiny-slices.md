# 0243: The tier counts `behavior` slices, and the controller builds tiny slices

**Status:** Accepted

**Amends:** [ADR 0039](0039-the-unattended-block-keys-on-authorship-not-on-denial.md): the tier a reader derives from
the ledger counts only `behavior` rows, and a `full` run with a `docs` or `mechanical` row counts as authored.

## Context

`/superdev:implement` picked the execution tier by slice count: more than 3 slices ran `full`, with a slicetree, a
dispatched implementer, and a slice review per slice, and 3 or fewer ran `lite`, inline in the scopetree. A plan of
two `behavior` slices and four rename or documentation slices therefore ran `full`, and paid for six implementer
dispatches and the parallel machinery, although only the two `behavior` slices get a slice review and only they
need test-first work under isolation.

A `mechanical` or `docs` slice already skips the per-slice review in the `full` tier, and its net is the existing
suite plus the scope review's exit run. A `docs` slice, or a `mechanical` slice whose `spec` names one file, is
small enough that a dispatch costs more than the edit: the implementer reads its brief, the slice, and its
references before it makes a change the controller could make in a few tool calls.

## Decision

1. **Only `behavior` slices count toward the threshold.** More than 3 loaded `behavior` slices is `full`.
   Otherwise the run is `lite`, whatever the number of `mechanical` and `docs` slices. A reader that derives the
   tier from the ledger counts the rows whose type reads `behavior`. A ledger with no slice rows, or with a row
   whose type cannot be read, leaves the tier unknown, and an unknown tier takes each reader's blocking answer as
   before.
2. **A tiny slice is the controller's.** In a `full` run, a `docs` slice and a `mechanical` slice whose `spec` names
   a single file get no implementer dispatch. The controller builds the slice itself in the slice's own slicetree,
   cut and prepared as for a dispatched slice, with an implementer's disciplines and test runs. The progress log,
   the store and ledger status moves, the merge, the interface record, the ticks, and the run trace stay the same.
   `implement-full.md`'s DAG loop step 2 states it, and the implement skill's **Who dispatches** names it.
3. **The authorship proxy follows.** For an unattended denied verification dispatch, `lite` counts as authored, as
   before. `full` counts as authored when a slice row reads `docs` or `mechanical`, because the ledger does not
   record which `mechanical` slice was one-file, and otherwise does not. A denied `slice-reviewer` is unchanged:
   it reviews a `behavior` slice, which a dispatched implementer built.

## Consequences

- A plan heavy in renames and documentation runs `lite`: one inline test-first loop, the inline doc pass, and no
  per-slice dispatch. The lite playbook already iterates every slice in `depends-on` order, so it needs no change
  beyond its stated scope.
- A `full` run makes fewer dispatches. A tiny slice takes no place under the concurrency cap, so the controller
  builds it between dispatches.
- The controller now edits files in a slicetree. `tree-guard.js` fences dispatched implementers only, and no hook
  fences the controller, so a tiny slice relies on the playbook's prose for the slicetree as its tree. `merge-guard`
  is unaffected, since the controller already merges.
- An unattended `full` run with a `docs` or `mechanical` slice now blocks on a denied `final-reviewer` or
  `doc-reader` dispatch, where it reviewed inline before. That is the conservative side of ADR 0039's proxy.
- The store seeds state the threshold in their **Lite execution tier** line, so `/superdev:setup` offers the new
  wording to a configured store document as a seed gap.

## Considered options

- **Weight slices, counting a `mechanical` or `docs` slice as a fraction.** It keeps one number, but no fraction
  matches the cost: these slices need neither isolation nor review, so they add nothing to the case for `full`.
- **Dispatch every tiny slice on `haiku`.** The model table already does that for a `mechanical` slice. The cost a
  dispatch adds is the brief and the cold read, not the model.
- **Build every `mechanical` slice in the controller.** A multi-file move or rename is wide enough that an isolated
  implementer with its own self-check keeps its value.
